from __future__ import annotations

from dataclasses import replace
import json
from threading import Lock

from .ares_schema import AresSchemaCatalog
from .category_rules import categorize_yr_option
from .resource_paths import RESOURCE_ROOT
from .schema import OptionMeta, SchemaCatalog
from .translations_zh import (
    PARAMETER_META_FIXES,
    apply_yr_translations,
    guess_section_name,
    translate_option_meta,
)
from .yr_translation_audit import audit_yr_meta


LEGACY_ROOT = RESOURCE_ROOT / "legacy"
GENERATED_ROOT = RESOURCE_ROOT / "generated"

# These are original Yuri's Revenge keys whose behavior/range is extended by Ares.
# They must stay available when Ares assistance is disabled; only their explanatory
# metadata is enriched with the Ares hard-code-unlock note.
ARES_EXTENDED_YR_KEYS = frozenset({
    "armor",
    "cellspread",
    "gunner",
    "sight",
    "turretcount",
})


def _has_curated_yr_semantics(key: str) -> bool:
    folded = key.casefold()
    return any(name.casefold() == folded for name in PARAMETER_META_FIXES)


def _inferred_unknown_meta(meta: OptionMeta) -> OptionMeta:
    """Give a readable label to an unknown non-dotted key without inventing semantics."""
    translated = translate_option_meta(meta)
    if translated.description and translated.description.casefold() != meta.name.casefold():
        return replace(
            translated,
            help_text=(
                "【名称自动推断】当前没有找到可靠的内置参数说明；中文名仅根据英文 Key 的可识别单词生成。"
                "请以原始 Key、游戏实际行为或可靠文档为准。编辑器不会改写真实 Key。"
            ),
        )
    return meta


class RuntimeSchemaCatalog(SchemaCatalog):
    """Unified presentation catalog backed by physically separate rule sources."""

    def __init__(self) -> None:
        super().__init__(LEGACY_ROOT if LEGACY_ROOT.exists() else None)
        self._load_generated_yr()
        apply_yr_translations(self.options, self.name_desc)
        # Historical/manual Chinese data is useful, but verified review overrides sit
        # above it so a known mistranslation cannot win merely because it came from JSON.
        for key, meta in list(self.options.items()):
            self.options[key] = audit_yr_meta(meta)
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
        if base.source != "自定义":
            # ``super().option`` can synthesize a YR row directly from HelpInfor.ini
            # when OptionsDesc omitted a legitimate engine key. Translate/correct that
            # row on demand just like the eagerly loaded catalog rows. Ares may further
            # enrich an original YR tag when it removes a vanilla hard-coded limit.
            return self.ares.enrich(audit_yr_meta(translate_option_meta(base)))

        # Some original YR keys are absent from one or more historical metadata files.
        # Only explicit semantic corrections count as evidence that such a key is YR.
        # A generic Chinese label guess must never shadow a real Ares key.
        if _has_curated_yr_semantics(key):
            fixed = replace(translate_option_meta(base), source="YR")
            return self.ares.enrich(audit_yr_meta(fixed))

        # A handful of well-known vanilla tags are missing from the historical metadata
        # snapshots even though the engine supports them. Ares only extends their range
        # or removes a hard-coded identity check, so never reclassify them as Ares-only.
        if key.casefold() in ARES_EXTENDED_YR_KEYS and self.ares.is_hardcode_unlock(key):
            return replace(self.ares.enrich(audit_yr_meta(base)), source="YR")

        ares = self.ares.option(key)
        if ares is not None:
            return self.ares.enrich(ares)

        # Ares establishes the dotted Key convention.  Known families are synthesized by
        # AresSchemaCatalog above.  A completely unknown dotted family remains Ares so the
        # filter/badge is still correct, but its semantics are not invented.
        if "." in key:
            return OptionMeta(
                key,
                source="Ares",
                help_text=(
                    "检测到 Ares 风格的点号参数，但当前没有匹配到已知参数族。"
                    "编辑器保留原始 Key，不根据名称猜测具体语义。"
                ),
            )

        # Original rulesmd.ini and mods contain many readable CamelCase/PascalCase keys.
        # A conservative all-token translation is useful as a label, but it does not turn
        # an unknown key into a verified YR key and never fabricates a gameplay description.
        return _inferred_unknown_meta(base)

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
            base_rows = [self.ares.enrich(row) for row in super().available_options()]
            seen = {row.name.casefold() for row in base_rows}
            extra_rows: list[OptionMeta] = []
            for row in self.ares.available_options():
                folded = row.name.casefold()
                if folded in seen:
                    continue
                enriched = self.ares.enrich(row)
                if folded in ARES_EXTENDED_YR_KEYS:
                    enriched = replace(enriched, source="YR")
                extra_rows.append(enriched)
            merged = base_rows + extra_rows
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
