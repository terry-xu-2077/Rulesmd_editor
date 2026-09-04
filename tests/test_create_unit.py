import pytest

from rulesmd_editor.ini_document import IniDocument
from rulesmd_editor.workspace import RulesWorkspace


def test_create_unit_clones_template_registers_next_id_and_uses_required_name_comment():
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text(
        "[InfantryTypes]\n"
        "1=E1\n"
        "5=E2\n"
        "[E1]\n"
        "UIName=Name:E1\n"
        "Name=GI\n"
        "Image=E1\n"
        "Strength=125\n"
        "Owner=Americans\n"
        "[E2]\n"
        "Name=Conscript\n"
    )
    workspace._capture_baseline()

    result = workspace.create_unit(
        template="E1",
        section="MYGI",
        comment="我的测试步兵",
        values=[
            {"key": "Strength", "value": "300"},
            {"key": "Owner", "value": "British"},
        ],
    )

    doc = workspace._doc()
    assert result["registration_id"] == "6"
    assert doc.get("InfantryTypes", "6") == "MYGI"
    assert doc.get("MYGI", "UIName") == "Name:MYGI"
    assert doc.get("MYGI", "Name") == "我的测试步兵"
    assert doc.get("MYGI", "Image") == "E1"
    assert doc.get("MYGI", "Strength") == "300"
    assert doc.get("MYGI", "Owner") == "British"
    assert result["section"]["description"] == "我的测试步兵"
    infantry = next(category for category in result["snapshot"]["categories"] if category["name"] == "步兵")
    created = next(item for item in infantry["items"] if item["section"] == "MYGI")
    assert created["label"] == "我的测试步兵"
    assert result["snapshot"]["document"]["dirty"] is True


def test_create_unit_requires_unique_valid_section_and_comment():
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text("[VehicleTypes]\n1=MTNK\n[MTNK]\nName=Grizzly\nStrength=300\n")
    workspace._capture_baseline()

    with pytest.raises(ValueError, match="必须填写注释"):
        workspace.create_unit(template="MTNK", section="MYTNK", comment="", values=[])

    with pytest.raises(ValueError, match="注册名"):
        workspace.create_unit(template="MTNK", section="123BAD", comment="测试", values=[])

    with pytest.raises(ValueError, match="已存在"):
        workspace.create_unit(template="MTNK", section="MTNK", comment="测试", values=[])
