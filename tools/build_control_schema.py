"""Compile RulesmdEditorWeb OptionsDesc.ini into a runtime control schema.

This preserves the original web editor semantics instead of inventing a new
mapping layer:
- [OptionDesc] gives display labels.
- [<Key>_List] means a single-select list.
- [MultipleMenu] maps option keys to shared multi-select lists.
- [UnitMenu] maps option keys to dynamic rulesmd.ini object lists.

The generated file is intentionally small and fast to load at runtime.
"""
from __future__ import annotations

import configparser
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "rulesmd_editor" / "resources" / "legacy" / "web" / "OptionsDesc.ini"
OUTPUT = ROOT / "src" / "rulesmd_editor" / "resources" / "generated" / "control_schema.json"


def read_ini(path: Path) -> configparser.ConfigParser:
    cp = configparser.ConfigParser(interpolation=None, strict=False, delimiters=("=",))
    cp.optionxform = str
    data = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            cp.read_string(data.decode(encoding))
            return cp
        except UnicodeDecodeError:
            cp.clear()
    raise UnicodeDecodeError("utf-8", data, 0, 1, "unable to decode OptionsDesc.ini")


def clean_items(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"missing source: {SOURCE}; run tools/import_legacy_resources.py first")

    cp = read_ini(SOURCE)
    labels = dict(cp.items("OptionDesc")) if cp.has_section("OptionDesc") else {}

    lists: dict[str, list[dict[str, str]]] = {}
    for section in cp.sections():
        if not section.endswith("_List"):
            continue
        name = section[:-5]
        lists[name] = [
            {"value": key, "label": value.replace("$-", "").strip() or key}
            for key, value in cp.items(section)
        ]

    multi_groups: dict[str, str] = {}
    if cp.has_section("MultipleMenu"):
        for group_key, option_names in cp.items("MultipleMenu"):
            group = group_key.removesuffix("_Type")
            for option in clean_items(option_names):
                multi_groups[option] = group

    dynamic_units: dict[str, str] = {}
    if cp.has_section("UnitMenu"):
        for entity_type, option in cp.items("UnitMenu"):
            dynamic_units[option.strip()] = entity_type.strip()

    options: dict[str, dict] = {}
    all_keys = set(labels) | set(multi_groups) | set(dynamic_units) | set(lists)
    for key in sorted(all_keys, key=str.casefold):
        row = {"label": labels.get(key, key)}
        if key in multi_groups:
            group = multi_groups[key]
            row.update({
                "widget": "multi-select",
                "list": group,
                "dynamic": "buildings" if group == "Buildings" else None,
            })
        elif key in dynamic_units:
            row.update({"widget": "select", "dynamic": f"unit:{dynamic_units[key]}"})
        elif key in lists:
            row.update({"widget": "select", "list": key})
        options[key] = row

    payload = {
        "version": 1,
        "source": "RulesmdEditorWeb/desc/OptionsDesc.ini",
        "options": options,
        "lists": lists,
        "multiple_menu": multi_groups,
        "unit_menu": dynamic_units,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"generated {OUTPUT} ({len(options)} option rules, {len(lists)} lists)")


if __name__ == "__main__":
    main()
