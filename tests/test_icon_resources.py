from __future__ import annotations

import base64
from io import BytesIO
from pathlib import Path

from PIL import Image

from rulesmd_editor import icon_resources
from rulesmd_editor.icon_resources import IconResourceService, read_pcx, write_pcx
from rulesmd_editor.icon_resources_persistent import PersistentIconResourceService
from rulesmd_editor.ini_document import IniDocument


def _patch_icon_storage(monkeypatch, tmp_path: Path) -> None:
    root = tmp_path / "resources" / "user-icons"
    monkeypatch.setattr(icon_resources, "USER_ICON_ROOT", root)
    monkeypatch.setattr(icon_resources, "USER_ICON_META", root / "icons.json")
    monkeypatch.setattr(icon_resources, "CUSTOM_UNIT_TILE", root / "unitTile.png")
    monkeypatch.setattr(icon_resources, "CUSTOM_COUNTRY_TILE", root / "countryTile.png")
    monkeypatch.setattr(icon_resources, "RESOLVED_UNIT_TILE", root / "resolvedUnitTile.png")
    monkeypatch.setattr(icon_resources, "RESOLVED_COUNTRY_TILE", root / "resolvedCountryTile.png")
    monkeypatch.setattr(icon_resources, "SOURCE_ROOT", root / "sources")
    monkeypatch.setattr(icon_resources, "ORIGINAL_ROOT", root / "originals")


def _data_url(image: Image.Image) -> str:
    payload = BytesIO()
    image.save(payload, format="PNG")
    return "data:image/png;base64," + base64.b64encode(payload.getvalue()).decode("ascii")


class _Workspace:
    def __init__(self, document: IniDocument):
        self.document = document

    def _doc(self) -> IniDocument:
        return self.document

    def snapshot(self) -> dict:
        return {
            "categories": [
                {"name": "载具", "items": [{"section": "MYTNK", "label": "测试坦克"}]},
                {"name": "国家", "items": [{"section": "MyCountry", "label": "测试国家"}]},
            ]
        }


def test_pcx_round_trip_preserves_dimensions(tmp_path: Path) -> None:
    image = Image.new("RGBA", (60, 48), (218, 72, 35, 255))
    target = tmp_path / "cameo.pcx"
    write_pcx(image, target)
    decoded = read_pcx(target)
    assert target.read_bytes()[:4] == bytes((0x0A, 5, 1, 8))
    assert decoded.size == (60, 48)
    red, green, blue, _ = decoded.getpixel((10, 10))
    assert abs(red - 218) < 40
    assert abs(green - 72) < 40
    assert abs(blue - 35) < 70


def test_artmd_icon_config_preserves_unrelated_fields(monkeypatch, tmp_path: Path) -> None:
    _patch_icon_storage(monkeypatch, tmp_path)
    game_root = tmp_path / "game"
    game_root.mkdir()
    exe = game_root / "gamemd.exe"
    exe.write_bytes(b"")
    monkeypatch.setattr(icon_resources, "load_app_config", lambda: {"gamePath": str(exe)})

    rules = IniDocument.from_text("[VehicleTypes]\n1=MYTNK\n[MYTNK]\nImage=MYTNKART\n")
    rules.path = game_root / "rulesmd.ini"
    artmd = game_root / "artmd.ini"
    artmd.write_text("[MYTNKART]\nVoxel=yes\nCameo=OLDICON\n", encoding="utf-8")

    service = IconResourceService(_Workspace(rules))
    result = service.set_artmd_icon("MYTNKART", cameo="", cameo_pcx="mytank.pcx", alt_cameo_pcx="mytank_elite.pcx")

    saved = IniDocument.load(artmd)
    assert saved.get("MYTNKART", "Voxel") == "yes"
    assert saved.get("MYTNKART", "Cameo") == ""
    assert saved.get("MYTNKART", "CameoPCX") == "mytank.pcx"
    assert saved.get("MYTNKART", "AltCameoPCX") == "mytank_elite.pcx"
    assert result["exists"] is True
    assert result["rows"][0]["section"] == "MYTNKART"


