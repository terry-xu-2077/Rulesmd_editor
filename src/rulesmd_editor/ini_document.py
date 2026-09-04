from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re

SECTION_RE = re.compile(r"^\s*\[([^]]+)]\s*(?:;.*)?$")
KEY_RE = re.compile(r"^(\s*)([^;#][^=]*?)(\s*=\s*)(.*)$")


@dataclass
class IniLine:
    raw: str
    kind: str = "raw"
    section: str | None = None
    key: str | None = None
    value: str | None = None
    prefix: str = ""
    separator: str = "="
    suffix: str = ""
    line_id: int = -1

    def render(self) -> str:
        if self.kind == "key" and self.key is not None and self.value is not None:
            return f"{self.prefix}{self.key}{self.separator}{self.value}{self.suffix}"
        return self.raw


def _split_inline_comment(value: str) -> tuple[str, str]:
    quote = None
    for i, ch in enumerate(value):
        if ch in ('\"', "'"):
            quote = None if quote == ch else ch if quote is None else quote
        elif ch == ";" and quote is None:
            left = value[:i].rstrip()
            spacing = value[len(left):i]
            return left, spacing + value[i:]
    return value.rstrip(), value[len(value.rstrip()):]


class IniDocument:
    """Lossless Westwood/Ares INI document with structural lookup indexes.

    The file remains line-oriented and lossless, but section, line-id and section-bound
    lookups are cached. This avoids repeatedly scanning a large rulesmd.ini while the
    workspace builds its initial category/index model.
    """

    def __init__(
        self,
        lines: list[IniLine] | None = None,
        *,
        encoding: str = "utf-8",
        newline: str = "\n",
        final_newline: bool = True,
    ):
        self.lines = lines or []
        self.encoding = encoding
        self.newline = newline
        self.final_newline = final_newline
        self.path: Path | None = None
        self.dirty = False
        self._next_line_id = 0
        for line in self.lines:
            if line.line_id < 0:
                line.line_id = self._next_line_id
            self._next_line_id = max(self._next_line_id, line.line_id + 1)
        self._section_lookup: dict[str, str] = {}
        self._section_order: list[str] = []
        self._section_lines_index: dict[str, list[IniLine]] = {}
        self._section_bounds_index: dict[str, tuple[int, int]] = {}
        self._line_lookup: dict[int, IniLine] = {}
        self._reindex_structure()

    def _reindex_structure(self) -> None:
        self._section_lookup = {}
        self._section_order = []
        self._section_lines_index = {}
        self._section_bounds_index = {}
        self._line_lookup = {line.line_id: line for line in self.lines}

        section_positions: list[tuple[int, str]] = []
        for index, line in enumerate(self.lines):
            if line.section:
                self._section_lines_index.setdefault(line.section, []).append(line)
            if line.kind == "section" and line.section:
                folded = line.section.casefold()
                if folded not in self._section_lookup:
                    self._section_lookup[folded] = line.section
                    self._section_order.append(line.section)
                    section_positions.append((index, line.section))

        for pos, (start, section) in enumerate(section_positions):
            end = section_positions[pos + 1][0] if pos + 1 < len(section_positions) else len(self.lines)
            self._section_bounds_index[section] = (start, end)

    def _new_line(self, *args, **kwargs) -> IniLine:
        line = IniLine(*args, **kwargs, line_id=self._next_line_id)
        self._next_line_id += 1
        return line

    @classmethod
    def from_text(cls, text: str, *, encoding: str = "utf-8") -> "IniDocument":
        newline = "\r\n" if "\r\n" in text else "\n"
        final_newline = text.endswith(("\r\n", "\n", "\r"))
        raw_lines = text.splitlines()
        lines: list[IniLine] = []
        current: str | None = None
        for line_id, raw in enumerate(raw_lines):
            sm = SECTION_RE.match(raw)
            if sm:
                current = sm.group(1).strip()
                lines.append(IniLine(raw=raw, kind="section", section=current, line_id=line_id))
                continue
            km = KEY_RE.match(raw)
            if current is not None and km:
                prefix, key, sep, tail = km.groups()
                value, suffix = _split_inline_comment(tail)
                lines.append(
                    IniLine(
                        raw=raw,
                        kind="key",
                        section=current,
                        key=key.strip(),
                        value=value,
                        prefix=prefix,
                        separator=sep,
                        suffix=suffix,
                        line_id=line_id,
                    )
                )
            elif not raw.strip():
                lines.append(IniLine(raw=raw, kind="blank", section=current, line_id=line_id))
            elif raw.lstrip().startswith((";", "#")):
                lines.append(IniLine(raw=raw, kind="comment", section=current, line_id=line_id))
            else:
                lines.append(IniLine(raw=raw, kind="raw", section=current, line_id=line_id))
        return cls(lines, encoding=encoding, newline=newline, final_newline=final_newline)

    @classmethod
    def load(cls, path: str | Path) -> "IniDocument":
        path = Path(path)
        data = path.read_bytes()
        candidates = []
        if data.startswith(b"\xef\xbb\xbf"):
            candidates.append("utf-8-sig")
        if data.startswith((b"\xff\xfe", b"\xfe\xff")):
            candidates.append("utf-16")
        candidates += ["utf-8", "gb18030", "cp1252"]
        last_error = None
        for enc in candidates:
            try:
                doc = cls.from_text(data.decode(enc), encoding=enc)
                doc.path = path
                return doc
            except UnicodeDecodeError as exc:
                last_error = exc
        raise last_error or UnicodeDecodeError("utf-8", b"", 0, 1, "cannot decode")

    @classmethod
    def new(cls) -> "IniDocument":
        return cls.from_text("[General]\nName=New Yuri's Revenge Mod\n")

    def to_text(self) -> str:
        text = self.newline.join(line.render() for line in self.lines)
        if self.lines and self.final_newline:
            text += self.newline
        return text

    def save(self, path: str | Path | None = None) -> Path:
        target = Path(path) if path else self.path
        if target is None:
            raise ValueError("No output path")
        target.write_bytes(self.to_text().encode(self.encoding, errors="strict"))
        self.path = target
        self.dirty = False
        return target

    def _section_name(self, section: str) -> str | None:
        return self._section_lookup.get(section.casefold())

    def sections(self) -> list[str]:
        return list(self._section_order)

    def has_section(self, section: str) -> bool:
        return section.casefold() in self._section_lookup

    def line(self, line_id: int) -> IniLine | None:
        return self._line_lookup.get(line_id)

    def section_lines(self, section: str, *, keys_only: bool = False) -> list[IniLine]:
        actual = self._section_name(section)
        if actual is None:
            return []
        rows = self._section_lines_index.get(actual, ())
        if keys_only:
            return [line for line in rows if line.kind == "key"]
        return list(rows)

    def items(self, section: str) -> list[tuple[str, str]]:
        return [(line.key or "", line.value or "") for line in self.section_lines(section, keys_only=True)]

    def items_with_ids(self, section: str) -> list[tuple[int, str, str]]:
        return [(line.line_id, line.key or "", line.value or "") for line in self.section_lines(section, keys_only=True)]

    def get(self, section: str, key: str, default: str = "") -> str:
        result = default
        folded = key.casefold()
        for line in self.section_lines(section, keys_only=True):
            if (line.key or "").casefold() == folded:
                result = line.value or ""
        return result

    def has_option(self, section: str, key: str) -> bool:
        folded = key.casefold()
        return any((line.key or "").casefold() == folded for line in self.section_lines(section, keys_only=True))

    def _section_bounds(self, section: str) -> tuple[int, int] | None:
        actual = self._section_name(section)
        return self._section_bounds_index.get(actual) if actual else None

    def add_section(self, section: str) -> None:
        if self.has_section(section):
            return
        if self.lines and self.lines[-1].kind != "blank":
            self.lines.append(self._new_line("", "blank"))
        self.lines.append(self._new_line(f"[{section}]", "section", section=section))
        self.final_newline = True
        self.dirty = True
        self._reindex_structure()

    def remove_section(self, section: str) -> None:
        bounds = self._section_bounds(section)
        if not bounds:
            return
        del self.lines[bounds[0] : bounds[1]]
        self.dirty = True
        self._reindex_structure()

    def set_line_value(self, line_id: int, value: str) -> None:
        line = self.line(line_id)
        if line is None or line.kind != "key":
            raise KeyError(f"No editable INI key line with id {line_id}")
        line.value = str(value)
        self.dirty = True

    def remove_line(self, line_id: int) -> None:
        line = self._line_lookup.get(line_id)
        if line is None:
            raise KeyError(f"No INI line with id {line_id}")
        self.lines.remove(line)
        self.dirty = True
        self._reindex_structure()

    def set(self, section: str, key: str, value: str) -> int:
        actual = self._section_name(section)
        if actual is None:
            self.add_section(section)
            actual = section
        folded = key.casefold()
        found: IniLine | None = None
        for line in self.section_lines(actual, keys_only=True):
            if (line.key or "").casefold() == folded:
                found = line
        if found is not None:
            found.value = str(value)
            self.dirty = True
            return found.line_id
        bounds = self._section_bounds(actual)
        assert bounds
        insert = bounds[1]
        while insert > bounds[0] + 1 and self.lines[insert - 1].kind == "blank":
            insert -= 1
        line = self._new_line(raw="", kind="key", section=actual, key=key, value=str(value))
        self.lines.insert(insert, line)
        self.dirty = True
        self._reindex_structure()
        return line.line_id

    def remove_option(self, section: str, key: str, *, occurrence: str = "all") -> None:
        matches = [
            line for line in self.section_lines(section, keys_only=True)
            if (line.key or "").casefold() == key.casefold()
        ]
        if not matches:
            return
        if occurrence == "last":
            self.remove_line(matches[-1].line_id)
        elif occurrence == "first":
            self.remove_line(matches[0].line_id)
        elif occurrence == "all":
            ids = {line.line_id for line in matches}
            self.lines = [line for line in self.lines if line.line_id not in ids]
            self.dirty = True
            self._reindex_structure()
        else:
            raise ValueError("occurrence must be 'first', 'last', or 'all'")

    def clone_section_text(self, section: str) -> str:
        bounds = self._section_bounds(section)
        if not bounds:
            return ""
        return self.newline.join(self.lines[index].render() for index in range(*bounds)) + self.newline

    def references_to(self, value: str) -> list[tuple[str, str]]:
        result: list[tuple[str, str]] = []
        needle = value.casefold()
        for line in self.lines:
            if line.kind != "key" or not line.section or not line.key:
                continue
            tokens = [item.strip().casefold() for item in (line.value or "").split(",")]
            if needle in tokens:
                result.append((line.section, line.key))
        return result


