from io import StringIO
import json

from rulesmd_editor.bridge import Bridge, serve
from rulesmd_editor.global_rules import global_rule_category, is_hidden_legacy_global_option
from rulesmd_editor.ini_document import IniDocument
from rulesmd_editor.workspace import RulesWorkspace


def test_bridge_dispatches_workspace_methods():
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text("[E1]\nStrength=125\n")
    bridge = Bridge(workspace)

    section = bridge.dispatch({"id": 1, "method": "section", "params": {"section": "E1"}})
    assert section["ok"] is True
    line_id = section["result"]["options"][0]["line_id"]

    changed = bridge.dispatch(
        {"id": 2, "method": "set_value", "params": {"line_id": line_id, "value": "150"}}
    )
    assert changed["ok"] is True
    assert workspace.raw_text() == "[E1]\nStrength=150\n"


def test_bridge_general_prefers_official_groups_and_hides_legacy_carryovers():
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text(
        "[General]\n"
        "ParadropRadius=1024\n"
        "VeteranRatio=3.0\n"
        "RepairRate=.016\n"
        "BuildSpeed=.7\n"
        "AICaptureNormal=75,5,5,15\n"
        "V3RocketDamage=200\n"
        "TiberiumGrows=yes\n"
        "TiberiumShortScan=6\n"
        "SurvivorRate=.4\n"
        "Meteorites=no\n"
        "DropPodHeight=2000\n"
        "[Easy]\n"
        "Firepower=1.2\n"
        "[CombatDamage]\n"
        "MinDamage=1\n"
        "[Colors]\n"
        "Green=0,255,0\n"
    )
    bridge = Bridge(workspace)

    response = bridge.dispatch({"id": 3, "method": "section", "params": {"section": "General"}})
    assert response["ok"] is True
    payload = response["result"]
    assert payload["section"] == "General"
    assert payload["description"] == "全局规则"

    by_key = {row["key"]: row for row in payload["options"]}
    assert by_key["ParadropRadius"]["category"] == "伞兵设置"
    assert by_key["VeteranRatio"]["category"] == "老兵设置"
    assert by_key["RepairRate"]["category"] == "修理与补给"
    assert by_key["BuildSpeed"]["category"] == "经济与生产"
    assert by_key["AICaptureNormal"]["category"] == "电脑AI设置"
    assert by_key["V3RocketDamage"]["category"] == "V3火箭规则"
    assert by_key["Firepower"]["category"] == "难度设置-简单"
    assert by_key["MinDamage"]["category"] == "战斗与伤害规则"
    assert by_key["Green"]["category"] == "颜色主题"

    for hidden_key in ("TiberiumGrows", "TiberiumShortScan", "SurvivorRate", "Meteorites", "DropPodHeight"):
        assert hidden_key not in by_key
        assert f"{hidden_key}=" in payload["raw"]

    # Friendly hiding is presentation-only.  Raw data stays lossless and editable in Raw view.
    assert "[General]" in payload["raw"]
    assert "[Easy]" in payload["raw"]
    assert "[CombatDamage]" in payload["raw"]

    changed = bridge.dispatch({
        "id": 4,
        "method": "set_value",
        "params": {"line_id": by_key["Firepower"]["line_id"], "value": "1.5"},
    })
    assert changed["ok"] is True
    assert changed["result"]["section"] == "General"
    assert "Firepower=1.5" in changed["result"]["raw"]
    assert "TiberiumGrows=yes" in changed["result"]["raw"]


def test_global_rule_legacy_visibility_filter_is_conservative():
    assert is_hidden_legacy_global_option("General", "TiberiumHeal") is True
    assert is_hidden_legacy_global_option("General", "TiberiumTransmogrify") is True
    assert is_hidden_legacy_global_option("General", "SurvivorRate") is True
    assert is_hidden_legacy_global_option("General", "DropPodWeapon") is True
    assert is_hidden_legacy_global_option("General", "Meteorites") is True

    # Old naming alone is not enough reason to hide a setting that RA2/YR may still use.
    assert is_hidden_legacy_global_option("General", "NodRegularPower") is False
    assert is_hidden_legacy_global_option("General", "GDIPowerPlant") is False
    assert is_hidden_legacy_global_option("CombatDamage", "TiberiumHeal") is False

    assert global_rule_category("General", "BuildSpeed") == "经济与生产"
    assert global_rule_category("General", "RepairRate") == "修理与补给"
    assert global_rule_category("General", "PrismSupportMax") == "光棱塔规则"


def test_bridge_returns_structured_errors():
    bridge = Bridge()
    response = bridge.dispatch({"id": 7, "method": "missing_method"})
    assert response["id"] == 7
    assert response["ok"] is False
    assert response["error"]["type"] == "ValueError"


def test_stdio_server_uses_one_json_response_per_line():
    stdin = StringIO(json.dumps({"id": 1, "method": "ping"}) + "\n")
    stdout = StringIO()
    serve(stdin, stdout)
    payload = json.loads(stdout.getvalue())
    assert payload == {
        "id": 1,
        "ok": True,
        "result": {"service": "rulesmd-editor-python", "status": "ok"},
    }
