from __future__ import annotations

import hashlib
import struct

from rulesmd_editor.bridge import Bridge
from rulesmd_editor.csf_file import CsfDocument
from rulesmd_editor.mix_file import (
    MIX_CHECKSUM,
    MIX_ENCRYPTED,
    MixArchive,
    _Blowfish,
    extract_rules,
    extract_rulesmd_bytes,
    mix_file_id,
)
from rulesmd_editor.mix_workspace import MixRulesWorkspace


_WESTWOOD_MODULUS = int(
    "51bcda086d39fce4565160d651713fa2e8aa54fa6682b04aabdd0e6af8b0c1e6"
    "d1fb4f3daa437f15",
    16,
)
_WESTWOOD_PRIVATE_EXPONENT = int(
    "0a5637bc99139c47c422c67c54105e5bdbd0aeae4ab4d4334358274e1bdf5706"
    "a1fbf4e682893081",
    16,
)


def _build_mix(
    files: list[tuple[str, bytes]],
    *,
    flags: int = 0,
    declared_body_delta: int = 0,
) -> bytes:
    body = bytearray()
    entries = []
    for filename, payload in files:
        offset = len(body)
        body.extend(payload)
        entries.append(struct.pack("<III", mix_file_id(filename), offset, len(payload)))
    return (
        struct.pack("<IHI", flags, len(entries), len(body) + declared_body_delta)
        + b"".join(entries)
        + bytes(body)
    )


def _key_source_for(blowfish_key: bytes) -> bytes:
    # Westwood's 80-byte key source stores two little-endian RSA blocks. The game
    # applies exponent 0x10001; the known private exponent is used here only to build
    # a deterministic encrypted fixture.
    clear = blowfish_key + bytes(78 - len(blowfish_key))
    source = bytearray()
    for offset in (0, 39):
        value = int.from_bytes(clear[offset : offset + 39], "little")
        encrypted = pow(value, _WESTWOOD_PRIVATE_EXPONENT, _WESTWOOD_MODULUS)
        source.extend(encrypted.to_bytes(40, "little"))
    return bytes(source)


def _build_encrypted_mix(
    files: list[tuple[str, bytes]],
    *,
    checksum: bool = False,
) -> bytes:
    body = bytearray()
    entries = []
    for filename, payload in files:
        offset = len(body)
        body.extend(payload)
        entries.append(struct.pack("<III", mix_file_id(filename), offset, len(payload)))

    plain_header = struct.pack("<HI", len(entries), len(body)) + b"".join(entries)
    plain_header += bytes((-len(plain_header)) % 8)
    key = bytes(range(56))
    encrypted_header = _Blowfish(key).encrypt(plain_header)
    flags = MIX_ENCRYPTED | (MIX_CHECKSUM if checksum else 0)
    digest = hashlib.sha1(body).digest() if checksum else b""
    return (
        struct.pack("<I", flags)
        + _key_source_for(key)
        + encrypted_header
        + bytes(body)
        + digest
    )


def test_known_mental_omega_rules_file_id():
    assert mix_file_id("rulesmo.ini") == 0xE8DF0937


def test_mix_reader_extracts_unencrypted_rulesmd_ini():
    payload = b"[General]\r\nName=CnCNet Test\r\n"
    archive = MixArchive(_build_mix([("rulesmd.ini", payload)]))

    assert archive.read_file("rulesmd.ini") == payload
    assert archive.read_file("RULESMD.INI") == payload


def test_mix_reader_handles_original_westwood_encrypted_header_and_checksum():
    payload = b"[General]\r\nName=Original YR\r\n"
    archive = MixArchive(_build_encrypted_mix([("rulesmd.ini", payload)], checksum=True))

    assert archive.encrypted is True
    assert archive.has_checksum is True
    assert archive.read_file("rulesmd.ini") == payload


def test_mix_reader_ignores_protector_body_size_and_high_flag_garbage():
    payload = b"[General]\nName=Mental Omega\n"
    protected = _build_mix(
        [("rulesmo.ini", payload)],
        flags=0xA5000000,
        declared_body_delta=0x1234,
    )
    archive = MixArchive(protected)

    assert archive.protected is True
    assert archive.read_file("rulesmo.ini") == payload


def test_mix_reader_can_follow_nested_localmd_mix():
    payload = b"[General]\nName=Nested\n"
    localmd = _build_mix([("rulesmd.ini", payload)])
    archive = MixArchive(_build_mix([("localmd.mix", localmd)]))

    assert archive.read_file("localmd.mix/rulesmd.ini") == payload


