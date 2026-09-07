from __future__ import annotations

import importlib
from pathlib import Path

import rulesmd_editor.resource_paths as resource_paths


def test_runtime_resource_root_can_be_overridden(monkeypatch, tmp_path: Path) -> None:
    external = tmp_path / "resources"
    external.mkdir()
    monkeypatch.setenv("RULESMD_RESOURCES_DIR", str(external))

    reloaded = importlib.reload(resource_paths)
    assert reloaded.RESOURCE_ROOT == external.resolve()

    monkeypatch.delenv("RULESMD_RESOURCES_DIR", raising=False)
    importlib.reload(resource_paths)
