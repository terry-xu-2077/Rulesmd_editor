from rulesmd_editor.control_schema import ControlSchema


def test_country_alliance_is_korea_not_generic_allies():
    spec = ControlSchema().explicit("Owner")
    assert spec is not None
    labels = dict(spec.values)
    assert labels["Alliance"] == "韩国"


def test_veteran_ability_labels_do_not_keep_known_legacy_mistranslations():
    spec = ControlSchema().explicit("VeteranAbilities")
    assert spec is not None
    labels = dict(spec.values)
    assert "泰伯利亚" in labels["TIBERIUM_PROOF"]
    assert "VXL" not in labels["VEIN_PROOF"]
    assert "散开" in labels["SCATTER"]


def test_armor_labels_match_engine_classes_instead_of_old_material_guess():
    spec = ControlSchema().explicit("Armor")
    assert spec is not None
    labels = dict(spec.values)
    assert "防弹衣" in labels["Flak"]
    assert "金属" in labels["Plate"]
    assert "轻型载具" in labels["Light"]


def test_ai_base_planning_side_includes_all_vanilla_sides():
    spec = ControlSchema().explicit("AIBasePlanningSide")
    assert spec is not None
    assert spec.values == (
        ("-1", "所有阵营"),
        ("0", "盟军"),
        ("1", "苏军"),
        ("2", "尤里"),
    )
