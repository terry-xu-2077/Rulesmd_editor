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
    "windowWidth": 1680,
    "windowHeight": 1020,
}

USER_DESCRIPTION_BUCKETS = {
    "OptionDesc": {},
    "SectionName": {},
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
        ("windowWidth", 1680, 1120, 7680),
        ("windowHeight", 1020, 680, 4320),
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
        ("windowWidth", 1680, 1120, 7680),
        ("windowHeight", 1020, 680, 4320),
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


def _load_user_description_payload() -> dict[str, Any]:
    stored = _read_json(USER_DESCRIPTIONS_FILE, USER_DESCRIPTION_BUCKETS)
    # Preserve unknown future buckets instead of rewriting the file down to only the
    # fields understood by this version of the editor.
    payload = dict(stored)
    for bucket in USER_DESCRIPTION_BUCKETS:
        if not isinstance(payload.get(bucket), dict):
            payload[bucket] = {}
    return payload


def _load_user_description_bucket(bucket: str) -> dict[str, str]:
    rows = _load_user_description_payload().get(bucket, {})
    if not isinstance(rows, dict):
        return {}
    return {
        str(key): str(value)
        for key, value in rows.items()
        if str(key).strip() and str(value).strip()
    }


def _set_user_description_bucket(bucket: str, key: str, value: str, *, key_label: str) -> dict[str, str]:
    clean_key = key.strip()
    if not clean_key:
        raise ValueError(f"{key_label} 不能为空")

    payload = _load_user_description_payload()
    current = payload.get(bucket, {})
    rows = {
        str(row_key): str(row_value)
        for row_key, row_value in current.items()
        if str(row_key).strip() and str(row_value).strip()
    } if isinstance(current, dict) else {}

    # Preserve a single canonical spelling per case-insensitive key.
    for existing in tuple(rows):
        if existing.casefold() == clean_key.casefold() and existing != clean_key:
            rows.pop(existing, None)

    clean_value = value.strip()
    if clean_value:
        rows[clean_key] = clean_value
    else:
        rows.pop(clean_key, None)

    payload[bucket] = rows
    _write_json(USER_DESCRIPTIONS_FILE, payload)
    return rows


def ensure_user_data_files() -> None:
    if not APP_CONFIG_FILE.exists():
        _write_json(APP_CONFIG_FILE, load_app_config())
    if not USER_DESCRIPTIONS_FILE.exists():
        _write_json(USER_DESCRIPTIONS_FILE, deepcopy(USER_DESCRIPTION_BUCKETS))


def load_user_descriptions() -> dict[str, str]:
    return _load_user_description_bucket("OptionDesc")


def set_user_description(key: str, value: str) -> dict[str, str]:
    return _set_user_description_bucket("OptionDesc", key, value, key_label="参数 Key")


def load_user_section_names() -> dict[str, str]:
    return _load_user_description_bucket("SectionName")


def set_user_section_name(section: str, value: str) -> dict[str, str]:
    return _set_user_description_bucket("SectionName", section, value, key_label="Section")


ensure_user_data_files()
