from __future__ import annotations

import base64
import hashlib
import json
import os
import struct
from pathlib import Path, PureWindowsPath
from typing import Any

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QImage, QPainter, qRgb

from .ini_document import IniDocument
from .resource_paths import RESOURCE_ROOT
from .user_data import load_app_config

USER_ICON_ROOT = RESOURCE_ROOT / "user-icons"
USER_ICON_META = USER_ICON_ROOT / "icons.json"
CUSTOM_UNIT_TILE = USER_ICON_ROOT / "unitTile.png"
CUSTOM_COUNTRY_TILE = USER_ICON_ROOT / "countryTile.png"
RESOLVED_UNIT_TILE = USER_ICON_ROOT / "resolvedUnitTile.png"
RESOLVED_COUNTRY_TILE = USER_ICON_ROOT / "resolvedCountryTile.png"
SOURCE_ROOT = USER_ICON_ROOT / "sources"

UNIT_CELL = (60, 48)
COUNTRY_CELL = (60, 40)
ATLAS_COLUMNS = 10

_ICON_KEYS = ("Cameo", "CameoPCX", "AltCameoPCX")
_UNIT_CATEGORIES = {"步兵", "载具", "战车", "飞机", "建筑"}
_COUNTRY_CATEGORY = "国家"


def _default_meta() -> dict[str, Any]:
    return {"version": 1, "unit": {}, "country": {}}


def _read_meta() -> dict[str, Any]:
    try:
        payload = json.loads(USER_ICON_META.read_text(encoding="utf-8-sig"))
    except (FileNotFoundError, json.JSONDecodeError, UnicodeDecodeError, OSError):
        payload = _default_meta()
    if not isinstance(payload, dict):
        payload = _default_meta()
    payload.setdefault("version", 1)
    for kind in ("unit", "country"):
        if not isinstance(payload.get(kind), dict):
            payload[kind] = {}
    return payload


def _write_meta(payload: dict[str, Any]) -> None:
    USER_ICON_ROOT.mkdir(parents=True, exist_ok=True)
    tmp = USER_ICON_META.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(USER_ICON_META)


def _data_url(path: Path) -> str:
    if not path.is_file():
        return ""
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def _clean_category(value: str) -> str:
    text = value.strip()
    if text.lower().startswith("ares") and "·" in text:
        text = text.split("·", 1)[1].strip()
    return text


def _safe_stem(value: str) -> str:
    base = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in value.strip())
    base = base.strip("._-") or "icon"
    digest = hashlib.sha1(value.casefold().encode("utf-8")).hexdigest()[:8]
    return f"{base[:48]}_{digest}"


def _decode_upload(payload: str) -> bytes:
    if not isinstance(payload, str) or not payload.strip():
        raise ValueError("图标数据为空")
    raw = payload.strip()
    if raw.startswith("data:"):
        comma = raw.find(",")
        if comma < 0:
            raise ValueError("无效的图标数据")
        raw = raw[comma + 1 :]
    try:
        return base64.b64decode(raw, validate=True)
    except Exception as exc:
        raise ValueError("图标数据不是有效的 Base64") from exc


def _load_image_bytes(data: bytes) -> QImage:
    image = QImage()
    if not image.loadFromData(data) or image.isNull():
        raise ValueError("无法读取该图片，请使用 PNG、JPG、BMP 或 Qt 支持的图片格式")
    return image


