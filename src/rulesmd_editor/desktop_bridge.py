from __future__ import annotations

import faulthandler
import json
import sys
import traceback
from typing import BinaryIO, TextIO

from .export_bridge import ExportBridge, ExportMixRulesWorkspace


def _report_exception() -> None:
    """Write the full traceback to stderr without breaking the JSON RPC channel."""
    try:
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
    except Exception:
        pass


def _dispatch_raw(bridge: ExportBridge, raw: str) -> dict:
    raw = raw.strip().lstrip("\ufeff\x00")
    try:
        request = json.loads(raw)
        if not isinstance(request, dict):
            raise ValueError("Request must be a JSON object")
        return bridge.dispatch(request)
    except Exception as exc:
        _report_exception()
        return {
            "id": None,
            "ok": False,
            "error": {"type": type(exc).__name__, "message": str(exc)},
        }


def _clean_decoded_request(raw: str) -> str:
    return raw.strip().lstrip("\ufeff\x00")


def _decode_request_bytes(raw: bytes) -> str:
    raw = raw.strip()
    if not raw:
        return ""

    if raw.startswith(b"\xef\xbb\xbf"):
        return _clean_decoded_request(raw.decode("utf-8-sig"))
    if raw.startswith(b"\xff\xfe"):
        return _clean_decoded_request(raw.decode("utf-16-le"))
    if raw.startswith(b"\xfe\xff"):
        return _clean_decoded_request(raw.decode("utf-16-be"))

    prefix = raw[:16]
    if b"\x00" in prefix:
        even_zeros = sum(1 for index, value in enumerate(prefix) if index % 2 == 0 and value == 0)
        odd_zeros = sum(1 for index, value in enumerate(prefix) if index % 2 == 1 and value == 0)
        if odd_zeros > even_zeros:
            return _clean_decoded_request(raw.decode("utf-16-le"))
        if even_zeros > odd_zeros:
            return _clean_decoded_request(raw.decode("utf-16-be"))

    return _clean_decoded_request(raw.decode("utf-8-sig"))


def serve(stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout) -> None:
    bridge = ExportBridge(ExportMixRulesWorkspace())
    for raw in stdin:
        raw = raw.strip()
        if not raw:
            continue
        response = _dispatch_raw(bridge, raw)
        stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        stdout.flush()


def serve_binary(stdin: BinaryIO, stdout: BinaryIO) -> None:
    bridge = ExportBridge(ExportMixRulesWorkspace())
    for raw_bytes in stdin:
        raw_bytes = raw_bytes.strip()
        if not raw_bytes:
            continue
        try:
            raw = _decode_request_bytes(raw_bytes)
            response = _dispatch_raw(bridge, raw)
        except Exception as exc:
            _report_exception()
            response = {
                "id": None,
                "ok": False,
                "error": {"type": type(exc).__name__, "message": str(exc)},
            }
        payload = (json.dumps(response, ensure_ascii=False) + "\n").encode("utf-8")
        stdout.write(payload)
        stdout.flush()


def main() -> None:
    try:
        faulthandler.enable()
    except Exception:
        pass

    try:
        print(
            f"[rulesmd-backend] python={sys.version.split()[0]} "
            f"frozen={bool(getattr(sys, 'frozen', False))} executable={sys.executable}",
            file=sys.stderr,
            flush=True,
        )
    except Exception:
        pass

    stdin_buffer = getattr(sys.stdin, "buffer", None)
    stdout_buffer = getattr(sys.stdout, "buffer", None)
    if stdin_buffer is not None and stdout_buffer is not None:
        serve_binary(stdin_buffer, stdout_buffer)
    else:
        serve()


if __name__ == "__main__":
    main()
