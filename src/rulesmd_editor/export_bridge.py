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

    def rpc_ping(self, unicode: str | None = None) -> dict[str, str]:
        result = super().rpc_ping()
        if unicode is not None:
            result["unicode"] = unicode
        return result

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

        # “删除参数”仍是纯编辑调试操作：覆盖型 INI 无法表达从基础 Rules
        # 中真正移除一个 Key，因此删除的基础参数不进入规则片段。
        # “停用参数”则保留编辑器自己的 ;@rulesmd-disabled 注释标记，
        # 这样它不会影响游戏运行时规则，但下次重新打开片段时仍可恢复。
        changed_by_section: dict[str, list[OptionLineState]] = {}
        section_order: list[str] = []
        for line in doc.lines:
            state = option_line_state(line)
            if state is None:
                continue
            baseline = self._baseline_lines.get(state.line_id)
            if not self._state_changed(state, baseline):
                continue
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
                if state.disabled:
                    parts.append(
                        f";@rulesmd-disabled {state.key}{state.separator}{state.value}{state.suffix}"
                    )
                else:
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