def _normalize_image(image: QImage, width: int, height: int) -> QImage:
    if image.isNull():
        raise ValueError("图片为空")
    scaled = image.scaled(
        width,
        height,
        Qt.AspectRatioMode.KeepAspectRatioByExpanding,
        Qt.TransformationMode.SmoothTransformation,
    )
    x = max(0, (scaled.width() - width) // 2)
    y = max(0, (scaled.height() - height) // 2)
    return scaled.copy(x, y, width, height).convertToFormat(QImage.Format.Format_ARGB32)


def _source_path(kind: str, target_id: str) -> Path:
    return SOURCE_ROOT / kind / f"{_safe_stem(target_id)}.png"


def _save_normalized_source(kind: str, target_id: str, image: QImage) -> Path:
    width, height = UNIT_CELL if kind == "unit" else COUNTRY_CELL
    normalized = _normalize_image(image, width, height)
    target = _source_path(kind, target_id)
    target.parent.mkdir(parents=True, exist_ok=True)
    if not normalized.save(str(target), "PNG"):
        raise OSError(f"无法写入图标资源：{target}")
    return target


def _allocate_slot(rows: dict[str, Any]) -> int:
    slots: list[int] = []
    for entry in rows.values():
        if isinstance(entry, dict):
            try:
                slots.append(int(entry.get("slot", -1)))
            except (TypeError, ValueError):
                pass
    return max(slots, default=-1) + 1


def _rebuild_custom_atlas(kind: str, meta: dict[str, Any]) -> Path:
    rows = meta.get(kind, {})
    if not isinstance(rows, dict):
        rows = {}
    width, height = UNIT_CELL if kind == "unit" else COUNTRY_CELL
    tile_path = CUSTOM_UNIT_TILE if kind == "unit" else CUSTOM_COUNTRY_TILE

    valid: list[tuple[int, str, Path]] = []
    for target_id, entry in rows.items():
        if not isinstance(entry, dict):
            continue
        source = _source_path(kind, target_id)
        if not source.is_file():
            continue
        try:
            slot = max(0, int(entry.get("slot", 0)))
        except (TypeError, ValueError):
            slot = 0
        valid.append((slot, target_id, source))

    USER_ICON_ROOT.mkdir(parents=True, exist_ok=True)
    if not valid:
        blank = QImage(width, height, QImage.Format.Format_ARGB32)
        blank.fill(Qt.GlobalColor.transparent)
        blank.save(str(tile_path), "PNG")
        return tile_path

    max_slot = max(slot for slot, _, _ in valid)
    rows_count = max(1, max_slot // ATLAS_COLUMNS + 1)
    atlas = QImage(width * ATLAS_COLUMNS, height * rows_count, QImage.Format.Format_ARGB32)
    atlas.fill(Qt.GlobalColor.transparent)
    painter = QPainter(atlas)
    try:
        for slot, _, source in valid:
            image = QImage(str(source))
            if image.isNull():
                continue
            col = slot % ATLAS_COLUMNS
            row = slot // ATLAS_COLUMNS
            painter.drawImage(col * width, row * height, _normalize_image(image, width, height))
    finally:
        painter.end()
    if not atlas.save(str(tile_path), "PNG"):
        raise OSError(f"无法写入图标 Tile：{tile_path}")
    return tile_path


def _pcx_palette() -> list[tuple[int, int, int]]:
    palette: list[tuple[int, int, int]] = []
    for index in range(256):
        r = (index >> 5) & 0x07
        g = (index >> 2) & 0x07
        b = index & 0x03
        palette.append((round(r * 255 / 7), round(g * 255 / 7), round(b * 255 / 3)))
    return palette


def _pcx_index(r: int, g: int, b: int) -> int:
    return ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6)


def _rle_encode_row(row: bytes) -> bytes:
    result = bytearray()
    index = 0
    while index < len(row):
        value = row[index]
        run = 1
        while index + run < len(row) and row[index + run] == value and run < 63:
            run += 1
        if run > 1 or value >= 0xC0:
            result.append(0xC0 | run)
            result.append(value)
        else:
            result.append(value)
        index += run
    return bytes(result)


def write_pcx(image: QImage, path: Path) -> None:
    rgb = image.convertToFormat(QImage.Format.Format_RGB888)
    width, height = rgb.width(), rgb.height()
    if width <= 0 or height <= 0 or width > 65535 or height > 65535:
        raise ValueError("PCX 图片尺寸无效")

    bytes_per_line = width if width % 2 == 0 else width + 1
    header = bytearray(128)
    header[0] = 0x0A
    header[1] = 5
    header[2] = 1
    header[3] = 8
    struct.pack_into("<HHHH", header, 4, 0, 0, width - 1, height - 1)
    struct.pack_into("<HH", header, 12, width, height)
    header[64] = 0
    header[65] = 1
    struct.pack_into("<H", header, 66, bytes_per_line)
    struct.pack_into("<H", header, 68, 1)
    struct.pack_into("<HH", header, 70, width, height)

    encoded = bytearray(header)
    for y in range(height):
        row = bytearray()
        for x in range(width):
            color = rgb.pixelColor(x, y)
            row.append(_pcx_index(color.red(), color.green(), color.blue()))
        if bytes_per_line > width:
            row.append(0)
        encoded.extend(_rle_encode_row(bytes(row)))

    encoded.append(0x0C)
    for r, g, b in _pcx_palette():
        encoded.extend((r, g, b))

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(bytes(encoded))
    tmp.replace(path)


def read_pcx(path: Path) -> QImage:
    data = path.read_bytes()
    if len(data) < 128 + 769 or data[0] != 0x0A:
        raise ValueError("不是有效的 PCX 文件")
    if data[2] != 1 or data[3] != 8 or data[65] != 1:
        raise ValueError("当前仅支持 8 位、单平面的 PCX")

    xmin, ymin, xmax, ymax = struct.unpack_from("<HHHH", data, 4)
    width = xmax - xmin + 1
    height = ymax - ymin + 1
    bytes_per_line = struct.unpack_from("<H", data, 66)[0]
    if width <= 0 or height <= 0 or bytes_per_line < width:
        raise ValueError("PCX 尺寸信息无效")
    if data[-769] != 0x0C:
        raise ValueError("PCX 缺少 256 色调色板")

    palette_raw = data[-768:]
    palette = [
        qRgb(palette_raw[index], palette_raw[index + 1], palette_raw[index + 2])
        for index in range(0, 768, 3)
    ]

    wanted = height * bytes_per_line
    decoded = bytearray()
    pos = 128
    data_end = len(data) - 769
    while pos < data_end and len(decoded) < wanted:
        value = data[pos]
        pos += 1
        if value & 0xC0 == 0xC0:
            count = value & 0x3F
            if pos >= data_end:
                break
            pixel = data[pos]
            pos += 1
            decoded.extend([pixel] * count)
        else:
            decoded.append(value)
    if len(decoded) < wanted:
        raise ValueError("PCX 像素数据不完整")

    image = QImage(width, height, QImage.Format.Format_Indexed8)
    image.setColorTable(palette)
    for y in range(height):
        offset = y * bytes_per_line
        for x in range(width):
            image.setPixel(x, y, decoded[offset + x])
    return image.convertToFormat(QImage.Format.Format_ARGB32)


def _resolve_relative_case_insensitive(root: Path, filename: str) -> Path | None:
    clean = filename.strip().strip('"').replace("/", "\\")
    if not clean:
        return None
    candidate = Path(clean)
    if candidate.is_absolute() and candidate.is_file():
        return candidate

    current = root
    for part in PureWindowsPath(clean).parts:
        if part in {".", ""}:
            continue
        direct = current / part
        if direct.exists():
            current = direct
            continue
        try:
            match = next((item for item in current.iterdir() if item.name.casefold() == part.casefold()), None)
        except OSError:
            return None
        if match is None:
            return None
        current = match
    return current if current.is_file() else None


def _load_artmd(path: Path) -> IniDocument:
    if path.is_file():
        return IniDocument.load(path)
    doc = IniDocument.from_text("", encoding="utf-8")
    doc.path = path
    return doc


def _icon_value_rows(doc: IniDocument) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for section in doc.sections():
        values = {key: doc.get(section, key, "").strip() for key in _ICON_KEYS}
        if any(values.values()):
            rows.append({"section": section, **values})
    return rows


class IconResourceService:
    def __init__(self, workspace: Any):
        self.workspace = workspace

    def _doc(self) -> IniDocument | None:
        try:
            return self.workspace._doc()
        except Exception:
            return None

    def game_root(self) -> Path | None:
        configured = str(load_app_config().get("gamePath", "")).strip()
        if configured:
            path = Path(configured).expanduser()
            if path.is_dir():
                return path.resolve()
            if path.parent.exists():
                return path.parent.resolve()
        doc = self._doc()
        if doc is not None and doc.path is not None:
            return doc.path.resolve().parent
        return None

    def artmd_path(self) -> Path | None:
        root = self.game_root()
        if root is None:
            return None
        existing = _resolve_relative_case_insensitive(root, "artmd.ini")
        return existing or root / "artmd.ini"

    def artmd_snapshot(self) -> dict[str, Any]:
        path = self.artmd_path()
        if path is None:
            return {"path": "", "exists": False, "rows": []}
        doc = _load_artmd(path)
        return {"path": str(path), "exists": path.is_file(), "rows": _icon_value_rows(doc)}

    def set_artmd_icon(
        self,
        section: str,
        cameo: str | None = None,
        cameo_pcx: str | None = None,
        alt_cameo_pcx: str | None = None,
    ) -> dict[str, Any]:
        clean_section = str(section).strip()
        if not clean_section:
            raise ValueError("ArtMD Section 不能为空")
        path = self.artmd_path()
        if path is None:
            raise ValueError("请先在设置中指定游戏路径，或打开游戏目录中的规则文件")
        path.parent.mkdir(parents=True, exist_ok=True)
        doc = _load_artmd(path)
        mapping = {
            "Cameo": cameo,
            "CameoPCX": cameo_pcx,
            "AltCameoPCX": alt_cameo_pcx,
        }
        for key, value in mapping.items():
            if value is None:
                continue
            clean = str(value).strip()
            if clean:
                doc.set(clean_section, key, clean)
            else:
                doc.remove_option(clean_section, key)
        doc.save(path)
        return self.artmd_snapshot()

    def targets(self) -> list[dict[str, str]]:
        try:
            snapshot = self.workspace.snapshot()
        except Exception:
            return []
        doc = self._doc()
        rows: list[dict[str, str]] = []
        for category in snapshot.get("categories", []):
            category_name = _clean_category(str(category.get("name", "")))
            if category_name not in _UNIT_CATEGORIES and category_name != _COUNTRY_CATEGORY:
                continue
            kind = "country" if category_name == _COUNTRY_CATEGORY else "unit"
            for item in category.get("items", []):
                section = str(item.get("section", "")).strip()
                if not section:
                    continue
                label = str(item.get("label") or section).strip()
                art_section = ""
                if kind == "unit" and doc is not None:
                    art_section = doc.get(section, "Image", "").strip() or section
                rows.append({
                    "id": section,
                    "label": label,
                    "category": category_name,
                    "kind": kind,
                    "art_section": art_section,
                })
        return rows

    def _custom_image(self, kind: str, target_id: str) -> QImage | None:
        path = _source_path(kind, target_id)
        if not path.is_file():
            return None
        image = QImage(str(path))
        return None if image.isNull() else image

    def _mod_unit_image(self, target_id: str, art_section: str, artmd: IniDocument, root: Path) -> tuple[QImage | None, str]:
        pcx = artmd.get(art_section, "CameoPCX", "").strip()
        if not pcx:
            return None, ""
        path = _resolve_relative_case_insensitive(root, pcx)
        if path is None:
            return None, pcx
        try:
            return read_pcx(path), pcx
        except (OSError, ValueError):
            return None, pcx

    def _mod_country_image(self, target_id: str, doc: IniDocument, root: Path) -> tuple[QImage | None, str]:
        pcx = doc.get(target_id, "File.Flag", "").strip()
        if not pcx:
            return None, ""
        path = _resolve_relative_case_insensitive(root, pcx)
        if path is None:
            return None, pcx
        try:
            return read_pcx(path), pcx
        except (OSError, ValueError):
            return None, pcx

    def _build_resolved_atlas(
        self,
        kind: str,
        rows: list[tuple[str, QImage, str, str]],
    ) -> tuple[Path, dict[str, dict[str, Any]]]:
        width, height = UNIT_CELL if kind == "unit" else COUNTRY_CELL
        tile_path = RESOLVED_UNIT_TILE if kind == "unit" else RESOLVED_COUNTRY_TILE
        if not rows:
            image = QImage(width, height, QImage.Format.Format_ARGB32)
            image.fill(Qt.GlobalColor.transparent)
            USER_ICON_ROOT.mkdir(parents=True, exist_ok=True)
            image.save(str(tile_path), "PNG")
            return tile_path, {}

        rows = sorted(rows, key=lambda item: item[0].casefold())
        row_count = max(1, (len(rows) + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS)
        atlas = QImage(width * ATLAS_COLUMNS, height * row_count, QImage.Format.Format_ARGB32)
        atlas.fill(Qt.GlobalColor.transparent)
        painter = QPainter(atlas)
        registry: dict[str, dict[str, Any]] = {}
        try:
            for slot, (target_id, icon, source, game_file) in enumerate(rows):
                col = slot % ATLAS_COLUMNS
                row = slot // ATLAS_COLUMNS
                painter.drawImage(col * width, row * height, _normalize_image(icon, width, height))
                registry[target_id] = {
                    "x": col * width,
                    "y": row * height,
                    "cellWidth": width,
                    "cellHeight": height,
                    "source": source,
                    "gameFile": game_file,
                }
        finally:
            painter.end()
        USER_ICON_ROOT.mkdir(parents=True, exist_ok=True)
        atlas.save(str(tile_path), "PNG")
        return tile_path, registry

    def library_snapshot(self) -> dict[str, Any]:
        meta = _read_meta()
        root = self.game_root()
        doc = self._doc()
        art_path = self.artmd_path()
        artmd = _load_artmd(art_path) if art_path is not None else IniDocument.from_text("")

        unit_rows: list[tuple[str, QImage, str, str]] = []
        country_rows: list[tuple[str, QImage, str, str]] = []
        for target in self.targets():
            kind = target["kind"]
            target_id = target["id"]
            custom = self._custom_image(kind, target_id)
            if custom is not None:
                game_file = str(meta.get(kind, {}).get(target_id, {}).get("game_file", ""))
                row = (target_id, custom, "custom", game_file)
                (country_rows if kind == "country" else unit_rows).append(row)
                continue
            if root is None or doc is None:
                continue
            if kind == "unit":
                mod, game_file = self._mod_unit_image(target_id, target["art_section"] or target_id, artmd, root)
                if mod is not None:
                    unit_rows.append((target_id, mod, "mod", game_file))
            else:
                mod, game_file = self._mod_country_image(target_id, doc, root)
                if mod is not None:
                    country_rows.append((target_id, mod, "mod", game_file))

        unit_tile, unit_registry = self._build_resolved_atlas("unit", unit_rows)
        country_tile, country_registry = self._build_resolved_atlas("country", country_rows)
        return {
            "version": 1,
            "unitTile": _data_url(unit_tile),
            "countryTile": _data_url(country_tile),
            "unit": unit_registry,
            "country": country_registry,
            "targets": self.targets(),
            "artmd": self.artmd_snapshot(),
            "gameRoot": str(root) if root else "",
            "customCount": sum(len(meta.get(kind, {})) for kind in ("unit", "country")),
        }

    def import_custom_icon(
        self,
        kind: str,
        target_id: str,
        data_base64: str,
        filename: str = "",
        sync_game: bool = True,
        variant: str = "cameo",
    ) -> dict[str, Any]:
        clean_kind = str(kind).strip().lower()
        if clean_kind not in {"unit", "country"}:
            raise ValueError("图标类型必须是 unit 或 country")
        clean_id = str(target_id).strip()
        if not clean_id:
            raise ValueError("单位或国家 ID 不能为空")

        image = _load_image_bytes(_decode_upload(data_base64))
        _save_normalized_source(clean_kind, clean_id, image)
        meta = _read_meta()
        rows = meta.setdefault(clean_kind, {})
        existing = rows.get(clean_id) if isinstance(rows, dict) else None
        if not isinstance(existing, dict):
            existing = {"slot": _allocate_slot(rows if isinstance(rows, dict) else {})}
        existing["source_name"] = str(filename).strip()
        existing["game_file"] = str(existing.get("game_file", ""))
        rows[clean_id] = existing
        _write_meta(meta)
        _rebuild_custom_atlas(clean_kind, meta)

        sync_result = {"synced": False, "game_file": "", "art_section": "", "rules_dirty": False}
        root = self.game_root()
        if sync_game and root is not None:
            root.mkdir(parents=True, exist_ok=True)
            game_file = f"rulesmd_{_safe_stem(clean_id)}.pcx"
            pcx_path = root / game_file
            if clean_kind == "unit":
                write_pcx(_normalize_image(image, *UNIT_CELL), pcx_path)
                doc = self._doc()
                art_section = clean_id
                if doc is not None:
                    art_section = doc.get(clean_id, "Image", "").strip() or clean_id
                if str(variant).strip().lower() in {"alt", "elite", "altcameo"}:
                    self.set_artmd_icon(art_section, alt_cameo_pcx=game_file)
                else:
                    self.set_artmd_icon(art_section, cameo_pcx=game_file)
                sync_result.update({"synced": True, "game_file": game_file, "art_section": art_section})
            else:
                # Ares does not prescribe a single File.Flag size. Preserve the imported
                # dimensions for the game asset while the editor preview is normalized to 60x40.
                write_pcx(image, pcx_path)
                doc = self._doc()
                if doc is not None and doc.has_section(clean_id):
                    doc.set(clean_id, "File.Flag", game_file)
                    sync_result.update({"synced": True, "game_file": game_file, "rules_dirty": True})

            existing["game_file"] = game_file
            rows[clean_id] = existing
            _write_meta(meta)

        result = self.library_snapshot()
        result["sync"] = sync_result
        return result

    def remove_custom_icon(self, kind: str, target_id: str) -> dict[str, Any]:
        clean_kind = str(kind).strip().lower()
        if clean_kind not in {"unit", "country"}:
            raise ValueError("图标类型必须是 unit 或 country")
        clean_id = str(target_id).strip()
        meta = _read_meta()
        rows = meta.get(clean_kind, {})
        if isinstance(rows, dict):
            rows.pop(clean_id, None)
        source = _source_path(clean_kind, clean_id)
        try:
            source.unlink()
        except FileNotFoundError:
            pass
        _write_meta(meta)
        _rebuild_custom_atlas(clean_kind, meta)
        return self.library_snapshot()
