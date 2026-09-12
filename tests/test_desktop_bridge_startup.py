from __future__ import annotations

import subprocess
import sys


def test_core_backend_starts_when_image_module_import_is_unavailable() -> None:
    script = r'''
import builtins

real_import = builtins.__import__

def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
    if name == "PIL" or name.startswith("PIL."):
        raise ModuleNotFoundError("blocked image dependency for startup regression test", name=name)
    return real_import(name, globals, locals, fromlist, level)

builtins.__import__ = guarded_import

from rulesmd_editor.desktop_bridge import DiagnosticExportBridge
from rulesmd_editor.export_bridge import ExportMixRulesWorkspace

bridge = DiagnosticExportBridge(ExportMixRulesWorkspace())
ping = bridge.dispatch({"id": 1, "method": "ping", "params": {}})
assert ping["ok"] is True, ping
new_doc = bridge.dispatch({"id": 2, "method": "new_document", "params": {}})
assert new_doc["ok"] is True, new_doc
assert new_doc["result"]["document"]["section_count"] >= 1, new_doc
'''
    completed = subprocess.run(
        [sys.executable, "-c", script],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
