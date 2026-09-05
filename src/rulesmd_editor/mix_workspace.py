from __future__ import annotations

from pathlib import Path

from .ini_document import IniDocument
from .mix_file import extract_rulesmd_bytes
from .workspace import RulesWorkspace


class MixRulesWorkspace(RulesWorkspace):
    """Desktop workspace that treats a selected MIX as a source of rulesmd.ini."""

    def open_file(self, path: str | Path) -> dict:
        source = Path(path)
        if source.suffix.casefold() != ".mix":
            return super().open_file(source)

        payload = extract_rulesmd_bytes(source)
        self.document = _ini_document_from_bytes(payload)
        # A MIX is an import source, not a writable INI path. Keeping path unset makes
        # the existing Save flow ask where to write rulesmd.ini instead of overwriting
        # the archive itself.
        self.document.path = None
        self.document_kind = "rules"
        self.base_document = None
        self._capture_baseline()
        return self.snapshot()


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
    raise UnicodeDecodeError("utf-8", b"", 0, 1, "cannot decode rulesmd.ini")
