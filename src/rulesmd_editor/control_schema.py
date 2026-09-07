from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterable

from .resource_paths import RESOURCE_ROOT


DEFAULT_SCHEMA = RESOURCE_ROOT / "generated" / "control_schema.json"

COUNTRY_LABELS = {
    "British": "英国",
    "French": "法国",
    "Germans": "德国",
    "Americans": "美国",
    "Alliance": "韩国",
    "Russians": "苏联",
    "Confederation": "古巴",
    "Africans": "利比亚",
    "Arabs": "伊拉克",
    "YuriCountry": "尤里",
}

COUNTRY_VALUES = tuple(COUNTRY_LABELS.items())
ABILITY_VALUES = (
    ("FASTER", "移动速度加强"),
    ("STRONGER", "生命值加强"),
    ("SCATTER", "自动分散火力"),
    ("FIREPOWER", "攻击力加强"),
    ("SIGHT", "视力加强"),
    ("CLOAK", "可以隐形"),
    ("TIBERIUM_PROOF", "免疫气体损害"),
    ("VEIN_PROOF", "免受VXL误伤"),
    ("SELF_HEAL", "自动治愈"),
    ("EXPLODES", "可以爆炸"),
    ("RADAR_INVISIBLE", "屏蔽雷达检测"),
    ("SENSORS", "侦测隐形单位"),
    ("FEARLESS", "不会畏惧"),
    ("TIBERIUM_HEAL", "矿石上治愈"),
    ("GUARD_AREA", "可以警戒"),
    ("CRUSHER", "可以碾压"),
    ("C4", "拥有C4炸弹"),
    ("ROF", "攻击速度加快"),
)
BUILDING_ALIAS_VALUES = (
    ("TECH", "科技类建筑"),
    ("BARRACKS", "兵营类建筑"),
    ("POWER", "发电厂类建筑"),
    ("PROC", "矿厂类建筑"),
    ("RADAR", "雷达类建筑"),
)


@dataclass(frozen=True)
class ControlSpec:
    widget: str
    values: tuple[tuple[str, str], ...] = ()
    dynamic: str | None = None


# HelpInfor.ini is more authoritative than the old web DSL for a handful of keys whose
# names contain misleading words such as "Weapon". Keep these semantic overrides ahead
# of generated legacy control metadata so they can never turn into Section-reference menus.
#
# The old Qt editor treated the three [MultipleMenu] families as hard Key semantics:
# Country, Abilities and Buildings. Keep them as runtime invariants too, so a missing or
# misplaced generated control schema can never silently turn these values into text fields.
CURATED_CONTROLS: dict[str, ControlSpec] = {
    "owner": ControlSpec("multi-select", COUNTRY_VALUES, "countries"),
    "requiredhouses": ControlSpec("multi-select", COUNTRY_VALUES, "countries"),
    "forbiddenhouses": ControlSpec("multi-select", COUNTRY_VALUES, "countries"),
    "secrethouses": ControlSpec("multi-select", COUNTRY_VALUES, "countries"),
    "veteranabilities": ControlSpec("multi-select", ABILITY_VALUES),
    "eliteabilities": ControlSpec("multi-select", ABILITY_VALUES),
    "prerequisite": ControlSpec("multi-select", BUILDING_ALIAS_VALUES, "buildings"),
    "prerequisiteoverride": ControlSpec("multi-select", BUILDING_ALIAS_VALUES, "buildings"),
    "dock": ControlSpec("multi-select", BUILDING_ALIAS_VALUES, "buildings"),
    "opentransportweapon": ControlSpec("select", (("0", "主武器"), ("1", "副武器"))),
    "deployfireweapon": ControlSpec("select", (("0", "主武器"), ("1", "副武器"))),
    "aibaseplanningside": ControlSpec("select", (("0", "盟军"), ("1", "苏军"))),
    "landtargeting": ControlSpec("select", (
        ("0", "可以攻击陆地单位"),
        ("1", "不能攻击陆地单位"),
        ("2", "使用副武器攻击陆地单位"),
    )),
    "specialthreatvalue": ControlSpec("select", (("0", "普通"), ("1", "特殊/英雄单位"))),
    "deployfacing": ControlSpec("select", (
        ("0", "北"), ("1", "东北"), ("2", "东"), ("3", "东南"),
        ("4", "南"), ("5", "西南"), ("6", "西"), ("7", "西北"),
    )),
}


