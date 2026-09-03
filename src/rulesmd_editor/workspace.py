from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

from .control_schema import ControlSchema, ControlSpec
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


@dataclass
class WorkspaceSettings:
    # Ares is part of the normal editing experience by default. Disabling it only
    # removes Ares-specific suggestions/insert helpers; parsing always stays lossless
    # and permissive so hand-written or third-party tags are never rejected.
    ares_enabled: bool = True


class RulesWorkspace:
    """Application-facing service around the lossless INI model.

    Yuri's Revenge and Ares metadata are intentionally presented through one option
    catalog. `ares_enabled` affects assistance, never parsing compatibility.
    """

    def __init__(self, schema: SchemaCatalog | None = None, settings: WorkspaceSettings | None = None):
        self.schema = schema or SchemaCatalog()
        self.controls = ControlSchema()
        self.settings = settings or WorkspaceSettings()
        self.document: IniDocument | None = None

    def _doc(self) -> IniDocument:
        if self.document is None:
            raise RuntimeError("No rules document is open")
        return self.document

    def get_settings(self) -> dict:
        return asdict(self.settings)

    def set_settings(self, *, ares_enabled: bool | None = None) -> dict:
        if ares_enabled is not None:
            self.settings.ares_enabled = bool(ares_enabled)
        return self.get_settings()

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
            "settings": self.get_settings(),
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

    def _dynamic_values(self, spec: ControlSpec) -> tuple[tuple[str, str], ...]:
        doc = self._doc()
        dynamic = spec.dynamic or ""
        if not dynamic:
            return ()

        if dynamic == "buildings":
            values: list[tuple[str, str]] = []
            for _, section in doc.items("BuildingTypes"):
                if not doc.has_section(section):
                    continue
                try:
                    if float(doc.get(section, "TechLevel", "-1")) <= -1:
                        continue
                except ValueError:
                    continue
                values.append((section, self.schema.section_description(section) or section))
            return tuple(values)

        if not dynamic.startswith("unit:"):
            return ()

        entity_type = dynamic.split(":", 1)[1]
        root_sections = {
            "Infantry": "InfantryTypes",
            "Vehicle": "VehicleTypes",
            "Building": "BuildingTypes",
            "Aircraft": "AircraftTypes",
            "SuperWeapon": "SuperWeaponTypes",
        }
        root = root_sections.get(entity_type)
        if root:
            return tuple(
                (section, self.schema.section_description(section) or section)
                for _, section in doc.items(root)
                if doc.has_section(section)
            )

        category_names = {"Warhead": "弹头", "Projectile": "弹体", "Weapon": "武器"}
        category = category_names.get(entity_type)
        if category:
            return tuple(
                (section, self.schema.section_description(section) or section)
                for section, _ in categorized_sections(doc).get(category, [])
            )
        return ()

    def _control_for(self, key: str, value: str, meta) -> ControlSpec:
        explicit = self.controls.explicit(key)
        dynamic_values = self._dynamic_values(explicit) if explicit else ()
        return self.controls.resolve(
            key,
            value,
            dynamic_values=dynamic_values,
            fallback_values=meta.values,
            fallback_type=meta.value_type,
        )

    def section(self, section: str) -> dict:
        doc = self._doc()
        actual = doc._section_name(section)
        if actual is None:
            raise KeyError(f"Unknown section: {section}")
        options = []
        for line in doc.section_lines(actual, keys_only=True):
            key = line.key or ""
            value = line.value or ""
            meta = self.schema.option(key)
            control = self._control_for(key, value, meta)
            # Keep the explicit widget contract while also translating it to the
            # current frontend's compatibility value_type so old-Web lists work now.
            ui_value_type = meta.value_type
            if control.widget == "multi-select":
                ui_value_type = "list-legacy"
            elif control.widget == "select":
                ui_value_type = "enum"
            elif control.widget == "boolean":
                ui_value_type = "boolean"
            options.append(
                {
                    "line_id": line.line_id,
                    "key": key,
                    "value": value,
                    "suffix": line.suffix,
                    "label": meta.description or key,
                    "description": meta.help_text,
                    "category": meta.category,
                    "source": meta.source,
                    "value_type": ui_value_type,
                    "semantic_type": meta.value_type,
                    "widget": control.widget,
                    "values": [{"value": item_value, "label": label} for item_value, label in control.values],
                    "docs": meta.docs,
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

    def option_catalog(self, query: str = "", applies_to: str | None = None) -> list[dict]:
        """Return insertable options as one merged YR/Ares catalog.

        When Ares assistance is disabled, Ares options disappear from this picker,
        but existing/manual Ares keys remain fully editable because the parser never
        validates or rejects unknown keys.
        """
        rows = self.schema.available_options(query=query, applies_to=applies_to)
        if not self.settings.ares_enabled:
            rows = [meta for meta in rows if meta.source.casefold() != "ares"]
        return [
            {
                "key": meta.name,
                "label": meta.description or meta.name,
                "description": meta.help_text,
                "category": meta.category,
                "source": meta.source,
                "value_type": meta.value_type,
                "applies_to": list(meta.applies_to),
                "default": meta.default,
                "values": [{"value": value, "label": label} for value, label in meta.values],
                "docs": meta.docs,
            }
            for meta in rows
        ]

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

    def add_option(self, section: str, key: str, value: str | None = None) -> dict:
        doc = self._doc()
        meta = self.schema.option(key)
        resolved = meta.default if value is None else value
        line_id = doc.set(section, key, resolved)
        return self.set_value(line_id, resolved)

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
