from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import configparser
import json

from .category_rules import categorize_yr_option


@dataclass(frozen=True)
class OptionMeta:
    name: str
    description: str = ""
    help_text: str = ""
    category: str = "其他"
    source: str = "YR"
    values: tuple[tuple[str, str], ...] = ()
    value_type: str = "text"
    applies_to: tuple[str, ...] = ()
    default: str = ""
    docs: str = ""


class SchemaCatalog:
    """Original Yuri's Revenge / rulesmd metadata only.

    Ares metadata deliberately lives in ``ares_schema.py`` and ``ares_schema.json``.
    Runtime code may merge both catalogs for one editor experience, but this class
    never imports or embeds Ares rules.
    """

    def __init__(self, resource_dir: Path | None = None):
        self.options: dict[str, OptionMeta] = {}
        self.name_desc: dict[str, str] = {}
        self.resource_dir = resource_dir
        if resource_dir:
            self._load_legacy(resource_dir)
        self._load_json_overlay()

    @staticmethod
    def _read_ini(path: Path) -> configparser.ConfigParser | None:
        if not path.exists():
            return None
        cp = configparser.ConfigParser(interpolation=None, strict=False, delimiters=("=",))
        cp.optionxform = str
        for enc in ("utf-8-sig", "gb18030", "cp1252"):
            try:
                cp.read(path, encoding=enc)
                return cp
            except UnicodeDecodeError:
                cp.clear()
        return None

    def _load_legacy(self, root: Path) -> None:
        desc = self._read_ini(root / "OptionsDesc.ini")
        help_ini = self._read_ini(root / "HelpInfor.ini")
        names = self._read_ini(root / "NamesDesc.ini")
        categories = self._read_ini(root / "OptionCategory.ini")
        category_map: dict[str, str] = {}
        if categories and categories.has_section("UnitOptions"):
            labels = {
                "General": "通用",
                "Owner": "阵营",
                "Weapon": "武器",
                "MoveType": "运动",
                "Visual": "视觉",
                "Audio": "声音",
            }
            for key, label in labels.items():
                for option in categories.get("UnitOptions", key, fallback="").split(","):
                    if option.strip():
                        category_map[option.strip()] = label
        if desc and desc.has_section("OptionDesc"):
            for key, text in desc.items("OptionDesc"):
                old = self.options.get(key)
                help_text = ""
                values: list[tuple[str, str]] = []
                if help_ini and help_ini.has_section("HelpInfo"):
                    help_text = help_ini.get("HelpInfo", key, fallback="").replace("\\n", "\n")
                list_section = f"{key}_List"
                if desc.has_section(list_section):
                    values = list(desc.items(list_section))
                legacy_category = category_map.get(key, old.category if old else "")
                self.options[key] = OptionMeta(
                    key,
                    text,
                    help_text or (old.help_text if old else ""),
                    categorize_yr_option(key, legacy_category),
                    "YR",
                    tuple(values) or (old.values if old else ()),
                    old.value_type if old else "text",
                    old.applies_to if old else (),
                    old.default if old else "",
                    old.docs if old else "",
                )
        if names and names.has_section("NameDesc"):
            self.name_desc.update(dict(names.items("NameDesc")))

    def _load_json_overlay(self) -> None:
        """Optional YR-only corrections overlay.

        Kept for compatibility with older resource layouts. Ares JSON is never loaded
        here; it belongs to ``AresSchemaCatalog``.
        """
        if not self.resource_dir:
            return
        path = self.resource_dir / "yr_options.json"
        if not path.exists():
            return
        try:
            data = json.loads(path.read_text("utf-8"))
        except Exception:
            return
        for key, row in data.items():
            old = self.options.get(key)
            requested_category = row.get("category", old.category if old else "")
            self.options[key] = OptionMeta(
                key,
                row.get("description", old.description if old else ""),
                row.get("help", old.help_text if old else ""),
                categorize_yr_option(key, str(requested_category)),
                "YR",
                tuple(tuple(x) for x in row.get("values", old.values if old else ())),
                row.get("value_type", old.value_type if old else "text"),
                tuple(row.get("applies_to", old.applies_to if old else ())),
                row.get("default", old.default if old else ""),
                row.get("docs", old.docs if old else ""),
            )

    def option(self, key: str) -> OptionMeta:
        if key in self.options:
            return self.options[key]
        folded = key.casefold()
        for name, meta in self.options.items():
            if name.casefold() == folded:
                return meta
        return OptionMeta(key, source="自定义")

    def available_options(
        self,
        *,
        query: str = "",
        applies_to: str | None = None,
        source: str | None = None,
    ) -> list[OptionMeta]:
        q = query.strip().casefold()
        result: list[OptionMeta] = []
        for meta in self.options.values():
            if source and meta.source.casefold() != source.casefold():
                continue
            if applies_to and meta.applies_to and applies_to not in meta.applies_to and "TechnoType" not in meta.applies_to:
                continue
            if q:
                haystack = " ".join((meta.name, meta.description, meta.help_text, meta.category)).casefold()
                if q not in haystack:
                    continue
            result.append(meta)
        return sorted(result, key=lambda item: (item.category, item.description or item.name, item.name))

    def section_description(self, section: str) -> str:
        return self.name_desc.get(section, "")
