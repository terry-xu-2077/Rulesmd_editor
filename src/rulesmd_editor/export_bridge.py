from __future__ import annotations

from pathlib import Path
import re

from .bridge import Bridge
from .line_actions import OptionLineState, option_line_state
from .mix_workspace import MixRulesWorkspace
from .user_data import (
    load_app_config,
    load_user_descriptions,
    load_user_section_names,
    save_app_config,
    set_user_description,
    set_user_section_name,
)

_SECTION_NAME_MARKER_RE = re.compile(r"^\s*[;#]\s*@rulesmd-name\s*=\s*(.*?)\s*$", re.IGNORECASE)
_SECTION_NAME_MARKER_PREFIX = ";@rulesmd-name="


class ExportMixRulesWorkspace(MixRulesWorkspace):
    """MIX-aware workspace that keeps archives as read-only baselines.

    A MIX import intentionally has no writable document path. The first Save therefore
    has to choose an output mode/path instead of silently writing a full loose rules file
    next to the archive.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._user_section_names = {
            key.casefold(): value
            for key, value in load_user_section_names().items()
        }

    def _editor_name_from_ini(self, section: str) -> str:
        if self.document is None:
            return ""
        result = ""
        for line in self._doc().section_lines(section):
            if line.kind != "comment":
                continue
            match = _SECTION_NAME_MARKER_RE.match(line.raw)
            if match:
                result = match.group(1).strip()
        return result

    def _editor_section_name(self, section: str) -> str:
        return (
            self._editor_name_from_ini(section)
            or self._user_section_names.get(section.casefold(), "").strip()
        )

    def _section_label(self, section: str) -> str:
        edited = self._editor_section_name(section)
        return edited or super()._section_label(section)

    def _source_display_name(self, section: str) -> str:
        edited = self._editor_section_name(section)
        return edited or super()._source_display_name(section)

    def set_section_display_name(self, section: str, value: str) -> dict:
        doc = self._doc()
        actual = doc._section_name(section)
        if actual is None:
            raise KeyError(f"Unknown section: {section}")
        if actual.casefold() == "general":
            raise ValueError("全局规则名称不可修改")

        before_name = self._section_label(actual)

        requested = value.strip()
        if "\r" in requested or "\n" in requested:
            raise ValueError("中文名必须是单行文本")
        if len(requested) > 120:
            raise ValueError("中文名不能超过 120 个字符")

        # Typing the built-in/fallback name means “restore default”. This prevents
        # needless user metadata while still allowing any genuinely custom label.
        fallback = super()._section_label(actual).strip()
        clean = "" if requested == fallback else requested

        marker_rows = [
            line
            for line in doc.section_lines(actual)
            if line.kind == "comment" and _SECTION_NAME_MARKER_RE.match(line.raw)
        ]
        changed = False

        if clean:
            marker = f"{_SECTION_NAME_MARKER_PREFIX}{clean}"
            if marker_rows:
                keep = marker_rows[-1]
                if keep.raw != marker:
                    keep.raw = marker
                    changed = True
                duplicate_ids = {line.line_id for line in marker_rows[:-1]}
                if duplicate_ids:
                    doc.lines = [line for line in doc.lines if line.line_id not in duplicate_ids]
                    doc._reindex_structure()
                    changed = True
            else:
                bounds = doc._section_bounds(actual)
                if bounds is None:
                    raise KeyError(f"Unknown section: {section}")
                doc.lines.insert(
                    bounds[0] + 1,
                    doc._new_line(raw=marker, kind="comment", section=actual),
                )
                doc._reindex_structure()
                changed = True
        elif marker_rows:
            marker_ids = {line.line_id for line in marker_rows}
            doc.lines = [line for line in doc.lines if line.line_id not in marker_ids]
            doc._reindex_structure()
            changed = True

        if changed:
            doc.dirty = True

        stored = set_user_section_name(actual, clean)
        self._user_section_names = {
            key.casefold(): stored_value
            for key, stored_value in stored.items()
        }
        self._dynamic_cache.clear()

        name = self._section_label(actual)
        return {
            "section": actual,
            "name": name,
            "custom": bool(clean),
            "changed": changed,
            "label_changed": name != before_name,
        }

    def open_file(self, path: str | Path) -> dict:
        source = Path(path)
        result = super().open_file(source)
        if source.suffix.casefold() == ".mix":
            self._doc().path = None
            result = self.snapshot()
        return result


class ExportBridge(Bridge):
    """Bridge extensions for export plus editable resource-side user data."""

    def rpc_ping(self, unicode: str | None = None) -> dict[str, str]:
        result = super().rpc_ping()
        if unicode is not None:
            result["unicode"] = unicode
        return result

    def rpc_get_app_config(self) -> dict:
        return load_app_config()

    def rpc_set_app_config(self, values: dict | None = None) -> dict:
        if values is None:
            values = {}
        if not isinstance(values, dict):
            raise ValueError("应用配置必须是对象")
        return save_app_config(values)

    def rpc_get_user_descriptions(self) -> dict[str, str]:
        return load_user_descriptions()

    def rpc_set_user_description(self, key: str, value: str) -> dict[str, str]:
        return set_user_description(key, value)

    def rpc_set_section_display_name(self, section: str, value: str) -> dict:
        if not isinstance(self.workspace, ExportMixRulesWorkspace):
            raise RuntimeError("当前工作区不支持自定义单位中文名")

        was_dirty = self.workspace.info().dirty
        result = self.workspace.set_section_display_name(section, value)
        self._sync_structural_dirty()

        # The frontend may route this through the normal Save button when the document
        # was clean. That keeps React's snapshot/cache in sync without committing any
        # unrelated pending rule edits. Raw-mode drafts are checked on the frontend.
        doc = self.workspace._doc()
        result.update({
            "dirty": self.workspace.info().dirty,
            "auto_save_safe": bool(result["label_changed"] and not was_dirty and doc.path is not None),
            "snapshot": self.workspace.snapshot(),
        })
        return result

    def rpc_set_settings(self, ares_enabled: bool | None = None) -> dict:
        result = super().rpc_set_settings(ares_enabled=ares_enabled)
        if ares_enabled is not None:
            save_app_config({"aresEnabled": bool(ares_enabled)})
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
