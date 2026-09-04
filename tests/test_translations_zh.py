from rulesmd_editor.schema import OptionMeta
from rulesmd_editor.translations_zh import apply_yr_translations, guess_section_name, normalize_parameter_label


def test_known_misleading_legacy_labels_are_corrected() -> None:
    assert normalize_parameter_label("ImmuneToPsionics", "受心灵气波伤害") == "免疫心灵控制"
    assert normalize_parameter_label("RadarInvisible", "雷达可见") == "雷达隐形"
    assert normalize_parameter_label("DeathWeaponDamageModifier", "") == "死亡武器伤害倍率"


def test_existing_good_chinese_label_is_preserved() -> None:
    assert normalize_parameter_label("Primary", "主武器") == "主武器"


def test_runtime_overlay_updates_parameters_and_common_unit_names() -> None:
    options = {
        "UIName": OptionMeta("UIName", "游戏中名称"),
        "TypeImmune": OptionMeta("TypeImmune", ""),
    }
    names = {"BORIS": "菁英战斗兵", "VIRUS": "病毒狙击手"}
    apply_yr_translations(options, names)
    assert options["UIName"].description == "游戏内名称"
    assert options["TypeImmune"].description == "免疫同类型伤害"
    assert names["BORIS"] == "鲍里斯"
    assert names["VIRUS"] == "病毒狙击手"


def test_vehicle_ids_and_mcv_sides_use_canonical_labels() -> None:
    names: dict[str, str] = {}
    apply_yr_translations({}, names)
    assert names["MTNK"] == "灰熊坦克"
    assert names["HTNK"] == "犀牛坦克"
    assert names["SMCV"] == "苏联机动基地车"
    assert names["PCV"] == "尤里机动基地车"


def test_common_weapon_sections_and_safe_fallbacks_are_localized() -> None:
    assert guess_section_name("PsychicJab") == "心灵冲击"
    assert guess_section_name("DefaultDeathWeapon") == "默认死亡武器"
    assert guess_section_name("JumpCannon") == "跳跃火炮"
    assert guess_section_name("TotallyUnknownModWeapon") is None
