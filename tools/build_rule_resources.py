from __future__ import annotations

"""Build the runtime rules database from the legacy editor resources.

The legacy INI files remain useful as source material, but the application should not
re-parse several loose INI files for every lookup. This tool downloads/synchronizes the
legacy text resources, normalizes them, merges curated corrections and the built-in
Ares catalog, and writes compact JSON files plus a cleaned Yuri's Revenge template.

Run from the repository root:
    python tools/build_rule_resources.py
"""

from collections import OrderedDict
from dataclasses import asdict
import json
from pathlib import Path
import re
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RESOURCE_ROOT = ROOT / "src" / "rulesmd_editor" / "resources"
LEGACY_DIR = RESOURCE_ROOT / "legacy"
GENERATED_DIR = RESOURCE_ROOT / "generated"
BASE_URL = "https://raw.githubusercontent.com/terry-xu-2077/RulesmdEditor/master/Resources/"

TEXT_SOURCES = (
    "HelpInfor.ini",
    "IdentType.ini",
    "ModDesc.ini",
    "NamesDesc.ini",
    "OptionCategory.ini",
    "OptionsDesc.ini",
    "rulesmd.pre",
)

# Corrections are deliberately an overlay: never silently mutate the historical source.
# A misspelled *engine key* is not corrected here when the game itself expects that
# spelling; only metadata/semantics are corrected.
CURATED_FIXES: dict[str, dict[str, object]] = {
    "RadarInvisible": {"description": "雷达隐形", "value_type": "boolean"},
    "ImmuneToRadiation": {"description": "免疫辐射伤害", "value_type": "boolean"},
    "ImmuneToVeins": {"description": "免疫矿脉伤害", "value_type": "boolean"},
    "ImmuneToPsionics": {"description": "免疫心灵控制", "value_type": "boolean"},
    "OmniCrushResistant": {"description": "抵抗全碾压", "value_type": "boolean"},
    "ConstructionYard": {"description": "建造厂", "value_type": "boolean"},
    "Wall": {"description": "围墙", "value_type": "boolean"},
    "Capturable": {"description": "可被工程师占领", "value_type": "boolean"},
    "Radar": {"description": "提供雷达", "value_type": "boolean"},
    "Powered": {"description": "需要电力", "value_type": "boolean"},
    "Repairable": {"description": "可维修", "value_type": "boolean"},
    "Selectable": {"description": "可选择", "value_type": "boolean"},
    "IsSelectableCombatant": {"description": "可作为战斗单位选择", "value_type": "boolean"},
    "CanPassiveAquire": {"description": "可自动索敌", "value_type": "boolean"},
    "CanRetaliate": {"description": "可自动反击", "value_type": "boolean"},
}

BOOL_HINTS = {
    "yes", "no", "true", "false"
}

CATEGORY_LABELS = {
    "General": "通用",
    "Owner": "阵营",
    "Weapon": "武器",
    "MoveType": "运动",
    "Visual": "视觉",
    "Audio": "声音",
}


def _download(name: str) -> bytes:
    request = Request(BASE_URL + name, headers={"User-Agent": "RulesmdEditor-resource-builder"})
    with urlopen(request, timeout=45) as response:
        return response.read()


