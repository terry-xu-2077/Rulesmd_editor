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
