from rulesmd_editor.ini_document import IniDocument
from rulesmd_editor.workspace import RulesWorkspace


class StubSchema:
    def __init__(self, labels: dict[str, str] | None = None):
        self.labels = labels or {}

    def section_description(self, section: str) -> str:
        return self.labels.get(section, "")


def workspace_for(text: str, labels: dict[str, str] | None = None) -> RulesWorkspace:
    workspace = RulesWorkspace(schema=StubSchema(labels))
    workspace.document = IniDocument.from_text(text)
    workspace._capture_baseline()
    return workspace


def test_name_inline_comment_is_used_for_reference_label() -> None:
    workspace = workspace_for(
        "[UserWeapon]\n"
        "Damage=100\n"
        "Warhead=UserWH\n"
        "Name=Internal weapon name ; 用户备注武器\n"
    )

    assert workspace._section_label("UserWeapon") == "用户备注武器"


def test_chinese_catalog_label_has_priority_over_name_comment() -> None:
    workspace = workspace_for(
        "[UserWeapon]\n"
        "Damage=100\n"
        "Warhead=UserWH\n"
        "Name=Internal weapon name ; 用户备注武器\n",
        {"UserWeapon": "内置中文武器名"},
    )

    assert workspace._section_label("UserWeapon") == "内置中文武器名"


def test_name_value_beats_non_chinese_catalog_label() -> None:
    workspace = workspace_for(
        "[UserWeapon]\n"
        "Damage=100\n"
        "Warhead=UserWH\n"
        "Name=用户填写名称\n",
        {"UserWeapon": "Legacy Weapon"},
    )

    assert workspace._section_label("UserWeapon") == "用户填写名称"


def test_weapon_without_name_can_inherit_parent_unit_relationship_label() -> None:
    workspace = workspace_for(
        "[InfantryTypes]\n"
        "0=TESTUNIT\n"
        "[TESTUNIT]\n"
        "Name=测试单位\n"
        "Primary=TechWeapon\n"
        "[TechWeapon]\n"
        "Damage=100\n"
        "Warhead=TechWH\n"
        "[TechWH]\n"
        "Verses=100%,100%,100%,100%,100%,100%,100%,100%,100%,100%,100%\n",
        {"TechWeapon": "TechWeapon"},
    )

    assert workspace._section_label("TechWeapon") == "测试单位 · 主武器"
    assert workspace._section_label("TechWH") == "测试单位 · 主武器 · 弹头"


def test_curated_chinese_weapon_label_still_beats_relationship_inference() -> None:
    workspace = workspace_for(
        "[InfantryTypes]\n"
        "0=TESTUNIT\n"
        "[TESTUNIT]\n"
        "Name=测试单位\n"
        "Primary=TechWeapon\n"
        "[TechWeapon]\n"
        "Damage=100\n"
        "Warhead=TechWH\n"
        "[TechWH]\n"
        "Verses=100%,100%,100%,100%,100%,100%,100%,100%,100%,100%,100%\n",
        {"TechWeapon": "已审校武器名"},
    )

    assert workspace._section_label("TechWeapon") == "已审校武器名"
