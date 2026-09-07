from __future__ import annotations

import pytest

from rulesmd_editor.ini_document import IniDocument, categorized_sections
from rulesmd_editor.workspace import RulesWorkspace


def _option(workspace: RulesWorkspace, section: str, key: str) -> dict:
    return next(row for row in workspace.section(section)["options"] if row["key"] == key)


def _category_sections(snapshot: dict, category: str) -> list[str]:
    row = next(item for item in snapshot["categories"] if item["name"] == category)
    return [item["section"] for item in row["items"]]


def test_country_multi_select_uses_live_countries_and_excludes_neutral_special() -> None:
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text(
        "[Countries]\n"
        "0=Americans\n"
        "1=MyCountry\n"
        "2=Neutral\n"
        "3=Special\n"
        "[Americans]\n"
        "Name=美国\n"
        "[MyCountry]\n"
        "Name=我的国家\n"
        "[Neutral]\n"
        "Name=中立\n"
        "[Special]\n"
        "Name=特殊\n"
        "[E1]\n"
        "Owner=Americans\n"
    )
    workspace._capture_baseline()

    owner = _option(workspace, "E1", "Owner")
    assert owner["widget"] == "multi-select"
    values = [item["value"] for item in owner["values"]]
    assert "Americans" in values
    assert "MyCountry" in values
    assert "Neutral" not in values
    assert "Special" not in values


def test_prerequisite_candidates_match_legacy_building_rules() -> None:
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text(
        "[BuildingTypes]\n"
        "0=GAPOWR\n"
        "1=GACNST\n"
        "2=HIDDEN\n"
        "[GAPOWR]\n"
        "Name=盟军发电厂\n"
        "TechLevel=1\n"
        "[GACNST]\n"
        "Name=盟军建造场\n"
        "TechLevel=-1\n"
        "UndeploysInto=AMCV\n"
        "[HIDDEN]\n"
        "Name=隐藏建筑\n"
        "TechLevel=-1\n"
        "[E1]\n"
        "Prerequisite=BARRACKS\n"
    )
    workspace._capture_baseline()

    prerequisite = _option(workspace, "E1", "Prerequisite")
    assert prerequisite["widget"] == "multi-select"
    values = [item["value"] for item in prerequisite["values"]]
    assert "GAPOWR" in values
    assert "GACNST" in values
    assert "HIDDEN" not in values
    assert values.index("GAPOWR") > values.index("BARRACKS")


def test_legacy_standalone_identifiers_cover_aa_ag_and_vertical_projectiles() -> None:
    doc = IniDocument.from_text(
        "[WEP]\nDamage=20\nWarhead=WH\n"
        "[WH]\nBombDisarm=yes\n"
        "[PROJAA]\nImage=none\nAA=yes\n"
        "[PROJAG]\nImage=none\nAG=yes\n"
        "[PROJVERT]\nImage=none\nVertical=yes\n"
        "[NOTPROJ]\nImage=none\nROT=1\n"
    )
    categories = categorized_sections(doc)

    assert [section for section, _ in categories["武器"]] == ["WEP"]
    assert [section for section, _ in categories["弹头"]] == ["WH"]
    projectiles = [section for section, _ in categories["弹体"]]
    assert projectiles == ["PROJAA", "PROJAG", "PROJVERT"]
    assert "NOTPROJ" in [section for section, _ in categories["其他"]]


def test_new_registered_unit_is_immediately_first_in_runtime_lists() -> None:
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text(
        "[InfantryTypes]\n"
        "0=E1\n"
        "1=E2\n"
        "[E1]\n"
        "UIName=Name:E1\n"
        "Name=美国大兵\n"
        "Strength=125\n"
        "[E2]\n"
        "UIName=Name:E2\n"
        "Name=动员兵\n"
        "Strength=100\n"
    )
    workspace._capture_baseline()

    result = workspace.create_unit(template="E1", section="MYGI", comment="我的步兵")
    assert _category_sections(result["snapshot"], "步兵")[0] == "MYGI"

    # A later structural refresh must retain newest-first menu ordering.
    workspace.add_option("MYGI", "Speed", "5")
    assert _category_sections(workspace.snapshot(), "步兵")[0] == "MYGI"


@pytest.mark.parametrize(
    ("template", "category", "template_text", "selected_key"),
    [
        (
            "OLDGUN",
            "武器",
            "[OLDGUN]\nDamage=10\nROF=20\nProjectile=OLDPROJ\nWarhead=OLDWH\n",
            "ROF",
        ),
        (
            "OLDWH",
            "弹头",
            "[OLDWH]\nVerses=100%,100%,100%\nCellSpread=.5\n",
            "CellSpread",
        ),
        (
            "OLDPROJ",
            "弹体",
            "[OLDPROJ]\nImage=none\nInviso=yes\nROT=1\n",
            "ROT",
        ),
    ],
)
def test_new_unregistered_object_is_forced_into_template_category_and_first(
    template: str,
    category: str,
    template_text: str,
    selected_key: str,
) -> None:
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text(template_text)
    workspace._capture_baseline()

    selected_line = next(
        line.line_id
        for line in workspace.document.section_lines(template, keys_only=True)
        if (line.key or "").casefold() == selected_key.casefold()
    )
    new_section = f"NEW{template}"
    result = workspace.create_unit(
        template=template,
        section=new_section,
        comment="",
        included_line_ids=[selected_line],
    )

    assert result["registration_id"] == "无需注册"
    assert _category_sections(result["snapshot"], category)[0] == new_section
    assert workspace._section_types[new_section.casefold()] in {"Weapon", "Warhead", "Projectile"}

    # Rebuilding indexes after another edit must not drop or demote the newly created object.
    workspace.add_option(new_section, "CustomMarker", "1")
    assert _category_sections(workspace.snapshot(), category)[0] == new_section