def test_extract_rules_recognizes_mental_omega_rulesmo(tmp_path):
    payload = b"[General]\nName=Mental Omega\n"
    path = tmp_path / "expandmo99.mix"
    path.write_bytes(_build_mix([("rulesmo.ini", payload)], declared_body_delta=512))

    extracted = extract_rules(path)

    workspace = MixRulesWorkspace()
    snapshot = workspace.open_file(path)
    assert snapshot["document"]["path"] == str(tmp_path / "rulesmo.ini")
    assert extracted.filename == "rulesmo.ini"
    assert extracted.data == payload
    assert extract_rulesmd_bytes(path) == payload


def test_mix_workspace_creates_loose_csf_name_for_new_unit(tmp_path):
    payload = (
        b"[InfantryTypes]\r\n"
        b"0=E1\r\n"
        b"[E1]\r\n"
        b"UIName=Name:E1\r\n"
        b"Name=GI\r\n"
        b"Strength=125\r\n"
    )
    mix_path = tmp_path / "expandmd01.mix"
    mix_path.write_bytes(_build_encrypted_mix([("rulesmd.ini", payload)]))

    workspace = MixRulesWorkspace()
    snapshot = workspace.open_file(mix_path)
    assert snapshot["document"]["path"] == str(tmp_path / "rulesmd.ini")
    assert snapshot["companion"]["suggested_rules_name"] == "rulesmd.ini"

    created = workspace.create_unit(
        template="E1",
        section="MYGI",
        comment="我的测试步兵",
        included_line_ids=None,
    )
    assert created["section"]["description"] == "我的测试步兵"
    assert "UIName=Name:MYGI" in created["section"]["raw"]
    assert created["snapshot"]["companion"]["pending_strings"] == 1

    output = tmp_path / "rulesmd.ini"
    saved = workspace.save()

    assert saved["path"] == str(output)
    assert saved["csf_path"] == str(tmp_path / "stringtable99.csf")
    assert "UIName=Name:MYGI" in output.read_text("utf-8")
    strings = CsfDocument.load(tmp_path / "stringtable99.csf")
    assert strings.language == 0xFFFFFFFF
    assert strings.get("Name:MYGI") == "我的测试步兵"


def test_existing_stringtable99_entries_are_preserved(tmp_path):
    table_path = tmp_path / "stringtable99.csf"
    table = CsfDocument.new()
    table.set("Name:EXISTING", "原有名称")
    table.save(table_path)

    rules = tmp_path / "rulesmd.ini"
    rules.write_text(
        "[InfantryTypes]\n"
        "0=E1\n"
        "[E1]\n"
        "UIName=Name:E1\n"
        "Name=GI\n"
        "Strength=125\n",
        encoding="utf-8",
    )

    workspace = MixRulesWorkspace()
    workspace.open_file(rules)
    workspace.create_unit(
        template="E1",
        section="MYGI",
        comment="新增名称",
        included_line_ids=None,
    )
    workspace.save()

    updated = CsfDocument.load(table_path)
    assert updated.get("Name:EXISTING") == "原有名称"
    assert updated.get("Name:MYGI") == "新增名称"


def test_vanilla_mode_merges_full_ra2md_csf_from_langmd_mix(tmp_path):
    base_strings = CsfDocument.new(language=9)
    base_strings.set("Name:E1", "美国大兵")
    langmd = tmp_path / "langmd.mix"
    langmd.write_bytes(_build_encrypted_mix([("ra2md.csf", base_strings.to_bytes())]))

    rules_payload = (
        b"[InfantryTypes]\n"
        b"0=E1\n"
        b"[E1]\n"
        b"UIName=Name:E1\n"
        b"Name=GI\n"
        b"Strength=125\n"
    )
    rules_mix = tmp_path / "expandmd01.mix"
    rules_mix.write_bytes(_build_encrypted_mix([("rulesmd.ini", rules_payload)]))

    workspace = MixRulesWorkspace()
    workspace.open_file(rules_mix)
    workspace.set_settings(ares_enabled=False)
    workspace.create_unit(
        template="E1",
        section="MYGI",
        comment="原版中文测试",
        included_line_ids=None,
    )
    saved = workspace.save(tmp_path / "rulesmd.ini")

    assert saved["csf_path"] == str(tmp_path / "ra2md.csf")
    assert not (tmp_path / "stringtable99.csf").exists()
    merged = CsfDocument.load(tmp_path / "ra2md.csf")
    assert merged.language == 9
    assert merged.get("Name:E1") == "美国大兵"
    assert merged.get("Name:MYGI") == "原版中文测试"


def test_mix_without_supported_rules_reports_one_clear_error(tmp_path):
    mix_path = tmp_path / "no-rules.mix"
    mix_path.write_bytes(_build_mix([("aimd.ini", b"[AI]\n")]))

    response = Bridge(MixRulesWorkspace()).dispatch(
        {"id": 1, "method": "open_file", "params": {"path": str(mix_path)}}
    )
    assert response["ok"] is False
    assert "没有可识别的 Rules INI" in response["error"]["message"]
