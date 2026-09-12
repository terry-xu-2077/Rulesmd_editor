from __future__ import annotations

import faulthandler
import json
import sys
import traceback
from typing import BinaryIO, TextIO, TYPE_CHECKING

from .export_bridge import ExportBridge, ExportMixRulesWorkspace
from .user_data import load_app_config

if TYPE_CHECKING:
    from .icon_resources import IconResourceService


def _report_exception() -> None:
    """Write the full traceback to stderr without breaking the JSON RPC channel."""
    try:
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
    except Exception:
        pass


class DiagnosticExportBridge(ExportBridge):
    """Desktop dispatcher that preserves the normal RPC envelope and logs full failures.

    Resource-side helpers are loaded lazily so a problem in an optional feature can never
    prevent the editor core (new/open/save/snapshot) from starting.
    """

    def _icon_resources(self) -> "IconResourceService":
        try:
            from .icon_resources import IconResourceService
        except ImportError as exc:
            raise RuntimeError(
                "图标资源模块运行依赖不完整，请重新运行“启动项目.bat”修复开发环境。"
            ) from exc
        return IconResourceService(self.workspace)

    @staticmethod
    def _ares_enabled() -> bool:
        return bool(load_app_config().get("aresEnabled", True))

    def rpc_icon_library_snapshot(self) -> dict:
        result = self._icon_resources().library_snapshot()
        result["aresEnabled"] = self._ares_enabled()
        return result

    def rpc_import_custom_icon(
        self,
        kind: str,
        target_id: str,
        data_base64: str,
        filename: str = "",
        sync_game: bool = True,
        variant: str = "cameo",
    ) -> dict:
        # CameoPCX / AltCameoPCX and country File.Flag are Ares extensions. The user may
        # still keep an editor-only custom tile with Ares disabled, but game sync must
        # never silently write tags the vanilla game does not understand.
        allow_game_sync = bool(sync_game) and self._ares_enabled()
        result = self._icon_resources().import_custom_icon(
            kind=kind,
            target_id=target_id,
            data_base64=data_base64,
            filename=filename,
            sync_game=allow_game_sync,
            variant=variant,
        )
        result["aresEnabled"] = self._ares_enabled()
        if sync_game and not allow_game_sync:
            result["syncBlockedByAres"] = True
        return result

    def rpc_remove_custom_icon(self, kind: str, target_id: str) -> dict:
        result = self._icon_resources().remove_custom_icon(kind=kind, target_id=target_id)
        result["aresEnabled"] = self._ares_enabled()
        return result

    def rpc_artmd_snapshot(self) -> dict:
        result = self._icon_resources().artmd_snapshot()
        result["aresEnabled"] = self._ares_enabled()
        return result

    def rpc_set_artmd_icon(
        self,
        section: str,
        cameo: str | None = None,
        cameo_pcx: str | None = None,
        alt_cameo_pcx: str | None = None,
    ) -> dict:
        if not self._ares_enabled() and (cameo_pcx is not None or alt_cameo_pcx is not None):
            raise ValueError("Ares 支持已关闭；CameoPCX / AltCameoPCX 不能写入。原版可继续使用 Cameo=SHP 名称。")
        result = self._icon_resources().set_artmd_icon(
            section=section,
            cameo=cameo,
            cameo_pcx=cameo_pcx,
            alt_cameo_pcx=alt_cameo_pcx,
        )
        result["aresEnabled"] = self._ares_enabled()
        return result

    def dispatch(self, request: dict) -> dict:
        request_id = request.get("id")
        method = request.get("method")
        params = request.get("params") or {}
        try:
            if not isinstance(method, str) or method.startswith("_"):
                raise ValueError("Invalid method")
            handler = getattr(self, f"rpc_{method}", None)
            if handler is None:
                raise ValueError(f"Unknown method: {method}")
            result = handler(**params)
            return {"id": request_id, "ok": True, "result": result}
        except Exception as exc:
            _report_exception()
            return {
                "id": request_id,
                "ok": False,
                "error": {"type": type(exc).__name__, "message": str(exc)},
            }


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
    bridge = DiagnosticExportBridge(ExportMixRulesWorkspace())
    for raw in stdin:
        raw = raw.strip()
        if not raw:
            continue
        response = _dispatch_raw(bridge, raw)
        stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        stdout.flush()


def serve_binary(stdin: BinaryIO, stdout: BinaryIO) -> None:
    bridge = DiagnosticExportBridge(ExportMixRulesWorkspace())
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
