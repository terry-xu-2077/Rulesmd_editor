from io import StringIO
import json

from rulesmd_editor.bridge import Bridge, serve
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


def test_bridge_general_matches_legacy_qt_global_workspace():
    workspace = RulesWorkspace()
    workspace.document = IniDocument.from_text(
        "[General]\n"
        "Paratrooper=yes\n"
        "VeteranRatio=3.0\n"
        "BuildSpeed=.7\n"
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
    assert by_key["Paratrooper"]["category"] == "伞兵设置"
    assert by_key["VeteranRatio"]["category"] == "老兵设置"
    assert by_key["BuildSpeed"]["category"] == "全部"
    assert by_key["Firepower"]["category"] == "难度设置-简单"
    assert by_key["MinDamage"]["category"] == "战斗与伤害规则"
    assert by_key["Green"]["category"] == "颜色主题"
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
