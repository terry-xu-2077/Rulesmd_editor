from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
import json
import sys
from typing import Any, TextIO

from .workspace import RulesWorkspace
from .yr_applicability import infer_yr_applies_to


class Bridge:
    """Small JSON-RPC-like dispatcher used by the desktop sidecar.

    Expensive parameter-catalog preparation is warmed on a worker as soon as the
    sidecar is alive. Document open/new stays focused on parsing and the minimal indexes
    required to render the editor.
    """

    def __init__(self, workspace: RulesWorkspace | None = None):
        self.workspace = workspace or RulesWorkspace()
        self._warm_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="rulesmd-warm")
        self._catalog_warm_future: Future[int] | None = None
        self._schedule_catalog_warmup()

    def _schedule_catalog_warmup(self) -> None:
        if self._catalog_warm_future is not None:
            return
        self._catalog_warm_future = self._warm_executor.submit(self.workspace.schema.warm_available_options)

    def dispatch(self, request: dict[str, Any]) -> dict[str, Any]:
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
            return {
                "id": request_id,
                "ok": False,
                "error": {"type": type(exc).__name__, "message": str(exc)},
            }

    def rpc_ping(self) -> dict[str, str]:
        return {"service": "rulesmd-editor-python", "status": "ok"}

    def rpc_get_settings(self) -> dict:
        return self.workspace.get_settings()

    def rpc_set_settings(self, ares_enabled: bool | None = None) -> dict:
        return self.workspace.set_settings(ares_enabled=ares_enabled)

    def rpc_new_document(self) -> dict:
        return self.workspace.new_document()

    def rpc_open_file(self, path: str) -> dict:
        return self.workspace.open_file(path)

    def rpc_snapshot(self) -> dict:
        return self.workspace.snapshot()

    def rpc_section(self, section: str) -> dict:
        return self.workspace.section(section)

    def rpc_option_catalog(self, query: str = "", applies_to: str | None = None, section: str | None = None) -> list[dict]:
        return self.workspace.option_catalog(query=query, applies_to=applies_to, section=section)

    def rpc_option_catalog_all(self, query: str = "", applies_to: str | None = None, section: str | None = None) -> list[dict]:
        """Return every insertable catalog row plus a conservative compatibility flag."""
        target_type = applies_to
        if section:
            target_type = self.workspace._section_types.get(section.casefold()) or applies_to
        family = self.workspace._family_type(target_type)
        existing = {
            key.casefold()
            for _, key, _ in self.workspace._doc().items_with_ids(section)
        } if section else set()
        observed_exact = self.workspace._observed_keys.get(target_type or "", set())

        result: list[dict] = []
        for meta in self.workspace.schema.available_options(query=query):
            if not self.workspace.settings.ares_enabled and meta.source.casefold() == "ares":
                continue
            if meta.name.casefold() in existing:
                continue

            declared = tuple(meta.applies_to)
            if not declared and meta.source.casefold() == "yr":
                declared = infer_yr_applies_to(meta.name, meta.help_text)

            compatible = False
            if target_type and declared:
                compatible = target_type in declared or (family == "TechnoType" and "TechnoType" in declared)
            elif target_type:
                compatible = meta.name.casefold() in observed_exact
            elif declared:
                compatible = True

            result.append({
                "key": meta.name,
                "label": meta.description or meta.name,
                "description": meta.help_text,
                "category": meta.category,
                "source": meta.source,
                "value_type": meta.value_type,
                "applies_to": list(declared),
                "default": meta.default,
                "values": [{"value": value, "label": label} for value, label in meta.values],
                "docs": meta.docs,
                "compatible": compatible,
            })
        return result

    def rpc_set_value(self, line_id: int, value: str) -> dict:
        return self.workspace.set_value(line_id, value)

    def rpc_add_option(self, section: str, key: str, value: str | None = None) -> dict:
        return self.workspace.add_option(section, key, value)

    def rpc_remove_line(self, line_id: int) -> dict:
        return self.workspace.remove_line(line_id)

    def rpc_save(self, path: str | None = None) -> dict:
        return self.workspace.save(path)

    def rpc_raw_text(self) -> str:
        return self.workspace.raw_text()


def serve(stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout) -> None:
    bridge = Bridge()
    for raw in stdin:
        raw = raw.strip()
        if not raw:
            continue
        try:
            request = json.loads(raw)
            if not isinstance(request, dict):
                raise ValueError("Request must be a JSON object")
            response = bridge.dispatch(request)
        except Exception as exc:
            response = {
                "id": None,
                "ok": False,
                "error": {"type": type(exc).__name__, "message": str(exc)},
            }
        stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        stdout.flush()


def main() -> None:
    serve()


if __name__ == "__main__":
    main()