def _decode(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030", "cp1252"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise UnicodeDecodeError("utf-8", data, 0, 1, "unsupported legacy resource encoding")


def sync_sources(force: bool = False) -> None:
    LEGACY_DIR.mkdir(parents=True, exist_ok=True)
    for name in TEXT_SOURCES:
        target = LEGACY_DIR / name
        if target.exists() and not force:
            continue
        print(f"sync {name}")
        target.write_bytes(_download(name))


def parse_loose_ini(text: str) -> OrderedDict[str, list[tuple[str, str]]]:
    """Parse the simple metadata INIs without configparser's duplicate restrictions."""
    sections: OrderedDict[str, list[tuple[str, str]]] = OrderedDict()
    current: str | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith((";", "#")):
            continue
        if line.startswith("[") and "]" in line:
            current = line[1:line.index("]")].strip()
            sections.setdefault(current, [])
            continue
        if current is None or "=" not in raw:
            continue
        key, value = raw.split("=", 1)
        sections[current].append((key.strip(), value.strip()))
    return sections


def _section_dict(sections: OrderedDict[str, list[tuple[str, str]]], name: str) -> dict[str, str]:
    return dict(sections.get(name, ()))


def _infer_value_type(key: str, values: list[dict[str, str]], description: str) -> str:
    lowered = key.casefold()
    if values:
        value_set = {item["value"].casefold() for item in values}
        if value_set and value_set <= BOOL_HINTS:
            return "boolean"
        if key in {"Owner", "RequiredHouses", "ForbiddenHouses", "VeteranAbilities", "EliteAbilities", "Prerequisite", "Dock"}:
            return "multi-select"
        return "enum"
    if lowered.startswith(("is", "can", "has", "immune", "allowed", "trainable", "capturable", "repairable", "selectable")):
        return "boolean"
    if any(token in lowered for token in ("percent", "multiplier", "factor", "rate")):
        return "float"
    if any(token in lowered for token in ("cost", "strength", "speed", "sight", "size", "range", "level", "points", "power", "ammo", "passengers", "delay", "duration", "count", "number", "limit")):
        return "integer"
    if any(token in lowered for token in ("weapon", "primary", "secondary")):
        return "weapon"
    if "warhead" in lowered:
        return "warhead"
    if "projectile" in lowered:
        return "projectile"
    if any(token in lowered for token in ("anim", "image")):
        return "animation"
    if description.startswith(("是否", "能否", "可以", "可被", "免疫")):
        return "boolean"
    return "text"


def build_schema() -> tuple[dict[str, dict[str, object]], dict[str, str], dict[str, object], dict[str, object]]:
    options_ini = parse_loose_ini(_decode((LEGACY_DIR / "OptionsDesc.ini").read_bytes()))
    help_ini = parse_loose_ini(_decode((LEGACY_DIR / "HelpInfor.ini").read_bytes()))
    names_ini = parse_loose_ini(_decode((LEGACY_DIR / "NamesDesc.ini").read_bytes()))
    categories_ini = parse_loose_ini(_decode((LEGACY_DIR / "OptionCategory.ini").read_bytes()))
    identify_ini = parse_loose_ini(_decode((LEGACY_DIR / "IdentType.ini").read_bytes()))
    mod_ini = parse_loose_ini(_decode((LEGACY_DIR / "ModDesc.ini").read_bytes()))

    descriptions = _section_dict(options_ini, "OptionDesc")
    helps = _section_dict(help_ini, "HelpInfo")
    category_map: dict[str, str] = {}
    unit_options = _section_dict(categories_ini, "UnitOptions")
    for group, options in unit_options.items():
        label = CATEGORY_LABELS.get(group, group)
        for option in options.split(","):
            option = option.strip()
            if option:
                category_map[option] = label

    rows: dict[str, dict[str, object]] = {}
    for key, description in descriptions.items():
        list_name = f"{key}_List"
        values = [{"value": value, "label": label} for value, label in options_ini.get(list_name, [])]
        rows[key] = {
            "key": key,
            "description": description,
            "help": helps.get(key, "").replace("\\n", "\n"),
            "category": category_map.get(key, "特殊"),
            "source": "YR",
            "values": values,
            "value_type": _infer_value_type(key, values, description),
            "applies_to": [],
            "default": "",
            "docs": "",
        }

    for key, patch in CURATED_FIXES.items():
        row = rows.setdefault(key, {
            "key": key, "description": key, "help": "", "category": "特殊", "source": "YR",
            "values": [], "value_type": "text", "applies_to": [], "default": "", "docs": "",
        })
        row.update(patch)

    # Merge Ares as first-class metadata. Runtime still allows unknown/manual Ares keys.
    from rulesmd_editor.schema import ARES_OPTIONS
    for key, meta in ARES_OPTIONS.items():
        old = rows.get(key, {})
        rows[key] = {
            "key": key,
            "description": meta.description or old.get("description", key),
            "help": meta.help_text or old.get("help", ""),
            "category": meta.category or old.get("category", "Ares"),
            "source": "Ares",
            "values": [{"value": value, "label": label} for value, label in meta.values],
            "value_type": meta.value_type,
            "applies_to": list(meta.applies_to),
            "default": meta.default,
            "docs": meta.docs,
        }

    names = _section_dict(names_ini, "NameDesc")
    identify = {
        section: {
            key: [part.strip() for part in value.split(",") if part.strip()]
            for key, value in entries
        }
        for section, entries in identify_ini.items()
    }
    mod_data = {
        section: dict(entries)
        for section, entries in mod_ini.items()
    }
    return rows, names, identify, mod_data


def modenc_clean_template(text: str) -> tuple[str, dict[str, int]]:
    """Apply CorrectRulesCode.py semantics, with safe split-once behavior.

    This is intentionally used only to create the bundled *new document* template.
    User-opened files remain lossless and are never silently rewritten this way.
    """
    normalized = text.replace("\t", "").replace("\u00a0;", ";")
    normalized = re.sub(r"[ ]+\r?\n", "\n", normalized)
    normalized = re.sub(r"[ ]*=+[ ]*", "=", normalized)

    sections: OrderedDict[str, OrderedDict[str, str]] = OrderedDict()
    current: str | None = None
    invalid_lines = 0
    duplicate_sections = 0
    duplicate_keys = 0
    comments_removed = 0

    for raw in normalized.splitlines():
        stripped = raw.strip()
        if stripped.startswith("[") and "]" in stripped:
            name = stripped[1:stripped.index("]")].strip()
            if name in sections:
                duplicate_sections += 1
            current = name
            sections.setdefault(name, OrderedDict())
            continue
        if current is None:
            if stripped:
                invalid_lines += 1
            continue
        if not stripped:
            continue
        if stripped.startswith((";", "#")):
            comments_removed += 1
            continue
        if "=" not in raw:
            invalid_lines += 1
            continue
        key, value = raw.split("=", 1)
        key = key.strip()
        value = value.strip()
        if ";" in value:
            value = value.split(";", 1)[0].rstrip()
            comments_removed += 1
        if not key:
            invalid_lines += 1
            continue
        if key in sections[current]:
            duplicate_keys += 1
        sections[current][key] = value

    lines: list[str] = []
    for section, options in sections.items():
        lines.append(f"[{section}]")
        lines.extend(f"{key}={value}" for key, value in options.items())
        lines.append("")
    result = "\r\n".join(lines).rstrip("\r\n") + "\r\n"
    report = {
        "section_count": len(sections),
        "option_count": sum(len(options) for options in sections.values()),
        "invalid_lines_removed": invalid_lines,
        "duplicate_sections_merged": duplicate_sections,
        "duplicate_keys_overwritten": duplicate_keys,
        "comments_removed": comments_removed,
    }
    return result, report


def main() -> None:
    sync_sources()
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    rows, names, identify, mod_data = build_schema()
    template_text, clean_report = modenc_clean_template(_decode((LEGACY_DIR / "rulesmd.pre").read_bytes()))

    (GENERATED_DIR / "rules_schema.json").write_text(
        json.dumps({"version": 1, "options": rows}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    (GENERATED_DIR / "section_names.json").write_text(
        json.dumps(names, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    (GENERATED_DIR / "identify_rules.json").write_text(
        json.dumps(identify, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    (GENERATED_DIR / "mod_metadata.json").write_text(
        json.dumps(mod_data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    (GENERATED_DIR / "rulesmd.template.ini").write_text(template_text, encoding="utf-8", newline="")
    report = {
        "source": "terry-xu-2077/RulesmdEditor Resources",
        "schema_options": len(rows),
        "section_names": len(names),
        "ares_options": sum(1 for row in rows.values() if row.get("source") == "Ares"),
        "template": clean_report,
        "notes": [
            "Legacy metadata is treated as source material and corrected through overlays.",
            "Ares metadata is merged into the same option catalog as Yuri's Revenge.",
            "Unknown/manual Ares tags remain losslessly editable even if not catalogued.",
            "Template cleaning follows ModEnc CorrectRulesCode.py semantics but splits key/value only once.",
        ],
    }
    (GENERATED_DIR / "build_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
