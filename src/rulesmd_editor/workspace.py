from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import re

from .control_schema import ControlSchema, ControlSpec
from .global_rules import GLOBAL_RULE_VIEWS
from .ini_document import IniDocument, categorized_sections
from .runtime_catalog import GENERATED_ROOT, RuntimeSchemaCatalog


DEFAULT_TEMPLATE = GENERATED_ROOT / "rulesmd.template.ini"
MAP_EXTENSIONS = {".map", ".mpr", ".yrm"}
ROOT_SECTIONS = {"InfantryTypes", "VehicleTypes", "AircraftTypes", "BuildingTypes", "SuperWeaponTypes"}
CATEGORY_TYPES = {
    "步兵": "InfantryType",
    "载具": "VehicleType",
    "飞机": "AircraftType",
    "建筑": "BuildingType",
    "超级武器": "SuperWeapon",
    "武器": "Weapon",
    "弹头": "Warhead",
    "弹体": "Projectile",
}
MAP_RULE_CATALOG_CATEGORIES = {"步兵", "载具", "飞机", "建筑", "超级武器", "武器", "弹头", "弹体"}
TECHNO_TYPES = {"InfantryType", "VehicleType", "AircraftType", "BuildingType"}
UNIT_REGISTRATION_ROOTS = {
    "InfantryType": "InfantryTypes",
    "VehicleType": "VehicleTypes",
    "AircraftType": "AircraftTypes",
    "BuildingType": "BuildingTypes",
    "SuperWeapon": "SuperWeaponTypes",
}
SECTION_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


@dataclass(frozen=True)
class DocumentInfo:
    path: str | None
    encoding: str
    newline: str
    final_newline: bool
    dirty: bool
    section_count: int
    kind: str = "rules"
    rule_section_count: int = 0


@dataclass
class WorkspaceSettings:
    ares_enabled: bool = True


