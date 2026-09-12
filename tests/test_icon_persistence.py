from __future__ import annotations

import base64
import json
from io import BytesIO
from pathlib import Path

from PIL import Image

from rulesmd_editor import icon_resources
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


def test_import_persists_only_metadata_and_custom_atlas(monkeypatch, tmp_path: Path) -> None:
    _patch_icon_storage(monkeypatch, tmp_path)
    service = PersistentIconResourceService(_Workspace(_rules()))

    service.import_custom_icon(
        kind="unit",
        target_id="MYCONA",
        data_base64=_data_url(_sample_icon()),
        filename="excavator.png",
        sync_game=False,
        crop_zoom=1.5,
        crop_x=0.65,
        crop_y=0.5,
    )

    assert icon_resources.USER_ICON_META.is_file()
    assert icon_resources.CUSTOM_UNIT_TILE.is_file()
    assert not icon_resources.CUSTOM_COUNTRY_TILE.exists()
    assert not icon_resources.SOURCE_ROOT.exists()
    assert not icon_resources.ORIGINAL_ROOT.exists()
    assert not icon_resources.RESOLVED_UNIT_TILE.exists()
    assert not icon_resources.RESOLVED_COUNTRY_TILE.exists()

    payload = json.loads(icon_resources.USER_ICON_META.read_text(encoding="utf-8"))
    assert payload["storage"] == "single-atlas-v1"
    assert set(payload["unit"]["MYCONA"]) == {"slot", "source_name", "game_file"}

    atlas = Image.open(icon_resources.CUSTOM_UNIT_TILE)
    assert atlas.width == icon_resources.UNIT_CELL[0] * icon_resources.ATLAS_COLUMNS
    assert atlas.height == icon_resources.UNIT_CELL[1]

    restored = service.custom_icon_source("unit", "MYCONA")
    assert restored["exists"] is True
    assert restored["hasOriginal"] is False
    assert restored["image"].startswith("data:image/png;base64,")
    assert restored["crop"] == {"zoom": 1.0, "x": 0.5, "y": 0.5}


def test_snapshot_matches_custom_icon_case_and_does_not_require_target_scan(monkeypatch, tmp_path: Path) -> None:
    _patch_icon_storage(monkeypatch, tmp_path)
    rules = _rules()
    service = PersistentIconResourceService(_Workspace(rules))
    service.import_custom_icon(
        kind="unit",
        target_id="mycona",
        data_base64=_data_url(_sample_icon()),
        filename="excavator.png",
        sync_game=False,
    )

    snapshot = PersistentIconResourceService(_Workspace(rules, include_target=False)).library_snapshot()

    assert "MYCONA" in snapshot["unit"] or "mycona" in snapshot["unit"]
    row = snapshot["unit"].get("MYCONA") or snapshot["unit"]["mycona"]
    assert row["source"] == "custom"
    assert snapshot["customCount"] == 1
    assert snapshot["unitTile"].startswith("data:image/png;base64,")


def test_legacy_per_object_files_migrate_into_atlas_then_are_removed(monkeypatch, tmp_path: Path) -> None:
    root = _patch_icon_storage(monkeypatch, tmp_path)
    rules = _rules()
    root.mkdir(parents=True)
    (root / "sources" / "unit").mkdir(parents=True)
    (root / "originals" / "unit").mkdir(parents=True)

    icon = Image.new("RGBA", icon_resources.UNIT_CELL, (40, 170, 215, 255))
    generated = icon_resources._source_path("unit", "MYCONA")
    generated.parent.mkdir(parents=True, exist_ok=True)
    icon.save(generated, format="PNG")
    original = icon_resources._original_path("unit", "MYCONA")
    original.parent.mkdir(parents=True, exist_ok=True)
    _sample_icon().save(original, format="PNG")
    Image.new("RGBA", icon_resources.UNIT_CELL, (0, 0, 0, 0)).save(icon_resources.RESOLVED_UNIT_TILE, format="PNG")
    icon_resources.USER_ICON_META.write_text(
        json.dumps({
            "version": 2,
            "unit": {"MYCONA": {"slot": 0, "source_name": "old.png", "game_file": "", "crop": {"zoom": 2, "x": .6, "y": .5}}},
            "country": {},
        }),
        encoding="utf-8",
    )

    service = PersistentIconResourceService(_Workspace(rules))
    snapshot = service.library_snapshot()

    assert snapshot["unit"]["MYCONA"]["source"] == "custom"
    assert icon_resources.CUSTOM_UNIT_TILE.is_file()
    assert not icon_resources.CUSTOM_COUNTRY_TILE.exists()
    assert not icon_resources.SOURCE_ROOT.exists()
    assert not icon_resources.ORIGINAL_ROOT.exists()
    assert not icon_resources.RESOLVED_UNIT_TILE.exists()
    payload = json.loads(icon_resources.USER_ICON_META.read_text(encoding="utf-8"))
    assert set(payload["unit"]["MYCONA"]) == {"slot", "source_name", "game_file"}
