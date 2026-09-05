from __future__ import annotations

from dataclasses import dataclass
import re

from .ini_document import IniDocument, IniLine


_DISABLED_RE = re.compile(r"^(\s*);@rulesmd-disabled\s+([^=]+?)(\s*=\s*)(.*)$")


@dataclass(frozen=True)
class OptionLineState:
    line_id: int
    section: str
    key: str
    value: str
    prefix: str
    separator: str
    suffix: str
    disabled: bool


def _split_inline_comment(value: str) -> tuple[str, str]:
    quote = None
    for index, char in enumerate(value):
        if char in ('\"', "'"):
            quote = None if quote == char else char if quote is None else quote
        elif char == ";" and quote is None:
            left = value[:index].rstrip()
            spacing = value[len(left):index]
            return left, spacing + value[index:]
    stripped = value.rstrip()
    return stripped, value[len(stripped):]


def option_line_state(line: IniLine) -> OptionLineState | None:
    if not line.section:
        return None
    if line.kind == "key" and line.key is not None:
        return OptionLineState(
            line_id=line.line_id,
            section=line.section,
            key=line.key,
            value=line.value or "",
            prefix=line.prefix,
            separator=line.separator,
            suffix=line.suffix,
            disabled=False,
        )
    if line.kind != "comment":
        return None
    match = _DISABLED_RE.match(line.raw)
    if not match:
        return None
    prefix, key, separator, tail = match.groups()
    value, suffix = _split_inline_comment(tail)
    return OptionLineState(
        line_id=line.line_id,
        section=line.section,
        key=key.strip(),
        value=value,
        prefix=prefix,
        separator=separator,
        suffix=suffix,
        disabled=True,
    )


def section_option_states(doc: IniDocument, section: str) -> list[OptionLineState]:
    return [
        state
        for line in doc.section_lines(section)
        if (state := option_line_state(line)) is not None
    ]


def all_option_keys(doc: IniDocument, section: str) -> set[str]:
    return {state.key.casefold() for state in section_option_states(doc, section)}


def apply_option_state(doc: IniDocument, line_id: int, state: OptionLineState) -> None:
    line = doc.line(line_id)
    if line is None:
        raise KeyError(f"Unknown line id: {line_id}")
    if state.disabled:
        line.raw = (
            f"{state.prefix};@rulesmd-disabled "
            f"{state.key}{state.separator}{state.value}{state.suffix}"
        )
        line.kind = "comment"
        line.section = state.section
        line.key = None
        line.value = None
        line.prefix = ""
        line.separator = "="
        line.suffix = ""
    else:
        line.raw = ""
        line.kind = "key"
        line.section = state.section
        line.key = state.key
        line.value = state.value
        line.prefix = state.prefix
        line.separator = state.separator
        line.suffix = state.suffix
    doc.dirty = True
    doc._reindex_structure()


def set_line_disabled(doc: IniDocument, line_id: int, disabled: bool) -> OptionLineState:
    line = doc.line(line_id)
    if line is None:
        raise KeyError(f"Unknown line id: {line_id}")
    current = option_line_state(line)
    if current is None:
        raise ValueError("The selected line is not an editable parameter")
    if current.disabled == disabled:
        return current
    next_state = OptionLineState(
        line_id=current.line_id,
        section=current.section,
        key=current.key,
        value=current.value,
        prefix=current.prefix,
        separator=current.separator,
        suffix=current.suffix,
        disabled=disabled,
    )
    apply_option_state(doc, line_id, next_state)
    return next_state