class ControlSchema:
    """Runtime interpretation of the old RulesmdEditorWeb control DSL.

    The generated JSON comes from desc/OptionsDesc.ini and preserves the old web
    editor's key-driven control behavior. Value-shape fallbacks are intentionally
    last so explicit legacy metadata always wins, except for curated HelpInfor-backed
    semantic corrections above.
    """

    def __init__(self, path: Path | None = None):
        self.options: dict[str, dict] = {}
        self.lists: dict[str, list[dict[str, str]]] = {}
        schema_path = path or DEFAULT_SCHEMA
        if schema_path.exists():
            data = json.loads(schema_path.read_text("utf-8"))
            self.options = data.get("options", {})
            self.lists = data.get("lists", {})

    def _find(self, key: str) -> tuple[str, dict] | None:
        folded = key.casefold()
        for name, row in self.options.items():
            if name.casefold() == folded:
                return name, row
        return None

    def explicit(self, key: str) -> ControlSpec | None:
        curated = CURATED_CONTROLS.get(key.casefold())
        if curated is not None:
            return curated

        found = self._find(key)
        if not found:
            return None
        _name, row = found
        widget = row.get("widget")
        if not widget:
            return None
        list_name = row.get("list")
        values: tuple[tuple[str, str], ...] = ()
        if list_name and list_name in self.lists:
            if list_name == "Country":
                values = tuple(
                    (item["value"], COUNTRY_LABELS.get(item["value"], item.get("label") or item["value"]))
                    for item in self.lists[list_name]
                )
            else:
                values = tuple((item["value"], item.get("label") or item["value"]) for item in self.lists[list_name])
        return ControlSpec(widget=widget, values=values, dynamic=row.get("dynamic"))

    def resolve(
        self,
        key: str,
        value: str,
        *,
        dynamic_values: Iterable[tuple[str, str]] = (),
        fallback_values: Iterable[tuple[str, str]] = (),
        fallback_type: str = "text",
    ) -> ControlSpec:
        explicit = self.explicit(key)
        if explicit:
            dynamic_values = tuple(dynamic_values)
            values = dynamic_values if explicit.dynamic else explicit.values
            if explicit.dynamic == "buildings":
                # Same behavior as the old editor: category aliases plus the live
                # BuildingTypes candidates from the opened Rules document.
                values = tuple(dict.fromkeys((*explicit.values, *dynamic_values)))
            elif explicit.dynamic == "countries":
                # The old editor read the live [Countries] registration list. Static
                # vanilla values are only a resilience fallback for partial snippets.
                values = dynamic_values or explicit.values
            return ControlSpec(explicit.widget, values, explicit.dynamic)

        lowered = value.strip().casefold()
        if lowered in {"yes", "no"}:
            return ControlSpec("boolean", (("yes", "是"), ("no", "否")))
        if lowered in {"true", "false"}:
            # Some rules/mods use literal true/false rather than the classic yes/no.
            # Keep that dialect intact instead of silently rewriting it on first toggle.
            return ControlSpec("boolean", (("true", "真"), ("false", "假")))

        fallback_values = tuple(fallback_values)
        if fallback_values:
            if fallback_type.startswith("list"):
                return ControlSpec("multi-select", fallback_values)
            return ControlSpec("select", fallback_values)

        try:
            float(value.rstrip("%"))
            return ControlSpec("slider")
        except ValueError:
            return ControlSpec("text")