class RulesWorkspace:
    """Lossless rules editor service used by the Tauri bridge.

    In map mode ``document`` is always the original map document.  The stock rules
    template is loaded separately and is used only to classify/map known rule sections
    and provide insertion metadata.  This guarantees that map geometry, triggers,
    packs and other native sections are never rewritten as a synthetic rules file.
    """

    def __init__(self, schema: RuntimeSchemaCatalog | None = None, settings: WorkspaceSettings | None = None):
        self.schema = schema or RuntimeSchemaCatalog()
        self.controls = ControlSchema()
        self.settings = settings or WorkspaceSettings()
        self.document: IniDocument | None = None
        self.document_kind = "rules"
        self.base_document: IniDocument | None = None
        self._original_values: dict[int, str] = {}
        self._changed_value_ids: set[int] = set()
        self._structural_dirty = False
        self._categories_cache: dict[str, list[tuple[str, str]]] = {}
        self._catalog_categories_cache: dict[str, list[tuple[str, str]]] = {}
        self._section_types: dict[str, str] = {}
        self._reference_index: dict[str, list[tuple[str, str]]] = {}
        self._dynamic_cache: dict[str, tuple[tuple[str, str], ...]] = {}
        self._last_values: dict[tuple[str, str], str] = {}
        self._observed_keys: dict[str, set[str]] = {}
        self._country_sides: dict[str, str] = {}

    def _doc(self) -> IniDocument:
        if self.document is None:
            raise RuntimeError("No rules document is open")
        return self.document

    def is_map_document(self) -> bool:
        return self.document_kind == "map"

    @staticmethod
    def _family_type(section_type: str | None) -> str | None:
        return "TechnoType" if section_type in TECHNO_TYPES else section_type

    @staticmethod
    def _normalize_side(value: str) -> str | None:
        key = value.strip().casefold().replace(" ", "")
        if key in {"gdi", "allied", "allies", "盟军"}:
            return "allied"
        if key in {"nod", "soviet", "soviets", "苏军"}:
            return "soviet"
        if key in {"thirdside", "yuri", "尤里"}:
            return "yuri"
        return None

    def _build_country_side_index(self) -> None:
        self._country_sides = {}
        for (section_fold, key_fold), value in self._last_values.items():
            if key_fold != "side":
                continue
            side = self._normalize_side(value)
            if side:
                self._country_sides[section_fold] = side

        canonical = {
            "americans": "allied", "alliance": "allied", "french": "allied", "germans": "allied", "british": "allied",
            "africans": "soviet", "arabs": "soviet", "confederation": "soviet", "russians": "soviet",
            "yuricountry": "yuri",
        }
        for country, side in canonical.items():
            self._country_sides.setdefault(country, side)

    def _section_side(self, section: str) -> str:
        section_fold = section.casefold()
        direct = self._country_sides.get(section_fold)
        if direct:
            return direct
        for key in ("owner", "requiredhouses"):
            raw = self._last_values.get((section_fold, key), "")
            if not raw:
                continue
            sides = {
                self._country_sides[token.strip().casefold()]
                for token in raw.split(",")
                if token.strip().casefold() in self._country_sides
            }
            if len(sides) == 1:
                return next(iter(sides))
            if len(sides) > 1:
                return "neutral"
        return "neutral"

    def _section_label(self, section: str) -> str:
        catalog = (self.schema.section_description(section) or "").strip()
        if catalog and catalog.casefold() != section.casefold():
            return catalog
        comment = self._last_values.get((section.casefold(), "name"), "").strip()
        return comment or catalog or section

    def _map_visible_categories(
        self,
        base_categories: dict[str, list[tuple[str, str]]],
        doc: IniDocument,
    ) -> dict[str, list[tuple[str, str]]]:
        return {
            category: [entry for entry in entries if doc.has_section(entry[0])]
            for category, entries in base_categories.items()
        }

    def _rebuild_indexes(self) -> None:
        doc = self._doc()
        if self.is_map_document() and self.base_document is not None:
            self._catalog_categories_cache = categorized_sections(self.base_document)
            self._categories_cache = self._map_visible_categories(self._catalog_categories_cache, doc)
        else:
            self._categories_cache = categorized_sections(doc)
            self._catalog_categories_cache = self._categories_cache

        self._section_types = {}
        for category, entries in self._catalog_categories_cache.items():
            section_type = CATEGORY_TYPES.get(category)
            if not section_type:
                continue
            for section, _ in entries:
                self._section_types[section.casefold()] = section_type

        self._reference_index = {}
        self._last_values = {}
        self._observed_keys = {}
        source_documents = []
        if self.is_map_document() and self.base_document is not None:
            source_documents.append(self.base_document)
        source_documents.append(doc)
        for source_doc in source_documents:
            for line in source_doc.lines:
                if line.kind != "key" or not line.section or not line.key:
                    continue
                section_fold = line.section.casefold()
                key_fold = line.key.casefold()
                self._last_values[(section_fold, key_fold)] = line.value or ""
                section_type = self._section_types.get(section_fold)
                if section_type:
                    self._observed_keys.setdefault(section_type, set()).add(key_fold)
                    family = self._family_type(section_type)
                    if family:
                        self._observed_keys.setdefault(family, set()).add(key_fold)
                for token in (part.strip() for part in (line.value or "").split(",")):
                    if token:
                        self._reference_index.setdefault(token.casefold(), []).append((line.section, line.key))
        self._build_country_side_index()
        self._dynamic_cache.clear()

    def _capture_baseline(self) -> None:
        doc = self._doc()
        self._original_values = {
            line.line_id: line.value or ""
            for line in doc.lines
            if line.kind == "key"
        }
        self._changed_value_ids.clear()
        self._structural_dirty = False
        doc.dirty = False
        self._rebuild_indexes()

    def _refresh_dirty(self) -> None:
        self._doc().dirty = self._structural_dirty or bool(self._changed_value_ids)

    def get_settings(self) -> dict:
        return asdict(self.settings)

    def set_settings(self, *, ares_enabled: bool | None = None) -> dict:
        if ares_enabled is not None:
            self.settings.ares_enabled = bool(ares_enabled)
        return self.get_settings()

    def new_document(self) -> dict:
        self.document_kind = "rules"
        self.base_document = None
        if DEFAULT_TEMPLATE.exists():
            self.document = IniDocument.load(DEFAULT_TEMPLATE)
            self.document.path = None
        else:
            self.document = IniDocument.new()
        self._capture_baseline()
        return self.snapshot()

    def open_file(self, path: str | Path) -> dict:
        path = Path(path)
        self.document = IniDocument.load(path)
        self.document_kind = "map" if path.suffix.casefold() in MAP_EXTENSIONS else "rules"
        self.base_document = IniDocument.load(DEFAULT_TEMPLATE) if self.is_map_document() and DEFAULT_TEMPLATE.exists() else None
        self._capture_baseline()
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
            kind=self.document_kind,
            rule_section_count=sum(len(entries) for entries in self._categories_cache.values()),
        )

    def _map_rule_catalog(self) -> list[dict]:
        if not self.is_map_document() or self.base_document is None:
            return []
        doc = self._doc()
        rows: list[dict] = []
        seen: set[str] = set()
        for category, entries in self._catalog_categories_cache.items():
            if category not in MAP_RULE_CATALOG_CATEGORIES:
                continue
            for section, _ in entries:
                folded = section.casefold()
                if folded in seen:
                    continue
                seen.add(folded)
                rows.append({
                    "section": section,
                    "label": self._section_label(section),
                    "category": category,
                    "side": self._section_side(section),
                    "present": doc.has_section(section),
                })

        for label, section, _ in GLOBAL_RULE_VIEWS:
            folded = section.casefold()
            if folded in seen or not self.base_document.has_section(section):
                continue
            seen.add(folded)
            rows.append({
                "section": section,
                "label": "全局规则" if folded == "general" else label,
                "category": "全局规则",
                "side": "neutral",
                "present": doc.has_section(section),
            })
        return rows

    def snapshot(self) -> dict:
        return {
            "document": asdict(self.info()),
            "settings": self.get_settings(),
            "categories": [
                {
                    "name": category,
                    "items": [
                        {
                            "section": section,
                            "registration_id": registration_id,
                            "label": self._section_label(section),
                            "side": self._section_side(section),
                        }
                        for section, registration_id in entries
                    ],
                }
                for category, entries in self._categories_cache.items()
            ],
            "map_rule_catalog": self._map_rule_catalog(),
        }

    def _dynamic_values(self, spec: ControlSpec) -> tuple[tuple[str, str], ...]:
        dynamic = spec.dynamic or ""
        if not dynamic:
            return ()
        if dynamic in self._dynamic_cache:
            return self._dynamic_cache[dynamic]

        if dynamic == "buildings":
            values: list[tuple[str, str]] = []
            for section, _ in self._catalog_categories_cache.get("建筑", []):
                raw_level = self._last_values.get((section.casefold(), "techlevel"), "-1")
                try:
                    if float(raw_level) <= -1:
                        continue
                except ValueError:
                    continue
                values.append((section, self._section_label(section)))
            result = tuple(values)
            self._dynamic_cache[dynamic] = result
            return result

        if not dynamic.startswith("unit:"):
            return ()

        entity_type = dynamic.split(":", 1)[1]
        categories = {
            "Infantry": "步兵",
            "Vehicle": "载具",
            "Building": "建筑",
            "Aircraft": "飞机",
            "SuperWeapon": "超级武器",
            "Warhead": "弹头",
            "Projectile": "弹体",
            "Weapon": "武器",
        }
        category = categories.get(entity_type)
        if not category:
            return ()
        result = tuple(
            (section, self._section_label(section))
            for section, _ in self._catalog_categories_cache.get(category, [])
        )
        self._dynamic_cache[dynamic] = result
        return result

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
            options.append(
                {
                    "line_id": line.line_id,
                    "key": key,
                    "value": value,
                    "raw_value": self._original_values.get(line.line_id),
                    "suffix": line.suffix,
                    "label": meta.description or key,
                    "description": meta.help_text,
                    "category": meta.category,
                    "source": meta.source,
                    "value_type": meta.value_type,
                    "widget": control.widget,
                    "values": [{"value": item_value, "label": label} for item_value, label in control.values],
                    "docs": meta.docs,
                }
            )
        return {
            "section": actual,
            "description": self._section_label(actual),
            "options": options,
            "raw": doc.clone_section_text(actual),
            "references": [
                {"section": source_section, "key": key}
                for source_section, key in self._reference_index.get(actual.casefold(), [])
            ],
        }

    def option_catalog(self, query: str = "", applies_to: str | None = None, section: str | None = None) -> list[dict]:
        target_type = applies_to
        if section:
            target_type = self._section_types.get(section.casefold()) or applies_to
        family = self._family_type(target_type)
        existing = {
            key.casefold()
            for _, key, _ in self._doc().items_with_ids(section)
        } if section else set()

        rows = self.schema.available_options(query=query)
        safe_rows = []
        observed = self._observed_keys.get(family or target_type or "", set())
        for meta in rows:
            if not self.settings.ares_enabled and meta.source.casefold() == "ares":
                continue
            if meta.name.casefold() in existing:
                continue
            allowed = False
            if target_type and meta.applies_to:
                allowed = target_type in meta.applies_to or (family == "TechnoType" and "TechnoType" in meta.applies_to)
            elif target_type and not meta.applies_to:
                allowed = meta.name.casefold() in observed
            elif not target_type:
                allowed = bool(meta.applies_to)
            if allowed:
                safe_rows.append(meta)

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
            for meta in safe_rows
        ]

    def _remove_reference_tokens(self, section: str, key: str, value: str) -> None:
        pair = (section, key)
        for token in (part.strip().casefold() for part in value.split(",")):
            if not token:
                continue
            refs = self._reference_index.get(token)
            if not refs:
                continue
            self._reference_index[token] = [item for item in refs if item != pair]
            if not self._reference_index[token]:
                self._reference_index.pop(token, None)

    def _add_reference_tokens(self, section: str, key: str, value: str) -> None:
        pair = (section, key)
        for token in (part.strip().casefold() for part in value.split(",")):
            if token:
                self._reference_index.setdefault(token, []).append(pair)

    def set_value(self, line_id: int, value: str) -> dict:
        doc = self._doc()
        line = doc.line(line_id)
        if line is None or line.kind != "key" or not line.section or not line.key:
            raise KeyError(f"Unknown line id: {line_id}")
        old_value = line.value or ""
        self._remove_reference_tokens(line.section, line.key, old_value)
        doc.set_line_value(line_id, value)
        self._add_reference_tokens(line.section, line.key, value)
        self._last_values[(line.section.casefold(), line.key.casefold())] = value
        self._dynamic_cache.clear()

        original = self._original_values.get(line_id)
        if original is not None:
            if (line.value or "") == original:
                self._changed_value_ids.discard(line_id)
            else:
                self._changed_value_ids.add(line_id)

        if line.section in ROOT_SECTIONS or line.key.casefold() in {"owner", "requiredhouses", "side"}:
            self._rebuild_indexes()
        self._refresh_dirty()
        return {
            "line_id": line.line_id,
            "section": line.section,
            "key": line.key,
            "value": line.value,
            "raw_value": self._original_values.get(line_id),
            "raw": doc.clone_section_text(line.section),
            "dirty": doc.dirty,
        }

    def add_option(self, section: str, key: str, value: str | None = None) -> dict:
        doc = self._doc()
        meta = self.schema.option(key)
        resolved = meta.default if value is None else value
        line_id = doc.set(section, key, resolved)
        self._structural_dirty = True
        self._rebuild_indexes()
        self._refresh_dirty()
        line = doc.line(line_id)
        assert line is not None
        return {
            "line_id": line.line_id,
            "section": line.section,
            "key": line.key,
            "value": line.value,
            "raw_value": None,
            "dirty": doc.dirty,
        }

    def _next_registration_id(self, root: str) -> str:
        numeric_ids: list[int] = []
        for key, _ in self._doc().items(root):
            try:
                numeric_ids.append(int(key.strip()))
            except ValueError:
                continue
        return str((max(numeric_ids) + 1) if numeric_ids else 0)

    def _add_map_rule_section(self, section: str) -> dict:
        doc = self._doc()
        if self.base_document is None or not self.base_document.has_section(section):
            raise ValueError(f"内置 rules 目录中不存在 Section: {section}")
        actual = self.base_document._section_name(section) or section
        if not doc.has_section(actual):
            doc.add_section(actual)
            self._structural_dirty = True
        self._rebuild_indexes()
        self._refresh_dirty()
        return {
            "snapshot": self.snapshot(),
            "section": self.section(actual),
            "registration_id": "规则片段",
            "root": "地图覆盖",
        }

    def create_unit(
        self,
        *,
        template: str,
        section: str,
        comment: str,
        included_line_ids: list[int] | None = None,
    ) -> dict:
        if self.is_map_document():
            return self._add_map_rule_section(template)

        doc = self._doc()
        template_actual = doc._section_name(template)
        if template_actual is None:
            raise KeyError(f"Unknown template section: {template}")

        new_section = section.strip()
        display_comment = comment.strip()
        if not SECTION_NAME_RE.fullmatch(new_section):
            raise ValueError("Section 注册名只能使用英文字母、数字和下划线，并且必须以字母开头")
        if not display_comment:
            raise ValueError("必须填写注释（Name）")
        if doc.has_section(new_section):
            raise ValueError(f"Section 已存在: {new_section}")

        section_type = self._section_types.get(template_actual.casefold())
        root = UNIT_REGISTRATION_ROOTS.get(section_type or "")
        if not root:
            raise ValueError("所选模板不是可注册的单位类型")

        registration_id = self._next_registration_id(root)
        include_all = included_line_ids is None
        included = {int(line_id) for line_id in (included_line_ids or [])}
        template_lines = doc.section_lines(template_actual, keys_only=True)

        doc.set(root, registration_id, new_section)
        doc.add_section(new_section)

        saw_name = False
        saw_uiname = False
        for line in template_lines:
            key = line.key or ""
            folded = key.casefold()
            if folded == "uiname":
                doc.set(new_section, key, f"Name:{new_section}")
                saw_uiname = True
                continue
            if folded == "name":
                doc.set(new_section, key, display_comment)
                saw_name = True
                continue
            if not include_all and line.line_id not in included:
                continue
            doc.set(new_section, key, line.value or "")

        if not saw_uiname:
            doc.set(new_section, "UIName", f"Name:{new_section}")
        if not saw_name:
            doc.set(new_section, "Name", display_comment)

        self._structural_dirty = True
        self._rebuild_indexes()
        self._refresh_dirty()
        return {
            "snapshot": self.snapshot(),
            "section": self.section(new_section),
            "registration_id": registration_id,
            "root": root,
        }

    def remove_line(self, line_id: int) -> dict:
        doc = self._doc()
        line = doc.line(line_id)
        if line is None:
            raise KeyError(f"Unknown line id: {line_id}")
        section = line.section
        self._changed_value_ids.discard(line_id)
        doc.remove_line(line_id)
        self._structural_dirty = True
        self._rebuild_indexes()
        self._refresh_dirty()
        return {"line_id": line_id, "section": section, "dirty": doc.dirty}

    def save(self, path: str | Path | None = None) -> dict:
        target = self._doc().save(path)
        self._capture_baseline()
        return {"path": str(target), "dirty": False}

    def raw_text(self) -> str:
        return self._doc().to_text()
