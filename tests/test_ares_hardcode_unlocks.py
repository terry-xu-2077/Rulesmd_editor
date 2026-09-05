from rulesmd_editor.runtime_catalog import RuntimeSchemaCatalog
from rulesmd_editor.workspace import RulesWorkspace


UNLOCK_MARKER = "🔓︎【Ares 解除原版硬编码】"


def test_ares_only_unlock_tag_is_available_with_chinese_limit_help():
    catalog = RuntimeSchemaCatalog()
    meta = catalog.option("SuperWeapons")

    assert meta.source == "Ares"
    assert meta.description.startswith("🔓")
    assert "原版限制：" in meta.help_text
    assert "SuperWeapon=" in meta.help_text
    assert "Ares 解锁：" in meta.help_text
    assert UNLOCK_MARKER in meta.help_text
    assert meta.docs == "new/superweapons/buildings.html"


def test_original_yr_tag_keeps_yr_identity_when_ares_only_extends_its_limit():
    catalog = RuntimeSchemaCatalog()
    sight = catalog.option("Sight")
    spread = catalog.option("CellSpread")

    assert sight.source == "YR"
    assert spread.source == "YR"
    assert "最大值被限制在 10" in sight.help_text
    assert "大于 10" in sight.help_text
    assert "最大有效范围约为 11" in spread.help_text
    assert "大于 11" in spread.help_text
    assert sight.description == "🔓︎ 视野范围"
    assert spread.description == "🔓︎ 范围扩散"


def test_unlock_labels_stay_compact():
    catalog = RuntimeSchemaCatalog()
    armor = catalog.option("Armor")

    assert armor.description == "🔓︎ 装甲类型"
    assert "支持 Ares" not in armor.description
    assert "[ArmorTypes]" in armor.help_text
    assert "Ares 解锁：" in armor.help_text


def test_dynamic_unlock_keys_receive_curated_help():
    catalog = RuntimeSchemaCatalog()

    turret = catalog.option("WeaponTurretIndex23")
    verses = catalog.option("Versus.magic")
    prereq = catalog.option("Prerequisite.List2")

    assert turret.source == "Ares"
    assert "18 套以上" in turret.help_text
    assert verses.source == "Ares"
    assert "自定义 ArmorType" in verses.help_text
    assert "OR" in prereq.help_text


def test_unlock_terms_are_searchable_in_parameter_catalog():
    workspace = RulesWorkspace()
    rows = workspace.option_catalog(query="解除原版硬编码")

    keys = {row["key"] for row in rows}
    assert "SuperWeapons" in keys
    assert "Missile.Custom" in keys


def test_disabling_ares_hides_ares_only_unlock_tags_but_not_original_yr_tags():
    workspace = RulesWorkspace()
    workspace.set_settings(ares_enabled=False)

    ares_keys = {row["key"] for row in workspace.option_catalog(query="解除原版硬编码")}
    assert "SuperWeapons" not in ares_keys

    # Sight remains a normal Yuri parameter. Its Ares extension note is presentation
    # metadata only and must not change the original parameter's identity.
    sight = workspace.schema.option("Sight")
    assert sight.source == "YR"
    assert UNLOCK_MARKER in sight.help_text
