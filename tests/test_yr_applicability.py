from rulesmd_editor.yr_applicability import infer_yr_applies_to


def test_modenc_backed_techno_and_infantry_hints():
    assert infer_yr_applies_to("Owner") == ("TechnoType",)
    assert infer_yr_applies_to("UseOwnName") == ("InfantryType",)
    assert infer_yr_applies_to("ConstructionYard") == ("BuildingType",)


def test_help_text_only_uses_strong_restriction_language():
    assert infer_yr_applies_to("CustomA", "这个参数只能用于步兵单位") == ("InfantryType",)
    assert infer_yr_applies_to("CustomB", "该效果常见于步兵，但也可以有其他用途") == ()
