from rulesmd_editor.bridge import Bridge


def test_parameter_disable_is_reversible_and_lossless(tmp_path):
    path = tmp_path / "rulesmd.ini"
    path.write_text("[General]\nStrength=125 ; keep me\nVeteranRatio=3.0\n", encoding="utf-8")

    bridge = Bridge()
    bridge.rpc_open_file(str(path))
    section = bridge.rpc_section("General")
    strength = next(row for row in section["options"] if row["key"] == "Strength")

    disabled = bridge.rpc_set_line_disabled(strength["line_id"], True)
    disabled_row = next(row for row in disabled["section"]["options"] if row["key"] == "Strength")
    assert disabled_row["disabled"] is True
    assert disabled_row["value"] == "125"
    assert ";@rulesmd-disabled Strength=125 ; keep me" in bridge.rpc_raw_text()
    assert disabled["dirty"] is True

    restored = bridge.rpc_restore_line(strength["line_id"])
    restored_row = next(row for row in restored["section"]["options"] if row["key"] == "Strength")
    assert restored_row["disabled"] is False
    assert restored_row["value"] == "125"
    assert "Strength=125 ; keep me" in bridge.rpc_raw_text()
    assert ";@rulesmd-disabled" not in bridge.rpc_raw_text()
    assert restored["dirty"] is False


def test_restore_reverts_value_and_new_parameter_restore_removes_it(tmp_path):
    path = tmp_path / "rulesmd.ini"
    path.write_text("[General]\nVeteranRatio=3.0\n", encoding="utf-8")

    bridge = Bridge()
    bridge.rpc_open_file(str(path))
    row = bridge.rpc_section("General")["options"][0]
    bridge.rpc_set_value(row["line_id"], "4.0")
    restored = bridge.rpc_restore_line(row["line_id"])
    assert restored["section"]["options"][0]["value"] == "3.0"
    assert restored["dirty"] is False

    created = bridge.rpc_add_option("General", "Cost", "100")
    restored_new = bridge.rpc_restore_line(created["line_id"])
    assert all(option["key"] != "Cost" for option in restored_new["section"]["options"])
    assert restored_new["dirty"] is False


def test_disabled_parameter_survives_save_and_reopen_and_can_be_deleted(tmp_path):
    path = tmp_path / "rulesmd.ini"
    path.write_text("[General]\nStrength=125\n", encoding="utf-8")

    bridge = Bridge()
    bridge.rpc_open_file(str(path))
    row = bridge.rpc_section("General")["options"][0]
    bridge.rpc_set_line_disabled(row["line_id"], True)
    bridge.rpc_save()

    reopened = Bridge()
    reopened.rpc_open_file(str(path))
    disabled = reopened.rpc_section("General")["options"][0]
    assert disabled["key"] == "Strength"
    assert disabled["disabled"] is True
    assert disabled["raw_disabled"] is True

    deleted = reopened.rpc_remove_line(disabled["line_id"])
    assert deleted["section"]["options"] == []
    assert deleted["dirty"] is True
