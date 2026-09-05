from __future__ import annotations

import struct

from rulesmd_editor.bridge import Bridge
from rulesmd_editor.mix_file import MixArchive, extract_rulesmd_bytes, mix_file_id
from rulesmd_editor.mix_workspace import MixRulesWorkspace


def _build_mix(files: list[tuple[str, bytes]]) -> bytes:
    body = bytearray()
    entries = []
    for filename, payload in files:
        offset = len(body)
        body.extend(payload)
        entries.append(struct.pack("<Iii", mix_file_id(filename), offset, len(payload)))
    return (
        struct.pack("<IHi", 0, len(entries), len(body))
        + b"".join(entries)
        + bytes(body)
    )


def test_mix_reader_extracts_rulesmd_ini():
    payload = b"[General]\r\nName=CnCNet Test\r\n"
    archive = MixArchive(_build_mix([("rulesmd.ini", payload)]))

    assert archive.read_file("rulesmd.ini") == payload
    assert archive.read_file("RULESMD.INI") == payload


def test_mix_reader_can_follow_nested_localmd_mix():
    payload = b"[General]\nName=Nested\n"
    localmd = _build_mix([("rulesmd.ini", payload)])
    archive = MixArchive(_build_mix([("localmd.mix", localmd)]))

    assert archive.read_file("localmd.mix/rulesmd.ini") == payload


def test_mix_workspace_opens_rules_as_unsaved_ini(tmp_path):
    payload = b"[General]\r\nName=CnCNet Test\r\n[E1]\r\nStrength=125\r\n"
    mix_path = tmp_path / "cncnet.mix"
    mix_path.write_bytes(_build_mix([("rulesmd.ini", payload)]))

    workspace = MixRulesWorkspace()
    snapshot = workspace.open_file(mix_path)

    assert snapshot["document"]["kind"] == "rules"
    assert snapshot["document"]["path"] is None
    assert workspace.raw_text() == payload.decode("utf-8")
    assert workspace.document is not None
    assert workspace.document.encoding == "utf-8"


def test_mix_without_rulesmd_reports_only_the_missing_rules_error(tmp_path):
    mix_path = tmp_path / "no-rules.mix"
    mix_path.write_bytes(_build_mix([("aimd.ini", b"[AI]\n")]))

    try:
        extract_rulesmd_bytes(mix_path)
    except ValueError as exc:
        assert str(exc) == "这个 MIX 文件没有 rulesmd.ini"
    else:
        raise AssertionError("missing rulesmd.ini should fail")

    response = Bridge(MixRulesWorkspace()).dispatch(
        {"id": 1, "method": "open_file", "params": {"path": str(mix_path)}}
    )
    assert response["ok"] is False
    assert response["error"]["message"] == "这个 MIX 文件没有 rulesmd.ini"
