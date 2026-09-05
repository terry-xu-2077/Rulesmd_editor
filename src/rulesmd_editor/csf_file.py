from __future__ import annotations

from dataclasses import dataclass, field
import os
from pathlib import Path
import struct

_CSF_MAGIC = b" FSC"
_LABEL_MAGIC = b" LBL"
_STRING_MAGIC = b" RTS"
_WSTRING_MAGIC = b"WRTS"


class CsfFormatError(ValueError):
    pass


@dataclass
class CsfString:
    value: str
    extra: str | None = None


@dataclass
class CsfLabel:
    name: str
    strings: list[CsfString] = field(default_factory=list)


class CsfDocument:
    """Read and write Red Alert 2 / Yuri's Revenge CSF string tables.

    CSF text is UTF-16LE with every byte bitwise inverted. Label matching is
    case-insensitive and, like the game, duplicate labels resolve to the last label.
    """

    def __init__(
        self,
        labels: list[CsfLabel] | None = None,
        *,
        version: int = 3,
        language: int = 0,
        unused: int = 0,
    ):
        self.labels = labels or []
        self.version = version
        self.language = language
        self.unused = unused
        self.path: Path | None = None

    @classmethod
    def new(cls, *, language: int = 0) -> "CsfDocument":
        return cls(version=3, language=language)

    @classmethod
    def load(cls, path: str | Path) -> "CsfDocument":
        source = Path(path)
        document = cls.from_bytes(source.read_bytes())
        document.path = source
        return document

    @classmethod
    def from_bytes(cls, data: bytes) -> "CsfDocument":
        if len(data) < 24:
            raise CsfFormatError("CSF 文件头不完整")
        if data[:4] != _CSF_MAGIC:
            raise CsfFormatError("不是有效的 CSF 文件")

        version, label_count, string_count, unused, language = struct.unpack_from("<IIIII", data, 4)
        if version not in {2, 3}:
            raise CsfFormatError(f"不支持的 CSF 版本：{version}")

        offset = 24
        labels: list[CsfLabel] = []
        parsed_strings = 0
        for _ in range(label_count):
            if offset + 12 > len(data) or data[offset : offset + 4] != _LABEL_MAGIC:
                raise CsfFormatError("CSF Label 数据损坏")
            pair_count, name_length = struct.unpack_from("<II", data, offset + 4)
            offset += 12
            if offset + name_length > len(data):
                raise CsfFormatError("CSF Label 名称越界")
            try:
                name = data[offset : offset + name_length].decode("cp1252")
            except UnicodeDecodeError as exc:
                raise CsfFormatError("CSF Label 名称编码无效") from exc
            offset += name_length

            strings: list[CsfString] = []
            for _ in range(pair_count):
                if offset + 8 > len(data):
                    raise CsfFormatError("CSF 字符串数据不完整")
                marker = data[offset : offset + 4]
                if marker not in {_STRING_MAGIC, _WSTRING_MAGIC}:
                    raise CsfFormatError("CSF 字符串标记无效")
                char_count = struct.unpack_from("<I", data, offset + 4)[0]
                offset += 8
                byte_count = char_count * 2
                if offset + byte_count > len(data):
                    raise CsfFormatError("CSF Unicode 字符串越界")
                encoded = data[offset : offset + byte_count]
                offset += byte_count
                decoded = bytes(byte ^ 0xFF for byte in encoded)
                try:
                    value = decoded.decode("utf-16le")
                except UnicodeDecodeError as exc:
                    raise CsfFormatError("CSF Unicode 字符串编码无效") from exc

                extra: str | None = None
                if marker == _WSTRING_MAGIC:
                    if offset + 4 > len(data):
                        raise CsfFormatError("CSF ExtraValue 长度缺失")
                    extra_length = struct.unpack_from("<I", data, offset)[0]
                    offset += 4
                    if offset + extra_length > len(data):
                        raise CsfFormatError("CSF ExtraValue 越界")
                    try:
                        extra = data[offset : offset + extra_length].decode("cp1252")
                    except UnicodeDecodeError as exc:
                        raise CsfFormatError("CSF ExtraValue 编码无效") from exc
                    offset += extra_length

                strings.append(CsfString(value=value, extra=extra))
                parsed_strings += 1
            labels.append(CsfLabel(name=name, strings=strings))

        if parsed_strings != string_count:
            raise CsfFormatError(
                f"CSF 字符串数量不一致：Header={string_count}，实际={parsed_strings}"
            )
        return cls(labels, version=version, language=language, unused=unused)

    def get(self, label: str) -> str | None:
        folded = label.casefold()
        for item in reversed(self.labels):
            if item.name.casefold() == folded:
                return item.strings[0].value if item.strings else ""
        return None

    def set(self, label: str, value: str, *, extra: str | None = None) -> None:
        folded = label.casefold()
        for item in reversed(self.labels):
            if item.name.casefold() != folded:
                continue
            if item.strings:
                item.strings[0] = CsfString(value=value, extra=extra)
            else:
                item.strings.append(CsfString(value=value, extra=extra))
            return
        self.labels.append(CsfLabel(name=label, strings=[CsfString(value=value, extra=extra)]))

    def to_bytes(self) -> bytes:
        string_count = sum(len(label.strings) for label in self.labels)
        output = bytearray(
            _CSF_MAGIC
            + struct.pack(
                "<IIIII",
                self.version,
                len(self.labels),
                string_count,
                self.unused,
                self.language,
            )
        )

        for label in self.labels:
            try:
                name = label.name.encode("cp1252")
            except UnicodeEncodeError as exc:
                raise CsfFormatError(
                    f"CSF Label 只能使用单字节名称：{label.name}"
                ) from exc
            output.extend(_LABEL_MAGIC)
            output.extend(struct.pack("<II", len(label.strings), len(name)))
            output.extend(name)

            for item in label.strings:
                marker = _WSTRING_MAGIC if item.extra is not None else _STRING_MAGIC
                raw = item.value.encode("utf-16le")
                output.extend(marker)
                output.extend(struct.pack("<I", len(raw) // 2))
                output.extend(bytes(byte ^ 0xFF for byte in raw))
                if item.extra is not None:
                    try:
                        extra = item.extra.encode("cp1252")
                    except UnicodeEncodeError as exc:
                        raise CsfFormatError("CSF ExtraValue 必须是单字节文本") from exc
                    output.extend(struct.pack("<I", len(extra)))
                    output.extend(extra)
        return bytes(output)

    def save(self, path: str | Path | None = None) -> Path:
        target = Path(path) if path else self.path
        if target is None:
            raise ValueError("No output path")
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + ".tmp")
        temporary.write_bytes(self.to_bytes())
        os.replace(temporary, target)
        self.path = target
        return target
