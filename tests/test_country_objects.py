from rulesmd_editor.ini_document import IniDocument, categorized_sections
from rulesmd_editor.workspace import RulesWorkspace


def _country_rules() -> IniDocument:
    return IniDocument.from_text(
        """[Countries]\n"
        "0=Americans\n"
        "1=British\n\n"
        "[Americans]\n"
        "UIName=Name:Americans\n"
        "Name=美国\n"
        "Side=GDI\n"
        "Color=Gold\n\n"
        "[British]\n"
        "UIName=Name:British\n"
        "Name=英国\n"
        "Side=GDI\n"
        "Color=LightGrey\n"
    )


def test_registered_countries_are_first_class_objects_not_other_sections():
    doc = _country_rules()
    categories = categorized_sections(doc)

    assert [section for section, _ in categories["国家"]] == ["Americans", "British"]
    assert "Americans" not in {section for section, _ in categories["其他"]}
    assert "British" not in {section for section, _ in categories["其他"]}


def test_country_can_be_created_through_generic_object_creation_flow():
    workspace = RulesWorkspace()
    workspace.document = _country_rules()
    workspace._capture_baseline()

    result = workspace.create_unit(
        template="Americans",
        section="MyCountry",
        comment="我的国家",
        included_line_ids=None,
    )

    assert result["root"] == "Countries"
    assert result["registration_id"] == "2"
    assert workspace.document.get("Countries", "2") == "MyCountry"
    assert workspace.document.get("MyCountry", "UIName") == "Name:MyCountry"
    assert workspace.document.get("MyCountry", "Name") == "我的国家"
    assert workspace.document.get("MyCountry", "Side") == "GDI"
    assert any(item["section"] == "MyCountry" for category in result["snapshot"]["categories"] if category["name"] == "国家" for item in category["items"])
