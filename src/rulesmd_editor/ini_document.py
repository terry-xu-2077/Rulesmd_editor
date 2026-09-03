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

    def render(self) -> str:
        if self.kind == "key" and self.key is not None and self.value is not None:
            return f"{self.prefix}{self.key}{self.separator}{self.value}{self.suffix}"
        return self.raw


def _split_inline_comment(value: str) -> tuple[str, str]:
    # Westwood INIs commonly use ';' as an inline comment. Keep it losslessly.
    # We deliberately do not treat '#' as inline comment because it is used by some mods.
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
    """Lossless Westwood/Ares INI document.

    The editor must not normalize a rulesmd.ini through ConfigParser: real mods can
    contain duplicate keys, unknown Ares tags, comments in meaningful locations and
    hand-maintained ordering. This model edits only the touched lines.
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

    @classmethod
    def from_text(cls, text: str, *, encoding: str = "utf-8") -> "IniDocument":
        newline = "\r\n" if "\r\n" in text else "\n"
        final_newline = text.endswith(("\r\n", "\n", "\r"))
        raw_lines = text.splitlines()
        lines: list[IniLine] = []
        current: str | None = None
        for raw in raw_lines:
            sm = SECTION_RE.match(raw)
            if sm:
                current = sm.group(1).strip()
                lines.append(IniLine(raw=raw, kind="section", section=current))
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
                    )
                )
            elif not raw.strip():
                lines.append(IniLine(raw=raw, kind="blank", section=current))
            elif raw.lstrip().startswith((";", "#")):
                lines.append(IniLine(raw=raw, kind="comment", section=current))
            else:
                lines.append(IniLine(raw=raw, kind="raw", section=current))
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
        target.write_bytes(self.to_text().encode(self.encoding, errors="replace"))
        self.path = target
        self.dirty = False
        return target

    def sections(self) -> list[str]:
        out: list[str] = []
        seen = set()
        for line in self.lines:
            if line.kind == "section" and line.section and line.section not in seen:
                out.append(line.section)
                seen.add(line.section)
        return out

    def has_section(self, section: str) -> bool:
        return section in self.sections()

    def items(self, section: str) -> list[tuple[str, str]]:
        return [(l.key or "", l.value or "") for l in self.lines if l.kind == "key" and l.section == section]

    def get(self, section: str, key: str, default: str = "") -> str:
        result = default
        k = key.casefold()
        for line in self.lines:
            if line.kind == "key" and line.section == section and (line.key or "").casefold() == k:
                result = line.value or ""
        return result

    def has_option(self, section: str, key: str) -> bool:
        k = key.casefold()
        return any(
            l.kind == "key" and l.section == section and (l.key or "").casefold() == k
            for l in self.lines
        )

    def _section_bounds(self, section: str) -> tuple[int, int] | None:
        start = None
        for i, line in enumerate(self.lines):
            if line.kind == "section":
                if start is not None:
                    return start, i
                if line.section == section:
                    start = i
        return (start, len(self.lines)) if start is not None else None

    def add_section(self, section: str) -> None:
        if self.has_section(section):
            return
        if self.lines and self.lines[-1].kind != "blank":
            self.lines.append(IniLine("", "blank"))
        self.lines.append(IniLine(f"[{section}]", "section", section=section))
        self.final_newline = True
        self.dirty = True

    def remove_section(self, section: str) -> None:
        bounds = self._section_bounds(section)
        if not bounds:
            return
        del self.lines[bounds[0] : bounds[1]]
        self.dirty = True

    def set(self, section: str, key: str, value: str) -> None:
        if not self.has_section(section):
            self.add_section(section)
        k = key.casefold()
        found = None
        for line in self.lines:
            if line.kind == "key" and line.section == section and (line.key or "").casefold() == k:
                found = line
        if found is not None:
            found.value = str(value)
            self.dirty = True
            return
        bounds = self._section_bounds(section)
        assert bounds
        insert = bounds[1]
        while insert > bounds[0] + 1 and self.lines[insert - 1].kind == "blank":
            insert -= 1
        self.lines.insert(
            insert,
            IniLine(raw="", kind="key", section=section, key=key, value=str(value)),
        )
        self.dirty = True

    def remove_option(self, section: str, key: str) -> None:
        k = key.casefold()
        old = len(self.lines)
        self.lines = [
            l
            for l in self.lines
            if not (l.kind == "key" and l.section == section and (l.key or "").casefold() == k)
        ]
        self.dirty |= len(self.lines) != old

    def clone_section_text(self, section: str) -> str:
        bounds = self._section_bounds(section)
        if not bounds:
            return ""
        return self.newline.join(self.lines[i].render() for i in range(*bounds)) + self.newline

    def references_to(self, value: str) -> list[tuple[str, str]]:
        result = []
        needle = value.casefold()
        for line in self.lines:
            if line.kind != "key" or not line.section or not line.key:
                continue
            tokens = [x.strip().casefold() for x in (line.value or "").split(",")]
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
    result: dict[str, list[tuple[str, str]]] = {v: [] for v in ROOT_TYPES.values()}
    registered = set(ROOT_TYPES)
    for root, label in ROOT_TYPES.items():
        for reg_id, section in doc.items(root):
            if doc.has_section(section):
                result[label].append((section, reg_id))
                registered.add(section)

    # Legacy editor identified these by characteristic tags. Keep that behavior but
    # make it tolerant enough for Ares/custom tags.
    result["武器"] = []
    result["弹头"] = []
    result["弹体"] = []
    result["其他"] = []
    for sec in doc.sections():
        if sec in registered:
            continue
        keys = {k.casefold() for k, _ in doc.items(sec)}
        if "warhead" in keys and ("damage" in keys or "projectile" in keys or "speed" in keys):
            result["武器"].append((sec, ""))
        elif "verses" in keys or ("cellspread" in keys and "percentatmax" in keys):
            result["弹头"].append((sec, ""))
        elif "image" in keys and ("arcing" in keys or "inviso" in keys or "rot" in keys):
            result["弹体"].append((sec, ""))
        else:
            result["其他"].append((sec, ""))
    return result
