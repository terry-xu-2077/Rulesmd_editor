from __future__ import annotations

from pathlib import Path
import re

from .csf_file import CsfDocument, CsfFormatError
from .ini_document import IniDocument
from .mix_file import extract_rules
from .workspace import RulesWorkspace


_STRINGTABLE_RE = re.compile(r"^stringtable(\d{1,2})\.csf$", re.IGNORECASE)


class MixRulesWorkspace(RulesWorkspace):
    """Desktop workspace with MIX import and loose CSF companion support.

    MIX files remain read-only import sources. Rules edits are saved as a loose INI.
    New UIName strings are written to ``stringtable99.csf`` next to that output INI,
    which follows the game's external string-table override mechanism.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.source_root: Path | None = None
        self.source_rules_name = "rulesmd.ini"
        self._string_tables: list[CsfDocument] = []
        self._companion_csf_error: str | None = None
        self._pending_csf: dict[str, tuple[str, str]] = {}

    def _reset_companion_context(self, root: Path | None, rules_name: str) -> None:
        self.source_root = root
        self.source_rules_name = rules_name or "rulesmd.ini"
        self._string_tables = []
        self._companion_csf_error = None
        self._pending_csf = {}

        if root is None or not root.is_dir():
            return

        candidates: list[tuple[int, Path]] = []
        try:
            children = list(root.iterdir())
        except OSError:
            return
        for child in children:
            match = _STRINGTABLE_RE.match(child.name)
            if child.is_file() and match:
                candidates.append((int(match.group(1)), child))
        candidates.sort(key=lambda item: (item[0], item[1].name.casefold()))

        for number, path in candidates:
            try:
                self._string_tables.append(CsfDocument.load(path))
            except (OSError, CsfFormatError) as exc:
                # A broken stringtable99 must never be silently overwritten. Lower
                # tables are reference sources only, so they can be ignored safely.
                if number == 99:
                    self._companion_csf_error = f"{path.name} 无法读取：{exc}"

    def _find_stringtable99(self, root: Path) -> Path:
        try:
            for child in root.iterdir():
                if child.is_file() and child.name.casefold() == "stringtable99.csf":
                    return child
        except OSError:
            pass
        return root / "stringtable99.csf"

    def _lookup_csf(self, label: str) -> str | None:
        pending = self._pending_csf.get(label.casefold())
        if pending is not None:
            return pending[1]
        for table in reversed(self._string_tables):
            value = table.get(label)
            if value is not None:
                return value
        return None

    def _section_label(self, section: str) -> str:
        ui_name = self._last_values.get((section.casefold(), "uiname"), "").strip()
        if ui_name:
            localized = self._lookup_csf(ui_name)
            if localized:
                return localized
        return super()._section_label(section)

    def new_document(self) -> dict:
        self._reset_companion_context(None, "rulesmd.ini")
        return super().new_document()

    def open_file(self, path: str | Path) -> dict:
        source = Path(path)
        if source.suffix.casefold() != ".mix":
            self._reset_companion_context(source.parent, source.name)
            return super().open_file(source)

        extracted = extract_rules(source)
        self._reset_companion_context(source.parent, extracted.filename)
        self.document = _ini_document_from_bytes(extracted.data)
        # A MIX is an import source, not a writable INI path. Keeping path unset makes
        # the existing Save flow ask for a loose INI and can never overwrite the archive.
        self.document.path = None
        self.document_kind = "rules"
        self.base_document = None
        self._capture_baseline()
        return self.snapshot()

    def snapshot(self) -> dict:
        result = super().snapshot()
        result["companion"] = {
            "suggested_rules_name": self.source_rules_name,
            "source_root": str(self.source_root) if self.source_root else None,
            "csf_name": "stringtable99.csf",
            "csf_error": self._companion_csf_error,
            "pending_strings": len(self._pending_csf),
        }
        return result

    def create_unit(
        self,
        *,
        template: str,
        section: str,
        comment: str,
        included_line_ids: list[int] | None = None,
    ) -> dict:
        result = super().create_unit(
            template=template,
            section=section,
            comment=comment,
            included_line_ids=included_line_ids,
        )
        if self.is_map_document():
            return result

        display_name = comment.strip()
        if display_name:
            actual = result["section"]["section"]
            label = f"Name:{actual}"
            self._pending_csf[label.casefold()] = (label, display_name)
            # UIName now has a real localized value. Refresh the visible name and the
            # companion metadata immediately instead of waiting until Save.
            self._rebuild_indexes()
            result["snapshot"] = self.snapshot()
            result["section"] = self.section(actual)
        return result

    def _prepare_companion_csf(self, root: Path) -> tuple[Path, CsfDocument] | None:
        if not self._pending_csf:
            return None
        path = self._find_stringtable99(root)
        if path.exists():
            try:
                document = CsfDocument.load(path)
            except (OSError, CsfFormatError) as exc:
                raise ValueError(
                    f"已有 {path.name} 无法读取，为避免覆盖损坏文件已取消保存：{exc}"
                ) from exc
        else:
            document = CsfDocument.new()

        for label, value in self._pending_csf.values():
            document.set(label, value)
        # Validate all encodings before the Rules INI itself is written.
        document.to_bytes()
        return path, document

    def save(self, path: str | Path | None = None) -> dict:
        target = Path(path) if path else self._doc().path
        if target is None:
            raise ValueError("No output path")

        companion = self._prepare_companion_csf(target.parent)
        result = super().save(target)
        csf_path: Path | None = None
        if companion is not None:
            csf_path, document = companion
            document.save(csf_path)
            self._pending_csf.clear()

        self._reset_companion_context(target.parent, target.name)
        return {
            "path": result["path"],
            "dirty": False,
            "csf_path": str(csf_path) if csf_path else None,
        }


def _ini_document_from_bytes(data: bytes) -> IniDocument:
    candidates: list[str] = []
    if data.startswith(b"\xef\xbb\xbf"):
        candidates.append("utf-8-sig")
    if data.startswith((b"\xff\xfe", b"\xfe\xff")):
        candidates.append("utf-16")
    candidates.extend(("utf-8", "gb18030", "cp1252"))

    last_error: UnicodeDecodeError | None = None
    for encoding in candidates:
        try:
            return IniDocument.from_text(data.decode(encoding), encoding=encoding)
        except UnicodeDecodeError as exc:
            last_error = exc
    if last_error is not None:
        raise last_error
    raise UnicodeDecodeError("utf-8", b"", 0, 1, "cannot decode Rules INI")
