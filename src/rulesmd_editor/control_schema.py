from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterable


RESOURCE_ROOT = Path(__file__).resolve().parent / "resources"
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


@dataclass(frozen=True)
class ControlSpec:
    widget: str
    values: tuple[tuple[str, str], ...] = ()
    dynamic: str | None = None


# HelpInfor.ini is more authoritative than the old web DSL for a handful of keys whose
# names contain misleading words such as "Weapon". Keep these semantic overrides ahead
# of generated legacy control metadata so they can never turn into Section-reference menus.
CURATED_CONTROLS: dict[str, ControlSpec] = {
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
        name, row = found
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
            values = tuple(dynamic_values) if explicit.dynamic else explicit.values
            if explicit.dynamic == "buildings":
                # Static category aliases from Buildings_List remain useful in addition
                # to live BuildingTypes entries from the current document.
                values = tuple(dict.fromkeys((*explicit.values, *tuple(dynamic_values))))
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
