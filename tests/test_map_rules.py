from rulesmd_editor.workspace import RulesWorkspace
import rulesmd_editor.workspace as workspace_module


def _write_template(path):
    path.write_text(
        "[InfantryTypes]\n0=E1\n"
        "[VehicleTypes]\n0=HTNK\n"
        "[E1]\nName=GI\nStrength=125\nOwner=Americans\n"
        "[HTNK]\nName=Rhino Tank\nStrength=400\nOwner=Russians\n"
        "[General]\nBuildSpeed=.7\n"
        "[CombatDamage]\nAmmoCrateDamage=200\n",
        encoding="utf-8",
    )


def test_map_open_only_exposes_embedded_rules(tmp_path, monkeypatch):
    template = tmp_path / "rulesmd.template.ini"
    _write_template(template)
    monkeypatch.setattr(workspace_module, "DEFAULT_TEMPLATE", template)

    source = (
        "[Basic]\nName=Test Map\n"
        "[Map]\nSize=0,0,80,80\n"
        "[E1]\nStrength=500\n"
        "[Triggers]\n0=keep-this\n"
        "[IsoMapPack5]\n1=opaque-map-data\n"
    )
    path = tmp_path / "test.map"
    path.write_text(source, encoding="utf-8")

    workspace = RulesWorkspace()
    snapshot = workspace.open_file(path)

    assert snapshot["document"]["kind"] == "map"
    assert snapshot["document"]["section_count"] == 5
    assert snapshot["document"]["rule_section_count"] == 1
    visible = {
        item["section"]
        for category in snapshot["categories"]
        for item in category["items"]
    }
    assert visible == {"E1"}
    assert workspace.section("E1")["options"][0]["value"] == "500"
    assert workspace.raw_text() == source


def test_empty_map_can_add_known_rule_section_then_parameter(tmp_path, monkeypatch):
    template = tmp_path / "rulesmd.template.ini"
    _write_template(template)
    monkeypatch.setattr(workspace_module, "DEFAULT_TEMPLATE", template)

    original = (
        "[Basic]\nName=Clean Map\n"
        "[Map]\nSize=0,0,64,64\n"
        "[Triggers]\n0=keep-this\n"
    )
    path = tmp_path / "clean.mpr"
    path.write_text(original, encoding="utf-8")

    workspace = RulesWorkspace()
    snapshot = workspace.open_file(path)
    e1 = next(item for item in snapshot["map_rule_catalog"] if item["section"] == "E1")
    assert e1["present"] is False
    assert snapshot["document"]["rule_section_count"] == 0

    result = workspace.create_unit(template="E1", section="E1", comment="", included_line_ids=[])
    assert result["root"] == "地图覆盖"
    assert result["section"]["section"] == "E1"
    assert result["section"]["options"] == []

    workspace.add_option("E1", "Strength", "500")
    workspace.save()
    saved = path.read_text(encoding="utf-8")
    assert saved.startswith(original)
    assert "[Triggers]\n0=keep-this\n" in saved
    assert "[E1]\nStrength=500\n" in saved


def test_map_rule_catalog_uses_base_rules_categories_and_global_rules(tmp_path, monkeypatch):
    template = tmp_path / "rulesmd.template.ini"
    _write_template(template)
    monkeypatch.setattr(workspace_module, "DEFAULT_TEMPLATE", template)

    path = tmp_path / "catalog.yrm"
    path.write_text("[Basic]\nName=Catalog\n", encoding="utf-8")

    workspace = RulesWorkspace()
    snapshot = workspace.open_file(path)
    catalog = {item["section"]: item for item in snapshot["map_rule_catalog"]}

    assert catalog["E1"]["category"] == "步兵"
    assert catalog["HTNK"]["category"] == "载具"
    assert catalog["General"]["category"] == "全局规则"
    assert catalog["CombatDamage"]["category"] == "全局规则"
    assert all(item["present"] is False for item in catalog.values())


def test_non_map_ini_keeps_normal_rules_behavior(tmp_path, monkeypatch):
    template = tmp_path / "rulesmd.template.ini"
    _write_template(template)
    monkeypatch.setattr(workspace_module, "DEFAULT_TEMPLATE", template)

    path = tmp_path / "rulesmd.ini"
    path.write_text("[InfantryTypes]\n0=E1\n[E1]\nStrength=125\n", encoding="utf-8")

    workspace = RulesWorkspace()
    snapshot = workspace.open_file(path)
    assert snapshot["document"]["kind"] == "rules"
    infantry = next(category for category in snapshot["categories"] if category["name"] == "步兵")
    assert [item["section"] for item in infantry["items"]] == ["E1"]
    assert snapshot["map_rule_catalog"] == []
