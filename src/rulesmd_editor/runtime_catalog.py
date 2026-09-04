from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path
from threading import Lock

from .ares_schema import AresSchemaCatalog
from .category_rules import categorize_yr_option
from .schema import OptionMeta, SchemaCatalog
from .translations_zh import apply_yr_translations, guess_section_name, translate_option_meta


RESOURCE_ROOT = Path(__file__).resolve().parent / "resources"
LEGACY_ROOT = RESOURCE_ROOT / "legacy"
GENERATED_ROOT = RESOURCE_ROOT / "generated"


class RuntimeSchemaCatalog(SchemaCatalog):
    """Unified presentation catalog backed by physically separate rule sources."""

    def __init__(self) -> None:
        super().__init__(LEGACY_ROOT if LEGACY_ROOT.exists() else None)
        self._load_generated_yr()
        apply_yr_translations(self.options, self.name_desc)
        self.ares = AresSchemaCatalog()
        self._all_options_cache: tuple[OptionMeta, ...] | None = None
        self._all_options_lock = Lock()

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
        base = super().option(key)
        translated = translate_option_meta(base)
        if base.source != "自定义":
            # ``super().option`` can synthesize a YR row directly from HelpInfor.ini
            # when OptionsDesc omitted a legitimate engine key. Translate/correct that
            # row on demand just like the eagerly loaded catalog rows.
            return translated

        # A few original YR keys are absent from the old OptionsDesc/Help catalog on some
        # installs, yet have explicit curated semantics (for example OpenTransportWeapon).
        # If the translation/semantic layer changed the otherwise-custom row, that change
        # is authoritative evidence that it is a known original key. Do this before Ares
        # lookup so an unrelated extension entry cannot steal the meaning.
        if translated != base:
            return replace(translated, source="YR")

        ares = self.ares.option(key)
        if ares is not None:
            return ares
        source = "Ares/扩展" if "." in key else "自定义"
        return OptionMeta(key, source=source)

    def section_description(self, section: str) -> str:
        current = super().section_description(section).strip()
        if current and current.casefold() != section.casefold():
            return current
        return guess_section_name(section) or current

    def _all_options(self) -> tuple[OptionMeta, ...]:
        cached = self._all_options_cache
        if cached is not None:
            return cached
        with self._all_options_lock:
            cached = self._all_options_cache
            if cached is not None:
                return cached
            base_rows = super().available_options()
            seen = {row.name.casefold() for row in base_rows}
            merged = base_rows + [
                row for row in self.ares.available_options()
                if row.name.casefold() not in seen
            ]
            cached = tuple(sorted(merged, key=lambda item: (item.category, item.description or item.name, item.name)))
            self._all_options_cache = cached
            return cached

    def warm_available_options(self) -> int:
        """Build the unified add-parameter catalog cache in a background thread."""
        return len(self._all_options())

    def available_options(
        self,
        *,
        query: str = "",
        applies_to: str | None = None,
        source: str | None = None,
    ) -> list[OptionMeta]:
        q = query.strip().casefold()
        source_fold = source.casefold() if source else ""
        result: list[OptionMeta] = []
        for meta in self._all_options():
            if source_fold and meta.source.casefold() != source_fold:
                continue
            if applies_to and meta.applies_to and applies_to not in meta.applies_to and "TechnoType" not in meta.applies_to:
                continue
            if q:
                haystack = " ".join((meta.name, meta.description, meta.help_text, meta.category)).casefold()
                if q not in haystack:
                    continue
            result.append(meta)
        return result
