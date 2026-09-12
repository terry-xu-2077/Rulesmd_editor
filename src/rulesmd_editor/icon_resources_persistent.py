from __future__ import annotations

import base64
import shutil
from io import BytesIO
from typing import Any

from PIL import Image

from . import icon_resources as base

_STORAGE_MARKER = "single-atlas-v1"


class PersistentIconResourceService(base.IconResourceService):
    """Store editor-only user icons directly in compact custom Tile atlases.

    Durable user data is limited to icons.json plus the custom atlases that actually
    contain icons. Existing loose Mod PCX resources are read only for application-side
    display and are composed into an in-memory atlas; no game files are ever written.
    """

    def __init__(self, workspace: Any):
        super().__init__(workspace)
        self._migrate_legacy_storage()

    @staticmethod
    def _kind_rows(meta: dict[str, Any], kind: str) -> dict[str, Any]:
        rows = meta.get(kind, {})
        return rows if isinstance(rows, dict) else {}

    @staticmethod
    def _cell_size(kind: str) -> tuple[int, int]:
        return base.UNIT_CELL if kind == "unit" else base.COUNTRY_CELL

    @staticmethod
    def _tile_path(kind: str):
        return base.CUSTOM_UNIT_TILE if kind == "unit" else base.CUSTOM_COUNTRY_TILE

    @staticmethod
    def _image_data_url(image: Image.Image) -> str:
        payload = BytesIO()
        image.convert("RGBA").save(payload, format="PNG")
        return "data:image/png;base64," + base64.b64encode(payload.getvalue()).decode("ascii")

    @staticmethod
    def _entry_slot(entry: Any) -> int:
        if not isinstance(entry, dict):
            return 0
        try:
            return max(0, int(entry.get("slot", 0)))
        except (TypeError, ValueError):
            return 0

    def _load_tile(self, kind: str, minimum_slot: int = 0) -> Image.Image:
        width, height = self._cell_size(kind)
        sheet_width = width * base.ATLAS_COLUMNS
        required_rows = max(1, minimum_slot // base.ATLAS_COLUMNS + 1)
        required_height = height * required_rows
        current = base._load_image(self._tile_path(kind))
        if current is not None and current.width == sheet_width and current.height >= required_height:
            return current
        target_height = max(required_height, current.height if current is not None else height)
        atlas = Image.new("RGBA", (sheet_width, target_height), (0, 0, 0, 0))
        if current is not None:
            crop = current.crop((0, 0, min(current.width, sheet_width), min(current.height, target_height)))
            atlas.alpha_composite(crop, (0, 0))
        return atlas

    def _save_tile(self, kind: str, atlas: Image.Image) -> None:
        path = self._tile_path(kind)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        atlas.convert("RGBA").save(tmp, format="PNG")
        tmp.replace(path)

    def _delete_tile(self, kind: str) -> None:
        try:
            self._tile_path(kind).unlink()
        except FileNotFoundError:
            pass

    def _atlas_cell(self, kind: str, entry: dict[str, Any]) -> Image.Image | None:
        tile = base._load_image(self._tile_path(kind))
        if tile is None:
            return None
        width, height = self._cell_size(kind)
        slot = self._entry_slot(entry)
        col = slot % base.ATLAS_COLUMNS
        row = slot // base.ATLAS_COLUMNS
        left = col * width
        top = row * height
        if left + width > tile.width or top + height > tile.height:
            return None
        cell = tile.crop((left, top, left + width, top + height)).convert("RGBA")
        return cell if cell.getbbox() is not None else None

    def _put_cell(self, kind: str, slot: int, image: Image.Image) -> None:
        width, height = self._cell_size(kind)
        atlas = self._load_tile(kind, slot)
        col = slot % base.ATLAS_COLUMNS
        row = slot // base.ATLAS_COLUMNS
        left = col * width
        top = row * height
        atlas.paste((0, 0, 0, 0), (left, top, left + width, top + height))
        atlas.alpha_composite(base._normalize_image(image, width, height), (left, top))
        self._save_tile(kind, atlas)

    def _legacy_image(self, kind: str, stored_id: str, entry: dict[str, Any]) -> Image.Image | None:
        """Recover old editor icons before removing retired per-object/game-sync metadata."""
        current = self._atlas_cell(kind, entry)
        if current is not None:
            return current

        generated = base._load_image(base._source_path(kind, stored_id))
        if generated is not None:
            return generated

        original = base._load_image(base._original_path(kind, stored_id))
        if original is not None:
            width, height = self._cell_size(kind)
            crop = base._crop_meta(entry)
            return base._crop_image(original, width, height, crop["zoom"], crop["x"], crop["y"])

        # One-time read-only recovery for icons created by the retired game-sync path.
        root = self.game_root()
        game_file = str(entry.get("game_file", "")).strip()
        if root is not None and game_file:
            path = base._resolve_relative_case_insensitive(root, game_file)
            if path is not None:
                try:
                    return base.read_pcx(path)
                except (OSError, ValueError):
                    pass
        return None

    def _repack_kind(self, kind: str, meta: dict[str, Any]) -> None:
        rows = self._kind_rows(meta, kind)
        snapshots: list[tuple[str, dict[str, Any], Image.Image]] = []
        ordered = sorted(rows.items(), key=lambda item: (self._entry_slot(item[1]), item[0].casefold()))
        for stored_id, entry in ordered:
            if not isinstance(entry, dict):
                continue
            image = self._legacy_image(kind, stored_id, entry)
            if image is not None:
                snapshots.append((stored_id, entry, image))

        if not snapshots:
            meta[kind] = {}
            self._delete_tile(kind)
            return

        width, height = self._cell_size(kind)
        row_count = (len(snapshots) + base.ATLAS_COLUMNS - 1) // base.ATLAS_COLUMNS
        atlas = Image.new("RGBA", (width * base.ATLAS_COLUMNS, height * row_count), (0, 0, 0, 0))
        clean_rows: dict[str, Any] = {}
        for slot, (stored_id, entry, image) in enumerate(snapshots):
            col = slot % base.ATLAS_COLUMNS
            row = slot // base.ATLAS_COLUMNS
            atlas.alpha_composite(base._normalize_image(image, width, height), (col * width, row * height))
            clean_rows[stored_id] = {
                "slot": slot,
                "source_name": str(entry.get("source_name", "")),
            }
        meta[kind] = clean_rows
        self._save_tile(kind, atlas)

    @staticmethod
    def _remove_legacy_files() -> None:
        for folder in (base.SOURCE_ROOT, base.ORIGINAL_ROOT):
            try:
                shutil.rmtree(folder)
            except FileNotFoundError:
                pass
        for path in (base.RESOLVED_UNIT_TILE, base.RESOLVED_COUNTRY_TILE):
            try:
                path.unlink()
            except FileNotFoundError:
                pass

    def _migrate_legacy_storage(self) -> None:
        meta = base._read_meta()
        needs_repack = meta.get("storage") != _STORAGE_MARKER
        if not needs_repack:
            for kind in ("unit", "country"):
                rows = self._kind_rows(meta, kind)
                if any(isinstance(entry, dict) and "game_file" in entry for entry in rows.values()):
                    needs_repack = True
                    break

        if needs_repack:
            for kind in ("unit", "country"):
                self._repack_kind(kind, meta)
            meta["storage"] = _STORAGE_MARKER
            base._write_meta(meta)
        self._remove_legacy_files()

    def _stored_custom_image(
        self,
        kind: str,
        target_id: str,
        meta: dict[str, Any] | None = None,
    ) -> Image.Image | None:
        meta = meta or base._read_meta()
        rows = self._kind_rows(meta, kind)
        _stored_id, entry = base._entry_for(rows, target_id)
        return self._atlas_cell(kind, entry) if entry is not None else None

    def _custom_image(self, kind: str, target_id: str) -> Image.Image | None:
        return self._stored_custom_image(kind, target_id)

    def custom_icon_source(self, kind: str, target_id: str) -> dict[str, Any]:
        clean_kind = str(kind).strip().lower()
        clean_id = str(target_id).strip()
        empty = {
            "exists": False,
            "image": "",
            "sourceName": "",
            "crop": {"zoom": 1.0, "x": 0.5, "y": 0.5},
            "hasOriginal": False,
        }
        if clean_kind not in {"unit", "country"} or not clean_id:
            return empty
        meta = base._read_meta()
        stored_id, entry = base._entry_for(self._kind_rows(meta, clean_kind), clean_id)
        if stored_id is None or entry is None:
            return empty
        image = self._atlas_cell(clean_kind, entry)
        if image is None:
            return empty
        return {
            "exists": True,
            "image": self._image_data_url(image),
            "sourceName": str(entry.get("source_name", "")) or "已有用户图标",
            "crop": {"zoom": 1.0, "x": 0.5, "y": 0.5},
            "hasOriginal": False,
        }

    def _memory_atlas(
        self,
        kind: str,
        rows: list[tuple[str, Image.Image, str, str]],
    ) -> tuple[str, dict[str, dict[str, Any]]]:
        width, height = self._cell_size(kind)
        ordered = sorted(rows, key=lambda item: item[0].casefold())
        row_count = max(1, (len(ordered) + base.ATLAS_COLUMNS - 1) // base.ATLAS_COLUMNS)
        atlas = Image.new("RGBA", (width * base.ATLAS_COLUMNS, height * row_count), (0, 0, 0, 0))
        registry: dict[str, dict[str, Any]] = {}
        for slot, (target_id, icon, source, game_file) in enumerate(ordered):
            col = slot % base.ATLAS_COLUMNS
            row = slot // base.ATLAS_COLUMNS
            atlas.alpha_composite(base._normalize_image(icon, width, height), (col * width, row * height))
            registry[target_id] = {
                "x": col * width,
                "y": row * height,
                "cellWidth": width,
                "cellHeight": height,
                "source": source,
                "gameFile": game_file,
            }
        return self._image_data_url(atlas), registry

    def library_snapshot(self) -> dict[str, Any]:
        meta = base._read_meta()
        root = self.game_root()
        doc = self._doc()
        art_path = self.artmd_path()
        artmd = base._load_artmd(art_path) if art_path is not None else base.IniDocument.from_text("")
        targets = self.targets()
        target_by_key = {(target["kind"], target["id"].casefold()): target for target in targets}

        unit_rows: list[tuple[str, Image.Image, str, str]] = []
        country_rows: list[tuple[str, Image.Image, str, str]] = []
        custom_keys: set[tuple[str, str]] = set()

        for kind in ("unit", "country"):
            for stored_id, entry in self._kind_rows(meta, kind).items():
                if not isinstance(entry, dict):
                    continue
                image = self._atlas_cell(kind, entry)
                if image is None:
                    continue
                target = target_by_key.get((kind, stored_id.casefold()))
                visible_id = target["id"] if target is not None else stored_id
                row = (visible_id, image, "custom", "")
                (country_rows if kind == "country" else unit_rows).append(row)
                custom_keys.add((kind, visible_id.casefold()))

        # Existing loose Mod PCX resources are read-only inputs for application display.
        for target in targets:
            kind = target["kind"]
            target_id = target["id"]
            if (kind, target_id.casefold()) in custom_keys or root is None or doc is None:
                continue
            if kind == "unit":
                mod, game_file = self._mod_unit_image(target["art_section"] or target_id, artmd, root)
                if mod is not None:
                    unit_rows.append((target_id, mod, "mod", game_file))
            else:
                mod, game_file = self._mod_country_image(target_id, doc, root)
                if mod is not None:
                    country_rows.append((target_id, mod, "mod", game_file))

        unit_tile, unit_registry = self._memory_atlas("unit", unit_rows)
        country_tile, country_registry = self._memory_atlas("country", country_rows)
        return {
            "version": 2,
            "unitTile": unit_tile,
            "countryTile": country_tile,
            "unit": unit_registry,
            "country": country_registry,
            "targets": targets,
            "artmd": self.artmd_snapshot(),
            "gameRoot": str(root) if root else "",
            "customCount": sum(len(self._kind_rows(meta, kind)) for kind in ("unit", "country")),
        }

    def import_custom_icon(
        self,
        kind: str,
        target_id: str,
        data_base64: str,
        filename: str = "",
        crop_zoom: float = 1.0,
        crop_x: float = 0.5,
        crop_y: float = 0.5,
    ) -> dict[str, Any]:
        clean_kind = str(kind).strip().lower()
        clean_id = str(target_id).strip()
        if clean_kind not in {"unit", "country"}:
            raise ValueError("图标类型必须是 unit 或 country")
        if not clean_id:
            raise ValueError("单位或国家 ID 不能为空")

        meta = base._read_meta()
        rows = self._kind_rows(meta, clean_kind)
        stored_id, _entry = base._entry_for(rows, clean_id)
        if stored_id is not None:
            clean_id = stored_id
        else:
            target = next(
                (
                    item
                    for item in self.targets()
                    if item["kind"] == clean_kind and item["id"].casefold() == clean_id.casefold()
                ),
                None,
            )
            if target is not None:
                clean_id = target["id"]

        image = base._load_image_bytes(base._decode_upload(data_base64))
        zoom = base._clamp(float(crop_zoom), 1.0, 8.0)
        center_x = base._clamp(float(crop_x), 0.0, 1.0)
        center_y = base._clamp(float(crop_y), 0.0, 1.0)
        width, height = self._cell_size(clean_kind)
        cropped = base._crop_image(image, width, height, zoom, center_x, center_y)

        rows = self._kind_rows(meta, clean_kind)
        existing = rows.get(clean_id) if isinstance(rows.get(clean_id), dict) else None
        if existing is None:
            existing = {"slot": base._allocate_slot(rows)}
        slot = self._entry_slot(existing)
        self._put_cell(clean_kind, slot, cropped)
        rows[clean_id] = {
            "slot": slot,
            "source_name": str(filename).strip(),
        }
        meta[clean_kind] = rows
        meta["storage"] = _STORAGE_MARKER
        base._write_meta(meta)

        self._remove_legacy_files()
        return self.library_snapshot()

    def remove_custom_icon(self, kind: str, target_id: str) -> dict[str, Any]:
        clean_kind = str(kind).strip().lower()
        clean_id = str(target_id).strip()
        if clean_kind not in {"unit", "country"}:
            raise ValueError("图标类型必须是 unit 或 country")
        meta = base._read_meta()
        rows = self._kind_rows(meta, clean_kind)
        stored_id, _entry = base._entry_for(rows, clean_id)
        if stored_id is not None:
            rows.pop(stored_id, None)
        meta[clean_kind] = rows
        self._repack_kind(clean_kind, meta)
        meta["storage"] = _STORAGE_MARKER
        base._write_meta(meta)
        self._remove_legacy_files()
        return self.library_snapshot()
