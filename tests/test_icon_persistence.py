from __future__ import annotations

import base64
from io import BytesIO
from pathlib import Path

from PIL import Image

from rulesmd_editor import icon_resources
from rulesmd_editor.icon_resources import IconResourceService
from rulesmd_editor.icon_resources_persistent import PersistentIconResourceService
from rulesmd_editor.ini_document import IniDocument


def _patch_icon_storage(monkeypatch, tmp_path: Path) -> Path:
    root = tmp_path / "resources" / "user-icons"
    monkeypatch.setattr(icon_resources, "USER_ICON_ROOT", root)
    monkeypatch.setattr(icon_resources, "USER_ICON_META", root / "icons.json")
    monkeypatch.setattr(icon_resources, "CUSTOM_UNIT_TILE", root / "unitTile.png")
    monkeypatch.setattr(icon_resources, "CUSTOM_COUNTRY_TILE", root / "countryTile.png")
    monkeypatch.setattr(icon_resources, "RESOLVED_UNIT_TILE", root / "resolvedUnitTile.png")
    monkeypatch.setattr(icon_resources, "RESOLVED_COUNTRY_TILE", root / "resolvedCountryTile.png")
    monkeypatch.setattr(icon_resources, "SOURCE_ROOT", root / "sources")
    monkeypatch.setattr(icon_resources, "ORIGINAL_ROOT", root / "originals")
    monkeypatch.setattr(icon_resources, "load_app_config", lambda: {})
    return root


def _data_url(image: Image.Image) -> str:
    payload = BytesIO()
    image.save(payload, format="PNG")
    return "data:image/png;base64," + base64.b64encode(payload.getvalue()).decode("ascii")


class _Workspace:
    def __init__(self, document: IniDocument, *, include_target: bool = True):
        self.document = document
        self.include_target = include_target

    def _doc(self) -> IniDocument:
        return self.document

    def snapshot(self) -> dict:
        items = [{"section": "MYCONA", "label": "我的挖掘机"}] if self.include_target else []
        return {"categories": [{"name": "载具", "items": items}]}


def _rules() -> IniDocument:
    return IniDocument.from_text(
        "[VehicleTypes]\n"
        "1=MYCONA\n"
        "[MYCONA]\n"
        "Name=我的挖掘机\n"
        "Image=MYCONA\n"
    )


def _sample_icon() -> Image.Image:
    image = Image.new("RGBA", (180, 120), (35, 55, 80, 255))
    image.paste((225, 150, 45, 255), (55, 20, 155, 105))
    return image


def test_persistent_snapshot_matches_custom_icon_id_case_insensitively(monkeypatch, tmp_path: Path) -> None:
    _patch_icon_storage(monkeypatch, tmp_path)
    rules = _rules()

    # Simulate older metadata/source spelling that differs only by Section case.
    IconResourceService(_Workspace(rules)).import_custom_icon(
        kind="unit",
        target_id="mycona",
        data_base64=_data_url(_sample_icon()),
        filename="excavator.png",
        sync_game=False,
    )

    snapshot = PersistentIconResourceService(_Workspace(rules)).library_snapshot()

    assert "MYCONA" in snapshot["unit"]
    assert snapshot["unit"]["MYCONA"]["source"] == "custom"
    assert snapshot["unitTile"].startswith("data:image/png;base64,")


def test_persistent_snapshot_does_not_depend_on_current_target_scan(monkeypatch, tmp_path: Path) -> None:
    _patch_icon_storage(monkeypatch, tmp_path)
    rules = _rules()
    service = IconResourceService(_Workspace(rules))
    service.import_custom_icon(
        kind="unit",
        target_id="MYCONA",
        data_base64=_data_url(_sample_icon()),
        filename="excavator.png",
        sync_game=False,
    )

    # Startup/open timing can momentarily return no target rows. The persisted icon must
    # still remain in the library instead of being replaced by an empty cache snapshot.
    snapshot = PersistentIconResourceService(_Workspace(rules, include_target=False)).library_snapshot()

    assert snapshot["unit"]["MYCONA"]["source"] == "custom"
    assert snapshot["customCount"] == 1


def test_persistent_snapshot_recovers_generated_png_from_old_custom_atlas(monkeypatch, tmp_path: Path) -> None:
    _patch_icon_storage(monkeypatch, tmp_path)
    rules = _rules()
    service = IconResourceService(_Workspace(rules))
    service.import_custom_icon(
        kind="unit",
        target_id="MYCONA",
        data_base64=_data_url(_sample_icon()),
        filename="excavator.png",
        sync_game=False,
    )

    generated = icon_resources._source_path("unit", "MYCONA")
    original = icon_resources._original_path("unit", "MYCONA")
    assert icon_resources.CUSTOM_UNIT_TILE.is_file()
    generated.unlink()
    original.unlink()

    snapshot = PersistentIconResourceService(_Workspace(rules)).library_snapshot()

    assert snapshot["unit"]["MYCONA"]["source"] == "custom"
    assert generated.is_file()
    recovered = Image.open(generated)
    assert recovered.size == icon_resources.UNIT_CELL
