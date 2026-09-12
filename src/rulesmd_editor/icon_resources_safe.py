from __future__ import annotations

from pathlib import Path
from typing import Any

from . import icon_resources as base
from .icon_resources_persistent import PersistentIconResourceService
from .mix_extract import extract_yuri_artmd


_MIN_ARTMD_BYTES = 4096
_MIN_ARTMD_SECTIONS = 16


class SafeIconResourceService(PersistentIconResourceService):
    """Game-sync layer that never creates a destructive empty artmd.ini.

    Yuri's Revenge normally reads artmd.ini from ra2md.mix -> localmd.mix. A loose
    artmd.ini in the game directory overrides that archive resource, so creating a new
    two-line file for CameoPCX would hide the complete stock ArtMD and crash the game.
    Before writing any ArtMD icon key we therefore ensure that a substantial loose
    artmd.ini exists, automatically extracting the stock file when needed.
    """

    def __init__(self, workspace: Any):
        super().__init__(workspace)
        self._last_artmd_prepare: dict[str, Any] | None = None

    @staticmethod
    def _artmd_looks_complete(path: Path) -> bool:
        if not path.is_file():
            return False
        try:
            if path.stat().st_size < _MIN_ARTMD_BYTES:
                return False
            doc = base.IniDocument.load(path)
            return len(doc.sections()) >= _MIN_ARTMD_SECTIONS
        except (OSError, UnicodeError, ValueError):
            return False

    @staticmethod
    def _merge_existing_rows(source: Path, target: Path) -> None:
        """Overlay keys from an existing partial ArtMD onto the extracted stock file."""
        try:
            old_doc = base.IniDocument.load(source)
        except Exception:
            return
        if not old_doc.sections():
            return

        new_doc = base.IniDocument.load(target)
        for section in old_doc.sections():
            for key, value in old_doc.items(section):
                if key:
                    new_doc.set(section, key, value)
        new_doc.save(target)

    def _ensure_artmd_for_write(self) -> dict[str, Any]:
        path = self.artmd_path()
        root = self.game_root()
        if path is None or root is None:
            raise ValueError("请先在设置中指定游戏路径，或打开游戏目录中的规则文件")

        if self._artmd_looks_complete(path):
            result = {
                "autoExtracted": False,
                "repairedIncomplete": False,
                "source": "",
                "backup": "",
                "path": str(path),
            }
            self._last_artmd_prepare = result
            return result

        previous_bytes = b""
        had_existing = path.is_file()
        backup_path: Path | None = None
        if had_existing:
            try:
                previous_bytes = path.read_bytes()
            except OSError:
                previous_bytes = b""
            backup_path = path.with_name(path.name + ".rulesmd-incomplete.bak")
            if previous_bytes and not backup_path.exists():
                backup_path.write_bytes(previous_bytes)

        try:
            artmd_bytes, source = extract_yuri_artmd(root)
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_name(path.name + ".rulesmd-extract.tmp")
            tmp.write_bytes(artmd_bytes)
            tmp.replace(path)

            if had_existing and backup_path is not None and backup_path.is_file():
                self._merge_existing_rows(backup_path, path)

            if not self._artmd_looks_complete(path):
                raise RuntimeError("自动提取后的 artmd.ini 完整性检查失败")
        except Exception:
            try:
                if previous_bytes:
                    path.write_bytes(previous_bytes)
                elif path.exists():
                    path.unlink()
            except OSError:
                pass
            raise

        result = {
            "autoExtracted": True,
            "repairedIncomplete": had_existing,
            "source": source,
            "backup": str(backup_path) if backup_path is not None and backup_path.is_file() else "",
            "path": str(path),
        }
        self._last_artmd_prepare = result
        return result

    def set_artmd_icon(
        self,
        section: str,
        cameo: str | None = None,
        cameo_pcx: str | None = None,
        alt_cameo_pcx: str | None = None,
    ) -> dict[str, Any]:
        prepared = self._ensure_artmd_for_write()
        result = super().set_artmd_icon(
            section=section,
            cameo=cameo,
            cameo_pcx=cameo_pcx,
            alt_cameo_pcx=alt_cameo_pcx,
        )
        result.update(prepared)
        return result

    def import_custom_icon(
        self,
        kind: str,
        target_id: str,
        data_base64: str,
        filename: str = "",
        sync_game: bool = True,
        variant: str = "cameo",
        crop_zoom: float = 1.0,
        crop_x: float = 0.5,
        crop_y: float = 0.5,
    ) -> dict[str, Any]:
        self._last_artmd_prepare = None
        result = super().import_custom_icon(
            kind=kind,
            target_id=target_id,
            data_base64=data_base64,
            filename=filename,
            sync_game=sync_game,
            variant=variant,
            crop_zoom=crop_zoom,
            crop_x=crop_x,
            crop_y=crop_y,
        )
        sync = result.get("sync")
        if isinstance(sync, dict) and self._last_artmd_prepare:
            sync.update({
                "artmd_auto_extracted": bool(self._last_artmd_prepare.get("autoExtracted")),
                "artmd_repaired_incomplete": bool(self._last_artmd_prepare.get("repairedIncomplete")),
                "artmd_source": str(self._last_artmd_prepare.get("source", "")),
                "artmd_backup": str(self._last_artmd_prepare.get("backup", "")),
            })
        return result
