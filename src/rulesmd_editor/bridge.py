from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
import json
import sys
from typing import Any, TextIO

from .global_rules import (
    GLOBAL_RULE_VIEWS,
    global_rule_category,
    global_rule_sections_in_order,
    is_global_rule_section,
)
from .line_actions import (
    OptionLineState,
    all_option_keys,
    apply_option_state,
    option_line_state,
    section_option_states,
    set_line_disabled,
)
from .workspace import RulesWorkspace
from .yr_applicability import infer_yr_applies_to


class Bridge:
    """Small JSON-RPC-like dispatcher used by the desktop sidecar."""

    def __init__(self, workspace: RulesWorkspace | None = None):
        self.workspace = workspace or RulesWorkspace()
        self._warm_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="rulesmd-warm")
        self._catalog_warm_future: Future[int] | None = None
        self._baseline_lines: dict[int, OptionLineState] = {}
        self._baseline_structure: tuple[tuple, ...] = ()
        self._schedule_catalog_warmup()
        if self.workspace.document is not None:
            self._capture_baseline()

    def _schedule_catalog_warmup(self) -> None:
        if self._catalog_warm_future is not None:
            return
        self._catalog_warm_future = self._warm_executor.submit(self.workspace.schema.warm_available_options)

    def _structure_signature(self) -> tuple[tuple, ...]:
        if self.workspace.document is None:
            return ()
        signature: list[tuple] = []
        for line in self.workspace.document.lines:
            state = option_line_state(line)
            if state is not None:
                signature.append((
                    "option",
                    state.line_id,
                    state.section.casefold(),
                    state.key.casefold(),
                    state.disabled,
                    state.value if state.disabled else None,
                ))
            else:
                signature.append(("line", line.line_id, line.kind, line.section or "", line.raw))
        return tuple(signature)

    def _capture_baseline(self) -> None:
        if self.workspace.document is None:
            self._baseline_lines = {}
            self._baseline_structure = ()
            return
        self._baseline_lines = {
            state.line_id: state
            for line in self.workspace.document.lines
            if (state := option_line_state(line)) is not None
        }
        self._baseline_structure = self._structure_signature()

    def _sync_structural_dirty(self) -> None:
        self.workspace._structural_dirty = self._structure_signature() != self._baseline_structure
        self.workspace._refresh_dirty()

    def _line_action_result(self, section: str) -> dict:
        target = "General" if is_global_rule_section(section) else section
        return {
            "section": self.rpc_section(target),
            "dirty": self.workspace.info().dirty,
        }

    def _decorate_active_row(self, row: dict, *, category: str | None = None) -> dict:
        baseline = self._baseline_lines.get(row["line_id"])
        row["disabled"] = False
        row["raw_disabled"] = baseline.disabled if baseline is not None else None
        if baseline is not None:
            row["raw_value"] = baseline.value
        if category is not None:
            row["category"] = category
        return row

    def _disabled_row(self, state: OptionLineState, *, category: str | None = None) -> dict:
        meta = self.workspace.schema.option(state.key)
        control = self.workspace._control_for(state.key, state.value, meta)
        baseline = self._baseline_lines.get(state.line_id)
        return {
            "line_id": state.line_id,
            "key": state.key,
            "value": state.value,
            "raw_value": baseline.value if baseline is not None else None,
            "raw_disabled": baseline.disabled if baseline is not None else None,
            "disabled": True,
            "suffix": state.suffix,
            "label": meta.description or state.key,
            "description": meta.help_text,
            "category": category if category is not None else meta.category,
            "source": meta.source,
            "value_type": meta.value_type,
            "widget": control.widget,
            "values": [{"value": item_value, "label": label} for item_value, label in control.values],
            "docs": meta.docs,
        }

    def _global_raw(self) -> str:
        doc = self.workspace._doc()
        parts = [
            doc.clone_section_text(section).rstrip("\r\n")
            for section in global_rule_sections_in_order()
            if doc.has_section(section)
        ]
        text = (doc.newline * 2).join(part for part in parts if part)
        return text + (doc.newline if text else "")

    def _rpc_single_section(self, section: str) -> dict:
        result = self.workspace.section(section)
        actual = result["section"]
        active_by_id = {row["line_id"]: row for row in result["options"]}

        for row in result["options"]:
            self._decorate_active_row(row)

        for state in section_option_states(self.workspace._doc(), actual):
            if not state.disabled or state.line_id in active_by_id:
                continue
            result["options"].append(self._disabled_row(state))

        result["options"].sort(key=lambda row: row["line_id"])
        return result

    def _rpc_global_section(self) -> dict:
        doc = self.workspace._doc()
        options: list[dict] = []
        references: list[dict] = []
        active_ids: set[int] = set()

        for section in global_rule_sections_in_order():
            if not doc.has_section(section):
                continue
            payload = self.workspace.section(section)
            actual = payload["section"]
            references.extend(payload.get("references", []))
            for row in payload["options"]:
                active_ids.add(row["line_id"])
                options.append(self._decorate_active_row(
                    row,
                    category=global_rule_category(actual, row["key"]),
                ))

        for section in global_rule_sections_in_order():
            if not doc.has_section(section):
                continue
            actual = doc._section_name(section) or section
            for state in section_option_states(doc, actual):
                if not state.disabled or state.line_id in active_ids:
                    continue
                options.append(self._disabled_row(
                    state,
                    category=global_rule_category(state.section, state.key),
                ))

        category_order = {label: index for index, (label, _, _) in enumerate(GLOBAL_RULE_VIEWS)}
        options.sort(key=lambda row: (category_order.get(row["category"], 999), row["line_id"]))
        return {
            "section": "General",
            "description": "全局规则",
            "options": options,
            "raw": self._global_raw(),
            "references": references,
        }

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
        result = self.workspace.new_document()
        self._capture_baseline()
        return result

    def rpc_open_file(self, path: str) -> dict:
        result = self.workspace.open_file(path)
        self._capture_baseline()
        return result

    def rpc_snapshot(self) -> dict:
        return self.workspace.snapshot()

    def rpc_section(self, section: str) -> dict:
        if section.strip().casefold() == "general":
            return self._rpc_global_section()
        return self._rpc_single_section(section)

    def rpc_option_catalog(self, query: str = "", applies_to: str | None = None, section: str | None = None) -> list[dict]:
        return self.workspace.option_catalog(query=query, applies_to=applies_to, section=section)

    def rpc_option_catalog_all(self, query: str = "", applies_to: str | None = None, section: str | None = None) -> list[dict]:
        target_type = applies_to
        if section:
            target_type = self.workspace._section_types.get(section.casefold()) or applies_to
        family = self.workspace._family_type(target_type)
        if section and section.casefold() == "general":
            existing: set[str] = set()
            for global_section in global_rule_sections_in_order():
                if self.workspace._doc().has_section(global_section):
                    existing.update(all_option_keys(self.workspace._doc(), global_section))
        else:
            existing = all_option_keys(self.workspace._doc(), section) if section else set()
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
        result = self.workspace.set_value(line_id, value)
        if is_global_rule_section(result["section"]):
            result["section"] = "General"
            result["raw"] = self._global_raw()
        return result

    def rpc_add_option(self, section: str, key: str, value: str | None = None) -> dict:
        return self.workspace.add_option(section, key, value)

    def rpc_create_unit(
        self,
        template: str,
        section: str,
        comment: str,
        included_line_ids: list[int] | None = None,
    ) -> dict:
        result = self.workspace.create_unit(
            template=template,
            section=section,
            comment=comment,
            included_line_ids=included_line_ids,
        )
        self._sync_structural_dirty()
        return result

    def rpc_set_line_disabled(self, line_id: int, disabled: bool) -> dict:
        doc = self.workspace._doc()
        current = option_line_state(doc.line(line_id)) if doc.line(line_id) is not None else None
        if current is None:
            raise KeyError(f"Unknown parameter line id: {line_id}")
        section = current.section
        set_line_disabled(doc, line_id, disabled)
        self.workspace._rebuild_indexes()
        self._sync_structural_dirty()
        return self._line_action_result(section)

    def rpc_restore_line(self, line_id: int) -> dict:
        doc = self.workspace._doc()
        line = doc.line(line_id)
        current = option_line_state(line) if line is not None else None
        if current is None:
            raise KeyError(f"Unknown parameter line id: {line_id}")
        section = current.section
        baseline = self._baseline_lines.get(line_id)
        if baseline is None:
            self.workspace.remove_line(line_id)
        else:
            apply_option_state(doc, line_id, baseline)
            self.workspace._changed_value_ids.discard(line_id)
            self.workspace._rebuild_indexes()
        self._sync_structural_dirty()
        return self._line_action_result(section)

    def rpc_remove_line(self, line_id: int) -> dict:
        line = self.workspace._doc().line(line_id)
        state = option_line_state(line) if line is not None else None
        if state is None:
            raise KeyError(f"Unknown parameter line id: {line_id}")
        section = state.section
        self.workspace.remove_line(line_id)
        self._sync_structural_dirty()
        return self._line_action_result(section)

    def rpc_save(self, path: str | None = None) -> dict:
        result = self.workspace.save(path)
        self._capture_baseline()
        return result

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
