from __future__ import annotations

import json

import rulesmd_editor.user_data as user_data


def test_app_config_is_normalized_and_written_to_resources(tmp_path, monkeypatch):
    config_file = tmp_path / "app-config.json"
    monkeypatch.setattr(user_data, "APP_CONFIG_FILE", config_file)

    saved = user_data.save_app_config({
        "gamePath": r"D:\\YURI\\RunAres.bat",
        "appearance": "light",
        "leftPane": 9999,
        "rightPane": 1,
        "lastFile": r"D:\\YURI\\rulesmd.ini",
        "aresEnabled": False,
        "ignored": "not persisted",
    })

    assert saved["gamePath"].endswith("RunAres.bat")
    assert saved["appearance"] == "light"
    assert saved["leftPane"] == 420
    assert saved["rightPane"] == 300
    assert saved["aresEnabled"] is False
    payload = json.loads(config_file.read_text(encoding="utf-8"))
    assert "ignored" not in payload


def test_user_description_is_separate_case_insensitive_override(tmp_path, monkeypatch):
    description_file = tmp_path / "user-descriptions.json"
    monkeypatch.setattr(user_data, "USER_DESCRIPTIONS_FILE", description_file)

    rows = user_data.set_user_description("Sight", "自定义视野范围")
    assert rows == {"Sight": "自定义视野范围"}

    rows = user_data.set_user_description("sight", "新的中文描述")
    assert rows == {"sight": "新的中文描述"}
    assert json.loads(description_file.read_text(encoding="utf-8")) == {
        "OptionDesc": {"sight": "新的中文描述"}
    }

    rows = user_data.set_user_description("SIGHT", "")
    assert rows == {}
