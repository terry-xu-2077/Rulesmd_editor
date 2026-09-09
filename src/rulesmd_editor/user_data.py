from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any

from .resource_paths import RESOURCE_ROOT

APP_CONFIG_FILE = RESOURCE_ROOT / "app-config.json"
USER_DESCRIPTIONS_FILE = RESOURCE_ROOT / "user-descriptions.json"

DEFAULT_APP_CONFIG: dict[str, Any] = {
    "gamePath": "",
    "appearance": "dark",
    "leftPane": 230,
    "rightPane": 390,
    "lastFile": "",
    "aresEnabled": True,
}


def _read_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
        return raw if isinstance(raw, dict) else deepcopy(default)
    except (FileNotFoundError, json.JSONDecodeError, UnicodeDecodeError, OSError):
        return deepcopy(default)


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def load_app_config() -> dict[str, Any]:
    stored = _read_json(APP_CONFIG_FILE, DEFAULT_APP_CONFIG)
    result = deepcopy(DEFAULT_APP_CONFIG)
    result.update({key: value for key, value in stored.items() if key in result})

    appearance = str(result.get("appearance", "dark"))
    if appearance not in {"dark", "light", "system"}:
        result["appearance"] = "dark"
    for key, fallback, minimum, maximum in (
        ("leftPane", 230, 180, 420),
        ("rightPane", 390, 300, 620),
    ):
        try:
            result[key] = max(minimum, min(maximum, int(result.get(key, fallback))))
        except (TypeError, ValueError):
            result[key] = fallback
    result["gamePath"] = str(result.get("gamePath", ""))
    result["lastFile"] = str(result.get("lastFile", ""))
    result["aresEnabled"] = bool(result.get("aresEnabled", True))
    return result


def save_app_config(values: dict[str, Any]) -> dict[str, Any]:
    current = load_app_config()
    current.update({key: value for key, value in values.items() if key in DEFAULT_APP_CONFIG})
    # Re-run normalization before writing.
    normalized = deepcopy(DEFAULT_APP_CONFIG)
    normalized.update(current)
    appearance = str(normalized.get("appearance", "dark"))
    normalized["appearance"] = appearance if appearance in {"dark", "light", "system"} else "dark"
    for key, fallback, minimum, maximum in (
        ("leftPane", 230, 180, 420),
        ("rightPane", 390, 300, 620),
    ):
        try:
            normalized[key] = max(minimum, min(maximum, int(normalized.get(key, fallback))))
        except (TypeError, ValueError):
            normalized[key] = fallback
    normalized["gamePath"] = str(normalized.get("gamePath", ""))
    normalized["lastFile"] = str(normalized.get("lastFile", ""))
    normalized["aresEnabled"] = bool(normalized.get("aresEnabled", True))
    _write_json(APP_CONFIG_FILE, normalized)
    return normalized


def ensure_user_data_files() -> None:
    if not APP_CONFIG_FILE.exists():
        _write_json(APP_CONFIG_FILE, load_app_config())
    if not USER_DESCRIPTIONS_FILE.exists():
        _write_json(USER_DESCRIPTIONS_FILE, {"OptionDesc": {}})


def load_user_descriptions() -> dict[str, str]:
    stored = _read_json(USER_DESCRIPTIONS_FILE, {"OptionDesc": {}})
    rows = stored.get("OptionDesc", {})
    if not isinstance(rows, dict):
        return {}
    return {
        str(key): str(value)
        for key, value in rows.items()
        if str(key).strip() and str(value).strip()
    }


def set_user_description(key: str, value: str) -> dict[str, str]:
    clean_key = key.strip()
    if not clean_key:
        raise ValueError("参数 Key 不能为空")
    rows = load_user_descriptions()
    # Preserve a single canonical spelling per case-insensitive key.
    for existing in tuple(rows):
        if existing.casefold() == clean_key.casefold() and existing != clean_key:
            rows.pop(existing, None)
    clean_value = value.strip()
    if clean_value:
        rows[clean_key] = clean_value
    else:
        rows.pop(clean_key, None)
    _write_json(USER_DESCRIPTIONS_FILE, {"OptionDesc": rows})
    return rows


ensure_user_data_files()
