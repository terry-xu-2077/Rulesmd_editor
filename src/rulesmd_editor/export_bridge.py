from __future__ import annotations

from pathlib import Path

from .bridge import Bridge
from .line_actions import OptionLineState, option_line_state
from .mix_workspace import MixRulesWorkspace


class ExportMixRulesWorkspace(MixRulesWorkspace):
    """MIX-aware workspace that keeps archives as read-only baselines.

    A MIX import intentionally has no writable document path. The first Save therefore
    has to choose an output mode/path instead of silently writing a full loose rules file
    next to the archive.
    """

    def open_file(self, path: str | Path) -> dict:
        source = Path(path)
        result = super().open_file(source)
        if source.suffix.casefold() == ".mix":
            self._doc().path = None
            result = self.snapshot()
        return result


class ExportBridge(Bridge):
    """Bridge extensions for full-file vs changed-rule-fragment export."""

    @staticmethod
    def _state_changed(current: OptionLineState, baseline: OptionLineState | None) -> bool:
        if baseline is None:
            return True
        return (
            current.section.casefold() != baseline.section.casefold()
            or current.key.casefold() != baseline.key.casefold()
            or current.value != baseline.value
            or current.disabled != baseline.disabled
        )

    def _fragment_text(self) -> str:
        doc = self.workspace._doc()
        current_states = {
            state.line_id: state
            for line in doc.lines
            if (state := option_line_state(line)) is not None
        }

        # A delta INI can safely express additions and value overrides, but it cannot
        # express removing a key from the baseline. Refuse instead of producing a file
        # that looks correct while silently leaving the old rule active at runtime.
        removed = [
            state
            for line_id, state in self._baseline_lines.items()
            if line_id not in current_states
        ]
        if removed:
            first = removed[0]
            raise ValueError(
                "仅修改规则片段无法安全表达删除参数："
                f"[{first.section}] {first.key}。请还原删除项，或选择“全部规则”。"
            )

        changed_by_section: dict[str, list[OptionLineState]] = {}
        section_order: list[str] = []
        for line in doc.lines:
            state = option_line_state(line)
            if state is None:
                continue
            baseline = self._baseline_lines.get(state.line_id)
            if not self._state_changed(state, baseline):
                continue
            if state.disabled:
                raise ValueError(
                    "仅修改规则片段无法安全表达禁用参数："
                    f"[{state.section}] {state.key}。请启用该参数，或选择“全部规则”。"
                )
            actual = state.section
            folded = actual.casefold()
            existing = next((name for name in section_order if name.casefold() == folded), None)
            if existing is None:
                section_order.append(actual)
                existing = actual
            changed_by_section.setdefault(existing, []).append(state)

        newline = doc.newline
        parts: list[str] = []
        for section in section_order:
            states = changed_by_section.get(section, [])
            if not states:
                continue
            parts.append(f"[{section}]")
            for state in states:
                parts.append(f"{state.key}={state.value}{state.suffix}")
            parts.append("")
        if not parts:
            return ""
        return newline.join(parts).rstrip() + newline

    def rpc_save_fragment(self, path: str) -> dict:
        target = Path(path)
        if not target.name:
            raise ValueError("No output path")
        target.parent.mkdir(parents=True, exist_ok=True)

        text = self._fragment_text()
        doc = self.workspace._doc()

        companion = None
        companion_root = target.parent
        if isinstance(self.workspace, MixRulesWorkspace):
            companion_root = self.workspace.source_root or target.parent
            companion = self.workspace._prepare_companion_csf(
                companion_root,
                self.workspace.source_rules_name,
            )

        target.write_bytes(text.encode(doc.encoding, errors="strict"))

        csf_path = None
        if companion is not None:
            csf_path, csf_document = companion
            csf_document.save(csf_path)
            self.workspace._pending_csf.clear()
            self.workspace._reset_companion_context(
                companion_root,
                self.workspace.source_rules_name,
            )

        return {
            "path": str(target),
            "dirty": False,
            "mode": "fragment",
            "csf_path": str(csf_path) if csf_path else None,
        }
