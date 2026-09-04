from __future__ import annotations

import json
from pathlib import Path

from .ares_schema import AresSchemaCatalog
from .category_rules import categorize_yr_option
from .schema import OptionMeta, SchemaCatalog
from .translations_zh import apply_yr_translations


RESOURCE_ROOT = Path(__file__).resolve().parent / "resources"
LEGACY_ROOT = RESOURCE_ROOT / "legacy"
GENERATED_ROOT = RESOURCE_ROOT / "generated"


class RuntimeSchemaCatalog(SchemaCatalog):
    """Unified presentation catalog backed by physically separate rule sources.

    ``rules_schema.json`` and the legacy INIs contain original Yuri's Revenge data.
    ``ares_schema.json`` is loaded only by ``AresSchemaCatalog``. The editor sees one
    catalog, while storage, validation and future maintenance remain independent.
    """

    def __init__(self) -> None:
        super().__init__(LEGACY_ROOT if LEGACY_ROOT.exists() else None)
        self._load_generated_yr()
        # Presentation-only correction layer.  This runs after legacy/generated data is
        # loaded so existing local generated files immediately receive translation fixes
        # without rewriting rulesmd.ini or forcing a metadata rebuild.
        apply_yr_translations(self.options, self.name_desc)
        self.ares = AresSchemaCatalog()

    def _load_generated_yr(self) -> None:
        schema_path = GENERATED_ROOT / "rules_schema.json"
        if schema_path.exists():
            try:
                payload = json.loads(schema_path.read_text("utf-8"))
            except Exception:
                payload = {}
            for key, row in payload.get("options", {}).items():
                if str(row.get("source", "YR")).casefold() == "ares":
                    continue
                old = self.options.get(key)
                values = tuple(
                    (str(item.get("value", "")), str(item.get("label") or item.get("value", "")))
                    for item in row.get("values", [])
                )
                legacy_category = str(row.get("category", old.category if old else ""))
                self.options[key] = OptionMeta(
                    name=key,
                    description=str(row.get("description", old.description if old else "")),
                    help_text=str(row.get("help", old.help_text if old else "")),
                    category=categorize_yr_option(key, legacy_category),
                    source="YR",
                    values=values or (old.values if old else ()),
                    value_type=str(row.get("value_type", old.value_type if old else "text")),
                    applies_to=tuple(row.get("applies_to", old.applies_to if old else ())),
                    default=str(row.get("default", old.default if old else "")),
                    docs=str(row.get("docs", old.docs if old else "")),
                )

        names_path = GENERATED_ROOT / "section_names.json"
        if names_path.exists():
            try:
                names = json.loads(names_path.read_text("utf-8"))
            except Exception:
                names = {}
            if isinstance(names, dict):
                self.name_desc.update({str(key): str(value) for key, value in names.items()})

    def option(self, key: str) -> OptionMeta:
        """Prefer original YR metadata for shared keys, otherwise use Ares."""
        base = super().option(key)
        if base.source != "自定义":
            return base
        ares = self.ares.option(key)
        if ares is not None:
            return ares
        source = "Ares/扩展" if "." in key else "自定义"
        return OptionMeta(key, source=source)

    def available_options(
        self,
        *,
        query: str = "",
        applies_to: str | None = None,
        source: str | None = None,
    ) -> list[OptionMeta]:
        base_rows = super().available_options(query=query, applies_to=applies_to, source=source)
        if source and source.casefold() not in {"ares", "yr"}:
            return base_rows
        ares_rows = [] if source and source.casefold() == "yr" else self.ares.available_options(
            query=query,
            applies_to=applies_to,
        )
        seen = {row.name.casefold() for row in base_rows}
        merged = base_rows + [row for row in ares_rows if row.name.casefold() not in seen]
        return sorted(merged, key=lambda item: (item.category, item.description or item.name, item.name))
