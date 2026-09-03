from rulesmd_editor.ini_document import IniDocument
from rulesmd_editor.workspace import RulesWorkspace
import rulesmd_editor.workspace as workspace_module


def test_workspace_exposes_duplicate_lines_and_edits_by_line_id(tmp_path):
    source = (
        "[InfantryTypes]\n"
        "1=E1\n"
        "[E1]\n"
        "Name=GI\n"
        "Primary=M60\n"
        "Primary=M60E\n"
        "AttachEffect.Duration=90\n"
    )
    path = tmp_path / "rulesmd.ini"
    path.write_text(source, encoding="utf-8")

    workspace = RulesWorkspace()
    snapshot = workspace.open_file(path)
    assert snapshot["document"]["encoding"] == "utf-8"
    assert snapshot["settings"]["ares_enabled"] is True

    section = workspace.section("e1")
    primary = [row for row in section["options"] if row["key"] == "Primary"]
    assert len(primary) == 2
    assert primary[0]["line_id"] != primary[1]["line_id"]

    workspace.set_value(primary[0]["line_id"], "M60_NEW")
    assert "Primary=M60_NEW\nPrimary=M60E\n" in workspace.raw_text()


def test_workspace_returns_ares_metadata():
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text("[E1]\nAttachEffect.Duration=90\n")

    option = workspace.section("E1")["options"][0]
    assert option["source"] == "Ares"
    assert option["label"] == "附加效果持续时间"
    assert option["value_type"] == "integer"
    assert option["widget"] == "slider"


def test_legacy_owner_is_a_country_multiselect():
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text("[E1]\nOwner=British,French,Americans\n")

    option = workspace.section("E1")["options"][0]
    assert option["widget"] == "multi-select"
    values = {row["value"]: row["label"] for row in option["values"]}
    assert values["British"] == "英国"
    assert values["French"] == "法国"


def test_new_document_uses_clean_full_template_when_available(tmp_path, monkeypatch):
    template = tmp_path / "rulesmd.template.ini"
    template.write_text(
        "[InfantryTypes]\r\n1=E1\r\n[BuildingTypes]\r\n1=GAPOWR\r\n[E1]\r\nOwner=British\r\n[GAPOWR]\r\nTechLevel=1\r\n",
        encoding="utf-8",
        newline="",
    )
    monkeypatch.setattr(workspace_module, "DEFAULT_TEMPLATE", template)

    workspace = RulesWorkspace()
    snapshot = workspace.new_document()
    assert snapshot["document"]["path"] is None
    assert snapshot["document"]["dirty"] is False
    assert snapshot["document"]["section_count"] == 4
    assert "[E1]\r\nOwner=British" in workspace.raw_text()


def test_edit_restore_save_and_reopen_round_trip(tmp_path):
    path = tmp_path / "rulesmd.ini"
    path.write_text("[E1]\r\nOwner=British,French\r\nCloakable=no\r\n", encoding="utf-8", newline="")

    workspace = RulesWorkspace()
    workspace.open_file(path)
    section = workspace.section("E1")
    owner = next(row for row in section["options"] if row["key"] == "Owner")
    cloakable = next(row for row in section["options"] if row["key"] == "Cloakable")
    assert owner["raw_value"] == "British,French"
    assert workspace.info().dirty is False

    workspace.set_value(owner["line_id"], "British,Americans")
    assert workspace.info().dirty is True
    workspace.set_value(owner["line_id"], owner["raw_value"])
    assert workspace.info().dirty is False

    workspace.set_value(owner["line_id"], "British,Americans")
    workspace.set_value(cloakable["line_id"], "yes")
    workspace.save()
    saved = workspace.section("E1")
    saved_owner = next(row for row in saved["options"] if row["key"] == "Owner")
    assert saved_owner["raw_value"] == "British,Americans"
    assert workspace.info().dirty is False

    reopened = RulesWorkspace()
    reopened.open_file(path)
    assert reopened._doc().get("E1", "Owner") == "British,Americans"
    assert reopened._doc().get("E1", "Cloakable") == "yes"


def test_ares_is_part_of_default_insert_catalog():
    workspace = RulesWorkspace()
    rows = workspace.option_catalog(query="EMP")
    assert any(row["key"] == "EMP.Duration" for row in rows)
    assert all("Ares" not in row["label"] for row in rows)


def test_disabling_ares_only_hides_assistance_not_parsing():
    workspace = RulesWorkspace()
    workspace.set_settings(ares_enabled=False)
    assert not any(row["source"] == "Ares" for row in workspace.option_catalog())

    workspace.document = IniDocument.from_text(
        "[E1]\nAttachEffect.Duration=90\nThirdParty.CustomTag=yes\n"
    )
    section = workspace.section("E1")
    assert [row["key"] for row in section["options"]] == [
        "AttachEffect.Duration",
        "ThirdParty.CustomTag",
    ]


def test_add_option_uses_built_in_default_when_value_is_omitted():
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text("[E1]\n")
    created = workspace.add_option("E1", "AttachEffect.Duration")
    assert created["value"] == "0"
    assert "AttachEffect.Duration=0\n" in workspace.raw_text()
