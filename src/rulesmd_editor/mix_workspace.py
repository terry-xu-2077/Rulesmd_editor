from __future__ import annotations

from pathlib import Path
import re

from .csf_file import CsfDocument, CsfFormatError
from .ini_document import IniDocument
from .mix_file import MixArchive, MixFormatError, extract_rules
from .workspace import RulesWorkspace


_STRINGTABLE_RE = re.compile(r"^stringtable(\d{1,2})\.csf$", re.IGNORECASE)


def _vanilla_csf_names(rules_name: str) -> tuple[str, str]:
    if Path(rules_name).name.casefold() == "rules.ini":
        return "ra2.csf", "language.mix"
    return "ra2md.csf", "langmd.mix"


class MixRulesWorkspace(RulesWorkspace):
    """Desktop workspace with MIX import and CSF companion support.

    MIX files remain read-only import sources. With Ares enabled, new UI strings go
    to a loose language-neutral ``stringtable99.csf``. In vanilla mode, the editor
    starts from the full original ``ra2md.csf`` / ``ra2.csf`` (loose or extracted
    from the language MIX), merges the new strings, and writes a loose full CSF.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.source_root: Path | None = None
        self.source_rules_name = "rulesmd.ini"
        self._string_tables: list[CsfDocument] = []
        self._base_csf: CsfDocument | None = None
        self._base_csf_name: str | None = None
        self._base_csf_error: str | None = None
        self._companion_csf_error: str | None = None
        self._pending_csf: dict[str, tuple[str, str]] = {}

    @staticmethod
    def _find_casefold_file(root: Path, name: str) -> Path | None:
        try:
            for child in root.iterdir():
                if child.is_file() and child.name.casefold() == name.casefold():
                    return child
        except OSError:
            return None
        return None

    def _read_vanilla_csf(
        self,
        root: Path,
        rules_name: str,
    ) -> tuple[str, CsfDocument | None, str | None]:
        csf_name, mix_name = _vanilla_csf_names(rules_name)
        loose = self._find_casefold_file(root, csf_name)
        if loose is not None:
            try:
                return csf_name, CsfDocument.load(loose), None
            except (OSError, CsfFormatError) as exc:
                return csf_name, None, f"{loose.name} 无法读取：{exc}"

        language_mix = self._find_casefold_file(root, mix_name)
        if language_mix is None:
            return csf_name, None, None
        try:
            payload = MixArchive.from_path(language_mix).read_file(csf_name)
            if payload is None:
                return csf_name, None, f"{language_mix.name} 中没有 {csf_name}"
            return csf_name, CsfDocument.from_bytes(payload), None
        except (OSError, MixFormatError, CsfFormatError) as exc:
            return csf_name, None, f"{language_mix.name} / {csf_name} 无法读取：{exc}"

    def _reset_companion_context(self, root: Path | None, rules_name: str) -> None:
        self.source_root = root
        self.source_rules_name = rules_name or "rulesmd.ini"
        self._string_tables = []
        self._base_csf = None
        self._base_csf_name = None
        self._base_csf_error = None
        self._companion_csf_error = None
        self._pending_csf = {}

        if root is None or not root.is_dir():
            return

        self._base_csf_name, self._base_csf, self._base_csf_error = self._read_vanilla_csf(
            root,
            self.source_rules_name,
        )

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
        existing = self._find_casefold_file(root, "stringtable99.csf")
        return existing or root / "stringtable99.csf"

    def _lookup_csf(self, label: str) -> str | None:
        pending = self._pending_csf.get(label.casefold())
        if pending is not None:
            return pending[1]
        for table in reversed(self._string_tables):
            value = table.get(label)
            if value is not None:
                return value
        if self._base_csf is not None:
            return self._base_csf.get(label)
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
        # MIX is always a read-only source. Bind Save to the loose override that the
        # game actually reads, never to the archive itself. This also keeps custom mod
        # names correct (for example expandmo99.mix -> rulesmo.ini).
        self.document.path = source.parent / extracted.filename
        self.document_kind = "rules"
        self.base_document = None
        self._capture_baseline()
        return self.snapshot()

    def snapshot(self) -> dict:
        result = super().snapshot()
        vanilla_name, _ = _vanilla_csf_names(self.source_rules_name)
        result["companion"] = {
            "suggested_rules_name": self.source_rules_name,
            "source_root": str(self.source_root) if self.source_root else None,
            "csf_name": "stringtable99.csf" if self.settings.ares_enabled else vanilla_name,
            "csf_error": self._companion_csf_error
            if self.settings.ares_enabled
            else self._base_csf_error,
            "vanilla_csf_available": self._base_csf is not None,
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

    def _prepare_ares_csf(self, root: Path) -> tuple[Path, CsfDocument]:
        path = self._find_stringtable99(root)
        if path.exists():
            try:
                document = CsfDocument.load(path)
            except (OSError, CsfFormatError) as exc:
                raise ValueError(
                    f"已有 {path.name} 无法读取，为避免覆盖损坏文件已取消保存：{exc}"
                ) from exc
        else:
            # Ares language-neutral tables load regardless of the base ra2md.csf locale.
            document = CsfDocument.new(language=0xFFFFFFFF)
        return path, document

    def _prepare_vanilla_csf(
        self,
        root: Path,
        rules_name: str,
    ) -> tuple[Path, CsfDocument]:
        csf_name, document, error = self._read_vanilla_csf(root, rules_name)
        path = self._find_casefold_file(root, csf_name) or root / csf_name
        if error is not None:
            raise ValueError(f"无法安全写入原版字符串表：{error}")
        if document is None:
            source_name, _ = _vanilla_csf_names(self.source_rules_name)
            if self._base_csf is None or self._base_csf_name != source_name:
                raise ValueError(
                    f"关闭 Ares 时需要完整的 {csf_name}。请把原版语言 MIX "
                    f"（{_vanilla_csf_names(rules_name)[1]}）放在 Rules 同目录，"
                    "编辑器会从中读取原始字符串后再合并新名称。"
                )
            document = CsfDocument.from_bytes(self._base_csf.to_bytes())
        return path, document

    def _prepare_companion_csf(
        self,
        root: Path,
        rules_name: str,
    ) -> tuple[Path, CsfDocument] | None:
        if not self._pending_csf:
            return None
        if self.settings.ares_enabled:
            path, document = self._prepare_ares_csf(root)
        else:
            path, document = self._prepare_vanilla_csf(root, rules_name)

        for label, value in self._pending_csf.values():
            document.set(label, value)
        # Validate all encodings before the Rules INI itself is written.
        document.to_bytes()
        return path, document

    def save(self, path: str | Path | None = None) -> dict:
        target = Path(path) if path else self._doc().path
        if target is None:
            raise ValueError("No output path")

        companion = self._prepare_companion_csf(target.parent, target.name)
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
