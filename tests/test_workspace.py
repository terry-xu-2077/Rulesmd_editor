from rulesmd_editor.ini_document import IniDocument
from rulesmd_editor.workspace import RulesWorkspace


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
