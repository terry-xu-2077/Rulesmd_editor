from rulesmd_editor.ares_schema import AresSchemaCatalog
from rulesmd_editor.runtime_catalog import RuntimeSchemaCatalog


def test_dynamic_versus_armor_gets_specific_chinese_help():
    row = AresSchemaCatalog().option("Versus.f_viper")
    assert row is not None
    assert row.source == "Ares"
    assert "f_viper" in row.description
    assert "伤害倍率" in row.description
    assert row.value_type == "percent"
    assert "100%" in row.help_text


def test_dynamic_versus_behavior_is_boolean():
    row = AresSchemaCatalog().option("Versus.defense.PassiveAcquire")
    assert row is not None
    assert row.value_type == "boolean"
    assert "自动索敌" in row.description
    assert row.values == (("yes", "是"), ("no", "否"))


def test_country_specific_paradrop_keeps_mod_country_id_visible():
    row = AresSchemaCatalog().option("ParaDrop.Guild3.Types")
    assert row is not None
    assert row.source == "Ares"
    assert row.description == "Guild3 · 空降单位类型"
    assert row.value_type == "list-techno"


def test_generic_known_ares_family_gets_chinese_family_and_safe_help():
    row = AresSchemaCatalog().option("Sidebar.YuriFileNames")
    assert row is not None
    assert row.source == "Ares"
    assert "侧边栏" in row.description
    assert "尤里复仇文件名规则" in row.description
    assert "未出现在当前内置精确元数据快照" in row.help_text


def test_unknown_dotted_family_stays_ares_without_inventing_semantics():
    row = RuntimeSchemaCatalog().option("SomeFutureFamily.NewFlag")
    assert row.source == "Ares"
    assert row.description == ""
    assert "没有匹配到已知参数族" in row.help_text


def test_unknown_readable_plain_key_gets_label_only_inference():
    row = RuntimeSchemaCatalog().option("BuildTimeMultiplier")
    # Existing metadata may already know this key; either way it must have a Chinese
    # presentation label and must never rewrite the engine key.
    assert row.name == "BuildTimeMultiplier"
    assert row.description != "BuildTimeMultiplier"


def test_verified_translation_audit_overrides_historical_text():
    row = RuntimeSchemaCatalog().option("AIBasePlanningSide")
    assert row.description == "AI 基地规划阵营"
    assert "2=尤里" in row.help_text
