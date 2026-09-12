from __future__ import annotations

from io import BytesIO
from pathlib import Path
from struct import pack

from rulesmd_editor.icon_resources_safe import SafeIconResourceService
from rulesmd_editor.ini_document import IniDocument
from rulesmd_editor.mix_extract import extract_mix_entry, extract_yuri_artmd, ra2_filename_hash


def _mix_blob(files: dict[str, bytes]) -> bytes:
    rows: list[tuple[int, int, bytes]] = []
    offset = 0
    for name, payload in files.items():
        rows.append((ra2_filename_hash(name), offset, payload))
        offset += len(payload)
    data = b"".join(payload for _, _, payload in rows)
    header = pack("<IHI", 0, len(rows), len(data))
    index = b"".join(pack("<III", file_id, item_offset, len(payload)) for file_id, item_offset, payload in rows)
    return header + index + data


def _stock_artmd() -> bytes:
    chunks = []
    for index in range(24):
        chunks.append(f"[ART{index}]\r\n")
        for key in range(14):
            chunks.append(f"Key{key}=Value_{index}_{key}_ABCDEFGHIJKLMNOPQRSTUVWXYZ\r\n")
        chunks.append("\r\n")
    return "".join(chunks).encode("cp1252")


def _write_ra2md(root: Path, artmd: bytes) -> None:
    localmd = _mix_blob({"artmd.ini": artmd, "dummy.ini": b"[Dummy]\r\nA=B\r\n"})
    ra2md = _mix_blob({"localmd.mix": localmd, "other.bin": b"123456"})
    (root / "ra2md.mix").write_bytes(ra2md)


def test_extract_known_entry_from_nested_yuri_mix(tmp_path: Path) -> None:
    artmd = _stock_artmd()
    _write_ra2md(tmp_path, artmd)

    extracted, source = extract_yuri_artmd(tmp_path)

    assert extracted == artmd
    assert source.lower().endswith("localmd.mix -> artmd.ini")


def test_extract_mix_entry_uses_ra2_filename_hash() -> None:
    blob = _mix_blob({"localmd.mix": b"nested", "artmd.ini": b"art"})
    assert extract_mix_entry(BytesIO(blob), "LOCALMD.MIX") == b"nested"
    assert extract_mix_entry(BytesIO(blob), "artmd.ini") == b"art"


class _TestSafeIconResourceService(SafeIconResourceService):
    def __init__(self, root: Path):
        self._root = root
        self.workspace = None
        self._last_artmd_prepare = None

    def game_root(self) -> Path:
        return self._root

    def artmd_path(self) -> Path:
        return self._root / "artmd.ini"


def test_incomplete_loose_artmd_is_repaired_and_overlaid(tmp_path: Path) -> None:
    _write_ra2md(tmp_path, _stock_artmd())
    stub = "[CONA]\r\nCameoPCX=rulesmd_MYCONA_cf51d8a4.pcx\r\n"
    artmd_path = tmp_path / "artmd.ini"
    artmd_path.write_text(stub, encoding="cp1252", newline="")

    service = _TestSafeIconResourceService(tmp_path)
    result = service._ensure_artmd_for_write()

    assert result["autoExtracted"] is True
    assert result["repairedIncomplete"] is True
    assert Path(result["backup"]).read_bytes() == stub.encode("cp1252")

    repaired = IniDocument.load(artmd_path)
    assert len(repaired.sections()) >= 24
    assert repaired.get("CONA", "CameoPCX") == "rulesmd_MYCONA_cf51d8a4.pcx"
    assert service._artmd_looks_complete(artmd_path)


def test_complete_loose_artmd_is_not_reextracted(tmp_path: Path) -> None:
    artmd_path = tmp_path / "artmd.ini"
    artmd_path.write_bytes(_stock_artmd())
    # No ra2md.mix on purpose: a complete loose ArtMD should be accepted as-is.
    service = _TestSafeIconResourceService(tmp_path)

    result = service._ensure_artmd_for_write()

    assert result["autoExtracted"] is False
    assert result["repairedIncomplete"] is False
