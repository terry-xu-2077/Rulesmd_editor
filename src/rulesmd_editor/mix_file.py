from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import struct
import zlib

_RULES_CANDIDATES = ("rulesmd.ini", "localmd.mix/rulesmd.ini")


class MixFormatError(ValueError):
    pass


@dataclass(frozen=True)
class MixEntry:
    file_id: int
    offset: int
    size: int


def mix_file_id(filename: str) -> int:
    """Return the Westwood MIX filename id used by RA2/YR archives."""
    name = filename.replace("/", "\\").upper()
    remainder = len(name) & 3
    if remainder:
        aligned = len(name) & ~3
        name += chr(remainder)
        fill = 3 - remainder
        if fill:
            name += name[aligned] * fill
    return zlib.crc32(name.encode("cp1252")) & 0xFFFFFFFF


class MixArchive:
    """Reader for the unencrypted RA2/YR MIX format used by current CnCNet packages.

    Filename lookup follows the Westwood CRC algorithm used by ra2-AIwidgets and by
    CnCNet's own mix-packer. Nested MIX paths are supported for legacy localmd.mix
    layouts as well.
    """

    def __init__(self, data: bytes):
        self._data = data
        self.entries: dict[int, MixEntry] = {}
        self.body_offset = 0
        self.body_size = 0
        self._parse_header()

    @classmethod
    def from_path(cls, path: str | Path) -> "MixArchive":
        return cls(Path(path).read_bytes())

    def _parse_header(self) -> None:
        if len(self._data) < 10:
            raise MixFormatError("MIX 文件头不完整")

        flags = struct.unpack_from("<I", self._data, 0)[0]
        if flags != 0:
            raise MixFormatError("当前只支持 CnCNet 使用的未加密 MIX 格式")

        file_count = struct.unpack_from("<H", self._data, 4)[0]
        self.body_size = struct.unpack_from("<I", self._data, 6)[0]
        index_start = 10
        index_end = index_start + file_count * 12
        if index_end > len(self._data):
            raise MixFormatError("MIX 索引不完整")
        self.body_offset = index_end
        if self.body_offset + self.body_size > len(self._data):
            raise MixFormatError("MIX 数据区不完整")

        for index in range(file_count):
            pos = index_start + index * 12
            file_id, offset, size = struct.unpack_from("<III", self._data, pos)
            if offset + size > self.body_size:
                raise MixFormatError("MIX 文件条目范围无效")
            if file_id in self.entries:
                raise MixFormatError("MIX 包含重复文件 ID")
            self.entries[file_id] = MixEntry(file_id, offset, size)

    def read_file(self, filename: str) -> bytes | None:
        normalized = filename.replace("\\", "/")
        layer, separator, rest = normalized.partition("/")
        if separator:
            nested_bytes = self.read_file(layer)
            if nested_bytes is None:
                return None
            try:
                return MixArchive(nested_bytes).read_file(rest)
            except MixFormatError:
                return None

        entry = self.entries.get(mix_file_id(normalized))
        if entry is None:
            return None
        start = self.body_offset + entry.offset
        return self._data[start : start + entry.size]


def extract_rulesmd_bytes(path: str | Path) -> bytes:
    try:
        mix = MixArchive.from_path(path)
    except OSError:
        raise
    except MixFormatError as exc:
        raise ValueError(f"无法读取 MIX 文件：{exc}") from exc

    for candidate in _RULES_CANDIDATES:
        payload = mix.read_file(candidate)
        if payload is not None:
            return payload
    raise ValueError("这个 MIX 文件没有 rulesmd.ini")
