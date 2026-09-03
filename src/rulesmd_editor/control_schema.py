from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterable


RESOURCE_ROOT = Path(__file__).resolve().parent / "resources"
DEFAULT_SCHEMA = RESOURCE_ROOT / "generated" / "control_schema.json"


@dataclass(frozen=True)
class ControlSpec:
    widget: str
    values: tuple[tuple[str, str], ...] = ()
    dynamic: str | None = None


class ControlSchema:
    """Runtime interpretation of the old RulesmdEditorWeb control DSL.

    The generated JSON comes from desc/OptionsDesc.ini and preserves the old web
    editor's key-driven control behavior. Value-shape fallbacks are intentionally
    last so explicit legacy metadata always wins.
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
