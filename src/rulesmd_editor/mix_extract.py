from __future__ import annotations

import binascii
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from struct import unpack
from typing import BinaryIO

from blowfish import Cipher


class MixFormatError(RuntimeError):
    """Raised when a Westwood MIX archive cannot be safely parsed."""


@dataclass(frozen=True)
class MixEntry:
    file_id: int
    offset: int
    size: int


_PUBLIC_EXPONENT = 65537
_PUBLIC_MODULUS = int(
    "681994811107118991598552881669230523074742337494683459234572860554038768387821901289207730765589"
)


def ra2_filename_hash(filename: str) -> int:
    """Return the RA2/YR CRC filename id stored in MIX indices."""
    text = str(filename).upper()
    length = len(text)
    aligned = length & 0xFFFFFFFC
    remainder = length & 3
    if remainder:
        text += chr(length - aligned) + text[aligned] * (3 - remainder)
    return binascii.crc32(text.encode("latin1")) & 0xFFFFFFFF


def _read_exact(stream: BinaryIO, size: int, label: str) -> bytes:
    data = stream.read(size)
    if len(data) != size:
        raise MixFormatError(f"MIX {label} 数据不完整：需要 {size} 字节，实际 {len(data)} 字节")
    return data


def _decrypt_blowfish_key(payload: bytes) -> bytes:
    if len(payload) != 80:
        raise MixFormatError("MIX 加密密钥块长度无效")
    parts: list[bytes] = []
    for block in (payload[:40], payload[40:]):
        decrypted_int = pow(int.from_bytes(block, "little"), _PUBLIC_EXPONENT, _PUBLIC_MODULUS)
        decrypted = decrypted_int.to_bytes(max(1, (decrypted_int.bit_length() + 7) // 8), "little")
        decrypted = decrypted.rstrip(b"\x00")
        parts.append(decrypted)
    key = b"".join(parts)
    if not key:
        raise MixFormatError("MIX Blowfish 密钥解密失败")
    return key


def _parse_entries(stream: BinaryIO) -> tuple[list[MixEntry], int]:
    stream.seek(0)
    first_count = unpack("<H", _read_exact(stream, 2, "头部"))[0]

    if first_count:
        # Classic C&C-style header (no flags).
        file_count = first_count
        _data_size = unpack("<I", _read_exact(stream, 4, "数据尺寸"))[0]
        index_data = _read_exact(stream, file_count * 12, "索引")
        data_start = stream.tell()
    else:
        flags = unpack("<H", _read_exact(stream, 2, "标志"))[0]
        if flags & 0x2:
            encrypted_key = _read_exact(stream, 80, "加密密钥")
            key = _decrypt_blowfish_key(encrypted_key)
            cipher = Cipher(key)

            encrypted_first = _read_exact(stream, 8, "加密头部")
            first_block = cipher.decrypt_block(encrypted_first)
            file_count, _data_size = unpack("<HI", first_block[:6])
            if file_count <= 0:
                raise MixFormatError("MIX 加密索引中的文件数量无效")

            # Header is 6 bytes plus 12 bytes per index entry, rounded up to 8-byte blocks.
            block_count = (13 + file_count * 12) // 8
            stream.seek(4 + 80)
            encrypted_header = _read_exact(stream, block_count * 8, "完整加密索引")
            decrypted_header = b"".join(Cipher(key).decrypt_ecb(encrypted_header))
            required = 6 + file_count * 12
            if len(decrypted_header) < required:
                raise MixFormatError("MIX 解密后的索引长度不足")
            index_data = decrypted_header[6:required]
            data_start = 4 + 80 + block_count * 8
        else:
            file_count, _data_size = unpack("<HI", _read_exact(stream, 6, "头部"))
            index_data = _read_exact(stream, file_count * 12, "索引")
            data_start = stream.tell()

    if file_count <= 0 or file_count > 1_000_000:
        raise MixFormatError(f"MIX 文件数量异常：{file_count}")

    entries: list[MixEntry] = []
    for index in range(file_count):
        start = index * 12
        file_id, offset, size = unpack("<III", index_data[start : start + 12])
        entries.append(MixEntry(file_id=file_id, offset=offset, size=size))
    return entries, data_start


def extract_mix_entry(stream: BinaryIO, filename: str) -> bytes:
    """Extract one known filename from a RA/TS/RA2/YR MIX stream without unpacking the archive."""
    entries, data_start = _parse_entries(stream)
    wanted = ra2_filename_hash(filename)
    entry = next((item for item in entries if item.file_id == wanted), None)
    if entry is None:
        raise FileNotFoundError(f"MIX 中没有找到 {filename}")

    stream.seek(0, 2)
    total_size = stream.tell()
    absolute = data_start + entry.offset
    if absolute < data_start or entry.size < 0 or absolute + entry.size > total_size:
        raise MixFormatError(f"MIX 中 {filename} 的索引越界")
    stream.seek(absolute)
    return _read_exact(stream, entry.size, filename)


def _find_case_insensitive(root: Path, filename: str) -> Path | None:
    direct = root / filename
    if direct.is_file():
        return direct
    wanted = filename.casefold()
    try:
        return next((item for item in root.iterdir() if item.is_file() and item.name.casefold() == wanted), None)
    except OSError:
        return None


def extract_yuri_artmd(game_root: str | Path) -> tuple[bytes, str]:
    """Extract artmd.ini from ra2md.mix -> localmd.mix in a Yuri's Revenge install."""
    root = Path(game_root)
    ra2md = _find_case_insensitive(root, "ra2md.mix")
    if ra2md is None:
        raise FileNotFoundError(f"游戏目录中没有找到 ra2md.mix：{root}")

    try:
        with ra2md.open("rb") as outer:
            localmd = extract_mix_entry(outer, "localmd.mix")
        artmd = extract_mix_entry(BytesIO(localmd), "artmd.ini")
    except (OSError, MixFormatError, FileNotFoundError) as exc:
        raise RuntimeError(f"无法从 {ra2md.name} → localmd.mix 提取 artmd.ini：{exc}") from exc

    if len(artmd) < 4096 or b"[" not in artmd or b"]" not in artmd:
        raise MixFormatError("从 MIX 提取出的 artmd.ini 看起来不完整")
    return artmd, f"{ra2md.name} -> localmd.mix -> artmd.ini"
