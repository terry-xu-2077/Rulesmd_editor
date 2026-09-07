from __future__ import annotations

import codecs
from io import BytesIO
import json

from rulesmd_editor.desktop_bridge import _decode_request_bytes, serve_binary


REQUEST = '{"id":1,"method":"ping","params":{}}\n'


def test_decode_request_bytes_accepts_utf8() -> None:
    assert _decode_request_bytes(REQUEST.encode("utf-8")) == REQUEST.strip()


def test_decode_request_bytes_accepts_utf8_bom() -> None:
    payload = codecs.BOM_UTF8 + REQUEST.encode("utf-8")
    assert _decode_request_bytes(payload) == REQUEST.strip()


def test_decode_request_bytes_accepts_utf16le_bom() -> None:
    payload = codecs.BOM_UTF16_LE + REQUEST.encode("utf-16-le")
    assert _decode_request_bytes(payload) == REQUEST.strip()


def test_serve_binary_ping_round_trip_is_utf8() -> None:
    stdin = BytesIO(REQUEST.encode("utf-8"))
    stdout = BytesIO()

    serve_binary(stdin, stdout)

    response = json.loads(stdout.getvalue().decode("utf-8"))
    assert response["id"] == 1
    assert response["ok"] is True
    assert response["result"]["status"] == "ok"
