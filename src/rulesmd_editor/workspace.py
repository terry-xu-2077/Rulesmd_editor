from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

from .ini_document import IniDocument, categorized_sections
from .schema import SchemaCatalog


@dataclass(frozen=True)
class DocumentInfo:
    path: str | None
    encoding: str
    newline: str
    final_newline: bool
    dirty: bool
    section_count: int


class RulesWorkspace:
    """Application-facing service around the lossless INI model.

    React/Tauri should talk to this service rather than depending on parser internals.
    The payloads are deliberately JSON-friendly so the same API can be exposed over
    a Tauri command, stdio sidecar, or tests.
    """

    def __init__(self, schema: SchemaCatalog | None = None):
        self.schema = schema or SchemaCatalog()
        self.document: IniDocument | None = None

    def _doc(self) -> IniDocument:
        if self.document is None:
            raise RuntimeError("No rules document is open")
        return self.document

    def new_document(self) -> dict:
        self.document = IniDocument.new()
        return self.snapshot()

    def open_file(self, path: str | Path) -> dict:
        self.document = IniDocument.load(path)
        return self.snapshot()

    def info(self) -> DocumentInfo:
        doc = self._doc()
        return DocumentInfo(
            path=str(doc.path) if doc.path else None,
            encoding=doc.encoding,
            newline="CRLF" if doc.newline == "\r\n" else "LF",
            final_newline=doc.final_newline,
            dirty=doc.dirty,
            section_count=len(doc.sections()),
        )

    def snapshot(self) -> dict:
        doc = self._doc()
        categories = categorized_sections(doc)
        return {
            "document": asdict(self.info()),
            "categories": [
                {
                    "name": category,
                    "items": [
                        {"section": section, "registration_id": registration_id}
                        for section, registration_id in entries
                    ],
                }
                for category, entries in categories.items()
            ],
        }

    def section(self, section: str) -> dict:
        doc = self._doc()
        actual = doc._section_name(section)
        if actual is None:
            raise KeyError(f"Unknown section: {section}")
        options = []
        for line in doc.section_lines(actual, keys_only=True):
            key = line.key or ""
            meta = self.schema.option(key)
            options.append(
                {
                    "line_id": line.line_id,
                    "key": key,
                    "value": line.value or "",
                    "suffix": line.suffix,
                    "label": meta.description or key,
                    "description": meta.help_text,
                    "category": meta.category,
                    "source": meta.source,
                }
            )
        return {
            "section": actual,
            "description": self.schema.section_description(actual),
            "options": options,
            "raw": doc.clone_section_text(actual),
            "references": [
                {"section": source_section, "key": key}
                for source_section, key in doc.references_to(actual)
            ],
        }

    def set_value(self, line_id: int, value: str) -> dict:
        doc = self._doc()
        doc.set_line_value(line_id, value)
        line = doc.line(line_id)
        assert line is not None
        return {
            "line_id": line.line_id,
            "section": line.section,
            "key": line.key,
            "value": line.value,
            "dirty": doc.dirty,
        }

    def add_option(self, section: str, key: str, value: str = "") -> dict:
        doc = self._doc()
        line_id = doc.set(section, key, value)
        return self.set_value(line_id, value)

    def remove_line(self, line_id: int) -> dict:
        doc = self._doc()
        line = doc.line(line_id)
        if line is None:
            raise KeyError(f"Unknown line id: {line_id}")
        section = line.section
        doc.remove_line(line_id)
        return {"line_id": line_id, "section": section, "dirty": doc.dirty}

    def save(self, path: str | Path | None = None) -> dict:
        target = self._doc().save(path)
        return {"path": str(target), "dirty": False}

    def raw_text(self) -> str:
        return self._doc().to_text()