def test_library_reads_loose_mod_cameo_and_country_flag(monkeypatch, tmp_path: Path) -> None:
    _patch_icon_storage(monkeypatch, tmp_path)
    game_root = tmp_path / "game"
    game_root.mkdir()
    exe = game_root / "gamemd.exe"
    exe.write_bytes(b"")
    monkeypatch.setattr(icon_resources, "load_app_config", lambda: {"gamePath": str(exe)})

    unit_image = Image.new("RGBA", (60, 48), (30, 140, 220, 255))
    write_pcx(unit_image, game_root / "mytank.pcx")
    country_image = Image.new("RGBA", (60, 40), (220, 180, 30, 255))
    write_pcx(country_image, game_root / "mycountry.pcx")

    rules = IniDocument.from_text(
        "[VehicleTypes]\n1=MYTNK\n[Countries]\n0=MyCountry\n"
        "[MYTNK]\nImage=MYTNKART\n[MyCountry]\nFile.Flag=mycountry.pcx\n"
    )
    rules.path = game_root / "rulesmd.ini"
    (game_root / "artmd.ini").write_text("[MYTNKART]\nCameoPCX=mytank.pcx\n", encoding="utf-8")

    snapshot = PersistentIconResourceService(_Workspace(rules)).library_snapshot()

    assert snapshot["unit"]["MYTNK"]["source"] == "mod"
    assert snapshot["unit"]["MYTNK"]["gameFile"] == "mytank.pcx"
    assert snapshot["country"]["MyCountry"]["source"] == "mod"
    assert snapshot["country"]["MyCountry"]["gameFile"] == "mycountry.pcx"
    assert snapshot["unitTile"].startswith("data:image/png;base64,")
    assert snapshot["countryTile"].startswith("data:image/png;base64,")
    assert not icon_resources.RESOLVED_UNIT_TILE.exists()
    assert not icon_resources.RESOLVED_COUNTRY_TILE.exists()


def test_custom_crop_is_written_directly_to_unit_atlas(monkeypatch, tmp_path: Path) -> None:
    _patch_icon_storage(monkeypatch, tmp_path)
    game_root = tmp_path / "game"
    game_root.mkdir()
    exe = game_root / "gamemd.exe"
    exe.write_bytes(b"")
    monkeypatch.setattr(icon_resources, "load_app_config", lambda: {"gamePath": str(exe)})

    rules = IniDocument.from_text("[VehicleTypes]\n1=MYTNK\n[MYTNK]\nImage=MYTNKART\n")
    rules.path = game_root / "rulesmd.ini"
    source = Image.new("RGBA", (200, 100), (220, 30, 30, 255))
    source.paste((25, 70, 225, 255), (100, 0, 200, 100))

    service = PersistentIconResourceService(_Workspace(rules))
    result = service.import_custom_icon(
        kind="unit",
        target_id="MYTNK",
        data_base64=_data_url(source),
        filename="wide-source.png",
        sync_game=False,
        crop_zoom=1.5,
        crop_x=0.75,
        crop_y=0.5,
    )

    atlas = Image.open(icon_resources.CUSTOM_UNIT_TILE).convert("RGBA")
    generated = atlas.crop((0, 0, 60, 48))
    restored = service.custom_icon_source("unit", "MYTNK")

    assert generated.size == (60, 48)
    red, _green, blue, _alpha = generated.getpixel((30, 24))
    assert blue > red
    assert result["version"] == 2
    assert restored["exists"] is True
    assert restored["hasOriginal"] is False
    assert restored["sourceName"] == "wide-source.png"
    assert restored["image"].startswith("data:image/png;base64,")
    assert not icon_resources.SOURCE_ROOT.exists()
    assert not icon_resources.ORIGINAL_ROOT.exists()