ROOT_TYPES = {
    "InfantryTypes": "步兵",
    "VehicleTypes": "载具",
    "AircraftTypes": "飞机",
    "BuildingTypes": "建筑",
    "SuperWeaponTypes": "超级武器",
}


def categorized_sections(doc: IniDocument) -> dict[str, list[tuple[str, str]]]:
    """Classify sections using the document indexes instead of repeated full scans."""
    result: dict[str, list[tuple[str, str]]] = {label: [] for label in ROOT_TYPES.values()}
    registered = {name.casefold() for name in ROOT_TYPES}
    for root, label in ROOT_TYPES.items():
        for reg_id, section in doc.items(root):
            actual = doc._section_name(section)
            if actual:
                result[label].append((actual, reg_id))
                registered.add(actual.casefold())

    result["武器"] = []
    result["弹头"] = []
    result["弹体"] = []
    result["其他"] = []
    for section in doc.sections():
        if section.casefold() in registered:
            continue
        keys = {(line.key or "").casefold() for line in doc.section_lines(section, keys_only=True)}
        if "warhead" in keys and ("damage" in keys or "projectile" in keys or "speed" in keys):
            result["武器"].append((section, ""))
        elif "verses" in keys or ("cellspread" in keys and "percentatmax" in keys):
            result["弹头"].append((section, ""))
        elif "image" in keys and ("arcing" in keys or "inviso" in keys or "rot" in keys):
            result["弹体"].append((section, ""))
        else:
            result["其他"].append((section, ""))
    return result
