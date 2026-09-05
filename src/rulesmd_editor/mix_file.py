from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import base64
from decimal import Decimal, localcontext
import struct
import zlib

MIX_CHECKSUM = 0x00010000
MIX_ENCRYPTED = 0x00020000
_MIX_KNOWN_FLAGS = MIX_CHECKSUM | MIX_ENCRYPTED
_WESTWOOD_PUBLIC_KEY = "AihRvNoIbTn85FZRYNZRcT+i6KpU+maCsEqr3Q5q+LDB5tH7Tz2qQ38V"

# Blowfish's initial P/S words are the first 8336 hexadecimal fractional digits
# of pi. Generate them lazily with the standard-library Decimal implementation so
# encrypted original MIX support stays self-contained without shipping a crypto DLL.
_BLOWFISH_WORDS_CACHE: tuple[int, ...] | None = None


def _blowfish_initial_words() -> tuple[int, ...]:
    global _BLOWFISH_WORDS_CACHE
    if _BLOWFISH_WORDS_CACHE is not None:
        return _BLOWFISH_WORDS_CACHE

    hex_digits = 8336
    decimal_digits = int(hex_digits * 1.2041199826559248) + 50  # log10(16)
    with localcontext() as context:
        context.prec = decimal_digits
        constant = Decimal(426880) * Decimal(10005).sqrt()
        multiplier = 1
        linear = 13591409
        exponential = 1
        k = 6
        series = Decimal(linear)
        for index in range(1, decimal_digits // 14 + 2):
            multiplier = (multiplier * (k**3 - 16 * k)) // (index**3)
            linear += 545140134
            exponential *= -262537412640768000
            series += Decimal(multiplier * linear) / Decimal(exponential)
            k += 12
        pi = constant / series
        value = int((pi - 3) * (Decimal(16) ** hex_digits))

    text = f"{value:0{hex_digits}x}"
    _BLOWFISH_WORDS_CACHE = tuple(
        int(text[index : index + 8], 16)
        for index in range(0, hex_digits, 8)
    )
    return _BLOWFISH_WORDS_CACHE


_RULES_CANDIDATES = (
    "rulesmd.ini",
    "rulesmo.ini",
    "rules.ini",
    "localmd.mix/rulesmd.ini",
    "localmd.mix/rulesmo.ini",
    "local.mix/rules.ini",
)


class MixFormatError(ValueError):
    pass


@dataclass(frozen=True)
class MixEntry:
    file_id: int
    offset: int
    size: int


@dataclass(frozen=True)
class ExtractedRules:
    filename: str
    data: bytes


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


def _westwood_blowfish_key(source: bytes) -> bytes:
    """Recover Westwood's 56-byte Blowfish key from the 80-byte MIX key source."""
    if len(source) != 80:
        raise MixFormatError("加密 MIX 的密钥区长度无效")

    encoded = base64.b64decode(_WESTWOOD_PUBLIC_KEY)
    if len(encoded) < 3 or encoded[0] != 0x02:
        raise MixFormatError("Westwood MIX 公钥无效")
    length = encoded[1]
    if length & 0x80:
        count = length & 0x7F
        if len(encoded) < 2 + count:
            raise MixFormatError("Westwood MIX 公钥长度无效")
        key_length = int.from_bytes(encoded[2 : 2 + count], "big")
        start = 2 + count
    else:
        key_length = length
        start = 2
    modulus_bytes = encoded[start : start + key_length]
    if len(modulus_bytes) != key_length:
        raise MixFormatError("Westwood MIX 公钥数据不完整")

    modulus = int.from_bytes(modulus_bytes, "big")
    public_len = modulus.bit_length() - 1
    encrypted_block_size = (public_len - 1) // 8 + 1
    clear_block_size = encrypted_block_size - 1
    if encrypted_block_size <= 1 or len(source) % encrypted_block_size:
        raise MixFormatError("加密 MIX 的 RSA 密钥区无效")

    clear = bytearray()
    for offset in range(0, len(source), encrypted_block_size):
        value = int.from_bytes(source[offset : offset + encrypted_block_size], "little")
        decoded = pow(value, 0x10001, modulus)
        clear.extend(decoded.to_bytes(encrypted_block_size, "little")[:clear_block_size])
    if len(clear) < 56:
        raise MixFormatError("无法恢复加密 MIX 的 Blowfish 密钥")
    return bytes(clear[:56])


class _Blowfish:
    """Minimal standard Blowfish ECB implementation used only for MIX index blocks."""

    def __init__(self, key: bytes):
        if not 4 <= len(key) <= 56:
            raise MixFormatError("Blowfish 密钥长度无效")
        words = _blowfish_initial_words()
        self.p = list(words[:18])
        self.s = [
            list(words[18 + box * 256 : 18 + (box + 1) * 256])
            for box in range(4)
        ]

        key_index = 0
        for index in range(18):
            word = 0
            for _ in range(4):
                word = (word << 8) | key[key_index]
                key_index = (key_index + 1) % len(key)
            self.p[index] ^= word

        left = right = 0
        for index in range(0, 18, 2):
            left, right = self._encrypt_words(left, right)
            self.p[index] = left
            self.p[index + 1] = right
        for box in range(4):
            for index in range(0, 256, 2):
                left, right = self._encrypt_words(left, right)
                self.s[box][index] = left
                self.s[box][index + 1] = right

    def _f(self, value: int) -> int:
        a = (value >> 24) & 0xFF
        b = (value >> 16) & 0xFF
        c = (value >> 8) & 0xFF
        d = value & 0xFF
        result = (self.s[0][a] + self.s[1][b]) & 0xFFFFFFFF
        result ^= self.s[2][c]
        return (result + self.s[3][d]) & 0xFFFFFFFF

    def _encrypt_words(self, left: int, right: int) -> tuple[int, int]:
        for index in range(16):
            left ^= self.p[index]
            right ^= self._f(left)
            left, right = right, left
        left, right = right, left
        right ^= self.p[16]
        left ^= self.p[17]
        return left & 0xFFFFFFFF, right & 0xFFFFFFFF

    def _decrypt_words(self, left: int, right: int) -> tuple[int, int]:
        for index in range(17, 1, -1):
            left ^= self.p[index]
            right ^= self._f(left)
            left, right = right, left
        left, right = right, left
        right ^= self.p[1]
        left ^= self.p[0]
        return left & 0xFFFFFFFF, right & 0xFFFFFFFF

    def encrypt(self, data: bytes) -> bytes:
        if len(data) % 8:
            raise MixFormatError("Blowfish 数据不是完整的数据块")
        output = bytearray()
        for offset in range(0, len(data), 8):
            left, right = struct.unpack(">II", data[offset : offset + 8])
            left, right = self._encrypt_words(left, right)
            output.extend(struct.pack(">II", left, right))
        return bytes(output)

    def decrypt(self, data: bytes) -> bytes:
        if len(data) % 8:
            raise MixFormatError("加密 MIX 索引不是完整的 Blowfish 数据块")
        output = bytearray()
        for offset in range(0, len(data), 8):
            left, right = struct.unpack(">II", data[offset : offset + 8])
            left, right = self._decrypt_words(left, right)
            output.extend(struct.pack(">II", left, right))
        return bytes(output)


class MixArchive:
    """Read classic Westwood and community RA2/YR MIX archives by known filename.

    Supported layouts:
    - legacy six-byte header;
    - advanced unencrypted header (current CnCNet included);
    - Westwood encrypted header/index and optional SHA1 checksum;
    - common community "protected MIX" files whose declared body size / high flag
      bytes are intentionally damaged while the index itself remains usable;
    - nested MIX paths such as ``ra2md.mix -> localmd.mix -> rulesmd.ini``.

    Root archives are streamed: only the header/index and requested file range are read.
    """

    def __init__(self, data: bytes):
        self._data: bytes | None = data
        self._path: Path | None = None
        self._size = len(data)
        self.entries: dict[int, MixEntry] = {}
        self.body_offset = 0
        self.body_size = 0
        self.declared_body_size = 0
        self.flags = 0
        self.encrypted = False
        self.has_checksum = False
        self.protected = False
        self._parse_header()

    @classmethod
    def from_path(cls, path: str | Path) -> "MixArchive":
        source = Path(path)
        archive = cls.__new__(cls)
        archive._data = None
        archive._path = source
        archive._size = source.stat().st_size
        archive.entries = {}
        archive.body_offset = 0
        archive.body_size = 0
        archive.declared_body_size = 0
        archive.flags = 0
        archive.encrypted = False
        archive.has_checksum = False
        archive.protected = False
        archive._parse_header()
        return archive

    def _read_at(self, offset: int, size: int) -> bytes:
        if offset < 0 or size < 0 or offset + size > self._size:
            raise MixFormatError("MIX 读取范围无效")
        if self._data is not None:
            return self._data[offset : offset + size]
        assert self._path is not None
        with self._path.open("rb") as handle:
            handle.seek(offset)
            result = handle.read(size)
        if len(result) != size:
            raise MixFormatError("MIX 文件读取不完整")
        return result

    def _physical_body_size(self) -> int:
        checksum_size = 20 if self.has_checksum else 0
        size = self._size - self.body_offset - checksum_size
        if size < 0:
            raise MixFormatError("MIX 数据区不完整")
        return size

    def _parse_entries(self, data: bytes, file_count: int, start: int = 0) -> None:
        required = file_count * 12
        if start < 0 or start + required > len(data):
            raise MixFormatError("MIX 索引不完整")
        physical_body_size = self._physical_body_size()
        for index in range(file_count):
            pos = start + index * 12
            file_id, offset, size = struct.unpack_from("<III", data, pos)
            if offset + size > physical_body_size:
                raise MixFormatError("MIX 文件条目超出实际数据区")
            if file_id in self.entries:
                raise MixFormatError("MIX 包含重复文件 ID")
            self.entries[file_id] = MixEntry(file_id, offset, size)
        self.body_size = physical_body_size
        self.protected = self.protected or self.declared_body_size != physical_body_size

    def _parse_header(self) -> None:
        if self._size < 6:
            raise MixFormatError("MIX 文件头不完整")

        first_six = self._read_at(0, 6)
        legacy_count = struct.unpack_from("<H", first_six, 0)[0]
        if legacy_count:
            self.declared_body_size = struct.unpack_from("<I", first_six, 2)[0]
            index_size = legacy_count * 12
            self.body_offset = 6 + index_size
            if self.body_offset > self._size:
                raise MixFormatError("MIX 索引不完整")
            index_data = self._read_at(6, index_size)
            self._parse_entries(index_data, legacy_count)
            return

        if self._size < 10:
            raise MixFormatError("MIX 文件头不完整")
        self.flags = struct.unpack_from("<I", self._read_at(0, 4), 0)[0]
        self.encrypted = bool(self.flags & MIX_ENCRYPTED)
        self.has_checksum = bool(self.flags & MIX_CHECKSUM)
        unknown_flags = self.flags & ~_MIX_KNOWN_FLAGS

        if self.encrypted:
            if unknown_flags:
                raise MixFormatError("加密 MIX 含未知 Header Flags")
            if self._size < 92:
                raise MixFormatError("加密 MIX 文件头不完整")
            key_source = self._read_at(4, 80)
            cipher = _Blowfish(_westwood_blowfish_key(key_source))
            first_block = cipher.decrypt(self._read_at(84, 8))
            file_count = struct.unpack_from("<H", first_block, 0)[0]
            self.declared_body_size = struct.unpack_from("<I", first_block, 2)[0]
            if not file_count:
                raise MixFormatError("加密 MIX 的文件数量无效")

            total_plain = 6 + file_count * 12
            encrypted_header_size = ((total_plain + 7) // 8) * 8
            additional_size = encrypted_header_size - 8
            self.body_offset = 84 + encrypted_header_size
            if self.body_offset > self._size:
                raise MixFormatError("加密 MIX 索引不完整")
            additional = cipher.decrypt(self._read_at(92, additional_size)) if additional_size else b""
            plain = first_block + additional
            self._parse_entries(plain, file_count, 6)
            return

        # Community MIX protectors commonly corrupt bytes 2/3 of the flags and/or the
        # declared body size. RA2 itself ignores the latter and trusts the index. Do the
        # same, while still bounds-checking every entry against the physical file.
        self.protected = bool(unknown_flags)
        header = self._read_at(4, 6)
        file_count, self.declared_body_size = struct.unpack("<HI", header)
        if not file_count:
            raise MixFormatError("MIX 的文件数量无效")
        index_size = file_count * 12
        self.body_offset = 10 + index_size
        if self.body_offset > self._size:
            raise MixFormatError("MIX 索引不完整")
        index_data = self._read_at(10, index_size)
        self._parse_entries(index_data, file_count)

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
        return self._read_at(self.body_offset + entry.offset, entry.size)


def extract_rules(path: str | Path) -> ExtractedRules:
    """Find the conventional Rules INI used by YR, RA2 or supported major mods."""
    try:
        mix = MixArchive.from_path(path)
    except OSError:
        raise
    except MixFormatError as exc:
        raise ValueError(f"无法读取 MIX 文件：{exc}") from exc

    for candidate in _RULES_CANDIDATES:
        payload = mix.read_file(candidate)
        if payload is not None:
            return ExtractedRules(Path(candidate).name, payload)
    raise ValueError("这个 MIX 文件没有可识别的 Rules INI（rulesmd.ini / rulesmo.ini / rules.ini）")


def extract_rulesmd_bytes(path: str | Path) -> bytes:
    """Backward-compatible helper kept for callers that only need the payload."""
    return extract_rules(path).data
