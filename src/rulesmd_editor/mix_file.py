from __future__ import annotations

from dataclasses import dataclass
import base64
from pathlib import Path
import struct
import zlib

MIX_ENCRYPTED = 0x00020000
_RULES_CANDIDATES = ("rulesmd.ini", "localmd.mix/rulesmd.ini")
_WESTWOOD_PUBLIC_KEY = "AihRvNoIbTn85FZRYNZRcT+i6KpU+maCsEqr3Q5q+LDB5tH7Tz2qQ38V"


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
    length = len(name)
    aligned = length & ~3
    remainder = length & 3
    if remainder:
        name += chr(length - aligned)
        fill = 3 - remainder
        if fill:
            name += name[aligned] * fill
    return zlib.crc32(name.encode("cp1252")) & 0xFFFFFFFF


def _westwood_blowfish_key(source: bytes) -> bytes:
    decoded = base64.b64decode(_WESTWOOD_PUBLIC_KEY)
    if len(decoded) < 3 or decoded[0] != 0x02:
        raise MixFormatError("Westwood MIX public key is invalid")
    length_byte = decoded[1]
    if length_byte & 0x80:
        count = length_byte & 0x7F
        if len(decoded) < 2 + count:
            raise MixFormatError("Westwood MIX public key length is invalid")
        key_length = int.from_bytes(decoded[2 : 2 + count], "big")
        start = 2 + count
    else:
        key_length = length_byte
        start = 2
    modulus_bytes = decoded[start : start + key_length]
    if len(modulus_bytes) != key_length:
        raise MixFormatError("Westwood MIX public key data is incomplete")
    modulus = int.from_bytes(modulus_bytes, "big")
    public_len = modulus.bit_length() - 1
    chunk_size = (public_len - 1) // 8 + 1
    output_size = chunk_size - 1
    predata_len = (55 // output_size + 1) * chunk_size
    if len(source) < predata_len:
        raise MixFormatError("Encrypted MIX key block is incomplete")

    result = bytearray()
    for offset in range(0, predata_len, chunk_size):
        chunk = source[offset : offset + chunk_size]
        encrypted = int.from_bytes(chunk, "little")
        decrypted = pow(encrypted, 0x10001, modulus)
        result.extend(decrypted.to_bytes(chunk_size, "little")[:output_size])
    if len(result) < 56:
        raise MixFormatError("Encrypted MIX key could not be derived")
    return bytes(result[:56])


def _blowfish_decrypt(key: bytes, data: bytes) -> bytes:
    try:
        from Crypto.Cipher import Blowfish
    except ImportError as exc:  # pragma: no cover - dependency is installed by the package
        raise MixFormatError("无法读取加密 MIX：缺少 PyCryptodome 支持") from exc
    if len(data) % 8:
        raise MixFormatError("Encrypted MIX index is not block aligned")
    return Blowfish.new(key, Blowfish.MODE_ECB).decrypt(data)


class MixArchive:
    """Minimal RA2/YR MIX reader for locating known filenames by Westwood CRC id.

    The parser follows the MIX handling used by saralmira/ra2-AIwidgets, including
    encrypted headers and nested MIX paths, but is implemented independently in Python.
    """

    def __init__(self, data: bytes):
        self._data = data
        self.entries: dict[int, MixEntry] = {}
        self.body_offset = 0
        self.body_size = 0
        self.encrypted = False
        self._parse_header()

    @classmethod
    def from_path(cls, path: str | Path) -> "MixArchive":
        return cls(Path(path).read_bytes())

    def _parse_header(self) -> None:
        if len(self._data) < 10:
            raise MixFormatError("MIX 文件头不完整")
        flags = struct.unpack_from("<I", self._data, 0)[0]
        self.encrypted = bool(flags & MIX_ENCRYPTED)

        if self.encrypted:
            if len(self._data) < 92:
                raise MixFormatError("加密 MIX 文件头不完整")
            key = _westwood_blowfish_key(self._data[4:84])
            first = _blowfish_decrypt(key, self._data[84:92])
            file_count = struct.unpack_from("<H", first, 0)[0]
            self.body_size = struct.unpack_from("<i", first, 2)[0]
            if self.body_size < 0:
                raise MixFormatError("MIX 数据区大小无效")
            additional_blocks = ((6 + 12 * file_count + 7) // 8) - 1
            additional_size = additional_blocks * 8
            end = 92 + additional_size
            if end > len(self._data):
                raise MixFormatError("加密 MIX 索引不完整")
            index_data = first + _blowfish_decrypt(key, self._data[92:end])
            index_start = 6
            self.body_offset = end
        else:
            file_count = struct.unpack_from("<H", self._data, 4)[0]
            self.body_size = struct.unpack_from("<i", self._data, 6)[0]
            if self.body_size < 0:
                raise MixFormatError("MIX 数据区大小无效")
            index_start = 10
            index_end = index_start + file_count * 12
            if index_end > len(self._data):
                raise MixFormatError("MIX 索引不完整")
            index_data = self._data
            self.body_offset = index_end

        if self.body_offset + self.body_size > len(self._data):
            raise MixFormatError("MIX 数据区不完整")

        for index in range(file_count):
            pos = index_start + index * 12
            file_id, offset, size = struct.unpack_from("<Iii", index_data, pos)
            if offset < 0 or size < 0 or offset + size > self.body_size:
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
