from __future__ import annotations

import json

from rulesmd_editor import user_data
from rulesmd_editor.export_bridge import ExportMixRulesWorkspace


def _write_rules(path) -> None:
    path.write_text(
        "[InfantryTypes]\n"
        "0=E1\n"
        "\n"
        "[E1]\n"
        "UIName=Name:E1\n"
        "Name=GI ;普通 Name 注释\n"
        "Strength=125\n",
        encoding="utf-8",
    )


def test_custom_section_name_round_trips_through_ini_and_user_config(tmp_path, monkeypatch):
    user_file = tmp_path / "user-descriptions.json"
    monkeypatch.setattr(user_data, "USER_DESCRIPTIONS_FILE", user_file)

    rules = tmp_path / "rulesmd.ini"
    _write_rules(rules)

    workspace = ExportMixRulesWorkspace()
    workspace.open_file(rules)
    builtin = workspace.section("E1")["description"]

    result = workspace.set_section_display_name("E1", "自定义美国大兵")
    assert result["name"] == "自定义美国大兵"
    assert result["custom"] is True
    assert ";@rulesmd-name=自定义美国大兵" in workspace.section("E1")["raw"]

    stored = json.loads(user_file.read_text(encoding="utf-8"))
    assert stored["SectionName"]["E1"] == "自定义美国大兵"

    workspace.save(rules)
    reopened = ExportMixRulesWorkspace()
    reopened.open_file(rules)
    assert reopened.section("E1")["description"] == "自定义美国大兵"

    restored = reopened.set_section_display_name("E1", builtin)
    assert restored["name"] == builtin
    assert restored["custom"] is False
    assert "@rulesmd-name" not in reopened.section("E1")["raw"]

    stored = json.loads(user_file.read_text(encoding="utf-8"))
    assert "E1" not in stored["SectionName"]


def test_option_descriptions_and_section_names_share_user_file_without_clobbering(tmp_path, monkeypatch):
    user_file = tmp_path / "user-descriptions.json"
    monkeypatch.setattr(user_data, "USER_DESCRIPTIONS_FILE", user_file)

    user_data.set_user_description("Strength", "生命值")
    user_data.set_user_section_name("E1", "自定义大兵")

    stored = json.loads(user_file.read_text(encoding="utf-8"))
    assert stored["OptionDesc"]["Strength"] == "生命值"
    assert stored["SectionName"]["E1"] == "自定义大兵"

    user_data.set_user_description("Strength", "耐久")
    stored = json.loads(user_file.read_text(encoding="utf-8"))
    assert stored["OptionDesc"]["Strength"] == "耐久"
    assert stored["SectionName"]["E1"] == "自定义大兵"
