from rulesmd_editor.ini_document import IniDocument
from rulesmd_editor.workspace import RulesWorkspace


def _option(workspace: RulesWorkspace, section: str, key: str) -> dict:
    return next(row for row in workspace.section(section)["options"] if row["key"] == key)


def test_open_transport_weapon_is_weapon_slot_selector_not_weapon_reference() -> None:
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text("[BFRT]\nOpenTransportWeapon=0\n")

    option = _option(workspace, "BFRT", "OpenTransportWeapon")
    assert option["widget"] == "select"
    assert option["value_type"] == "enum"
    assert option["values"] == [
        {"value": "0", "label": "主武器"},
        {"value": "1", "label": "副武器"},
    ]


def test_help_backed_numeric_selectors_keep_documented_domains() -> None:
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text(
        "[E1]\n"
        "DeployFireWeapon=1\n"
        "DeployFacing=3\n"
        "[GAPOWR]\n"
        "AIBasePlanningSide=0\n"
        "[SUB]\n"
        "LandTargeting=2\n"
    )

    assert [row["value"] for row in _option(workspace, "E1", "DeployFireWeapon")["values"]] == ["0", "1"]
    assert [row["value"] for row in _option(workspace, "E1", "DeployFacing")["values"]] == [str(i) for i in range(8)]
    assert [row["value"] for row in _option(workspace, "GAPOWR", "AIBasePlanningSide")["values"]] == ["0", "1"]
    assert [row["value"] for row in _option(workspace, "SUB", "LandTargeting")["values"]] == ["0", "1", "2"]


def test_incremental_dirty_tracking_clears_when_each_value_is_restored() -> None:
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text("[General]\nBuildSpeed=.7\nRepairRate=.016\n")
    workspace._capture_baseline()

    build = _option(workspace, "General", "BuildSpeed")
    repair = _option(workspace, "General", "RepairRate")
    workspace.set_value(build["line_id"], ".8")
    workspace.set_value(repair["line_id"], ".020")
    assert workspace.info().dirty is True

    workspace.set_value(build["line_id"], build["raw_value"])
    assert workspace.info().dirty is True
    workspace.set_value(repair["line_id"], repair["raw_value"])
    assert workspace.info().dirty is False
