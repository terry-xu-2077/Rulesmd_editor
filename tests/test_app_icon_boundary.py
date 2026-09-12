from __future__ import annotations

import base64
import json
from io import BytesIO
from pathlib import Path

from PIL import Image

from rulesmd_editor import icon_resources
from rulesmd_editor.desktop_bridge import DiagnosticExportBridge
from rulesmd_editor.export_bridge import ExportMixRulesWorkspace
from rulesmd_editor.icon_resources_persistent import PersistentIconResourceService
from rulesmd_editor.ini_document import IniDocument


def _data_url(image: Image.Image) -> str:
    payload = BytesIO()
    image.save(payload, format="PNG")
    return "data:image/png;base64," + base64.b64encode(payload.getvalue()).decode("ascii")


def _patch_storage(monkeypatch, tmp_path: Path) -> Path:
    root = tmp_path / "resources" / "user-icons"
    monkeypatch.setattr(icon_resources, "USER_ICON_ROOT", root)
    monkeypatch.setattr(icon_resources, "USER_ICON_META", root / "icons.json")
    monkeypatch.setattr(icon_resources, "CUSTOM_UNIT_TILE", root / "unitTile.png")
    monkeypatch.setattr(icon_resources, "CUSTOM_COUNTRY_TILE", root / "countryTile.png")
    monkeypatch.setattr(icon_resources, "RESOLVED_UNIT_TILE", root / "resolvedUnitTile.png")
    monkeypatch.setattr(icon_resources, "RESOLVED_COUNTRY_TILE", root / "resolvedCountryTile.png")
    monkeypatch.setattr(icon_resources, "SOURCE_ROOT", root / "sources")
    monkeypatch.setattr(icon_resources, "ORIGINAL_ROOT", root / "originals")
    return root


class _Workspace:
    def __init__(self, document: IniDocument):
        self.document = document

    def _doc(self) -> IniDocument:
        return self.document

    def snapshot(self) -> dict:
        return {
            "categories": [
                {"name": "载具", "items": [{"section": "MYCONA", "label": "我的挖掘机"}]},
            ]
        }


def test_import_custom_icon_never_writes_game_files(monkeypatch, tmp_path: Path) -> None:
    storage = _patch_storage(monkeypatch, tmp_path)
    game_root = tmp_path / "game"
    game_root.mkdir()
    exe = game_root / "gamemd.exe"
    exe.write_bytes(b"")
    monkeypatch.setattr(icon_resources, "load_app_config", lambda: {"gamePath": str(exe)})

    rules_text = "[VehicleTypes]\n1=MYCONA\n[MYCONA]\nImage=CONA\n"
    rules = IniDocument.from_text(rules_text)
    rules.path = game_root / "rulesmd.ini"
    rules.path.write_text(rules_text, encoding="utf-8")
    artmd = game_root / "artmd.ini"
    artmd_text = "[CONA]\nVoxel=yes\nCameoPCX=existing.pcx\n"
    artmd.write_text(artmd_text, encoding="utf-8")

    service = PersistentIconResourceService(_Workspace(rules))
    source = Image.new("RGBA", (160, 100), (80, 120, 210, 255))
    before_files = {path.name for path in game_root.iterdir()}

    snapshot = service.import_custom_icon(
        kind="unit",
        target_id="MYCONA",
        data_base64=_data_url(source),
        filename="mycona.png",
        crop_zoom=1.25,
        crop_x=0.5,
        crop_y=0.5,
    )

    after_files = {path.name for path in game_root.iterdir()}
    assert after_files == before_files
    assert rules.path.read_text(encoding="utf-8") == rules_text
    assert artmd.read_text(encoding="utf-8") == artmd_text
    assert not any(path.suffix.lower() == ".pcx" for path in game_root.iterdir())
    assert snapshot["unit"]["MYCONA"]["source"] == "custom"
    assert (storage / "unitTile.png").is_file()

    meta = json.loads((storage / "icons.json").read_text(encoding="utf-8"))
    assert "game_file" not in meta["unit"]["MYCONA"]


def test_retired_artmd_write_rpc_is_not_exposed() -> None:
    bridge = DiagnosticExportBridge(ExportMixRulesWorkspace())
    response = bridge.dispatch({
        "id": 7,
        "method": "set_artmd_icon",
        "params": {"section": "CONA", "cameo_pcx": "should-not-write.pcx"},
    })

    assert response["ok"] is False
    assert response["error"]["type"] == "ValueError"
    assert "Unknown method: set_artmd_icon" in response["error"]["message"]
