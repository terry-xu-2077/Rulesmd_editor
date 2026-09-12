from __future__ import annotations

import base64
import hashlib
import json
from io import BytesIO
from pathlib import Path, PureWindowsPath
from typing import Any

from PIL import Image, UnidentifiedImageError

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
ORIGINAL_ROOT = USER_ICON_ROOT / "originals"

UNIT_CELL = (60, 48)
COUNTRY_CELL = (60, 40)
ATLAS_COLUMNS = 10

_ICON_KEYS = ("Cameo", "CameoPCX", "AltCameoPCX")
_UNIT_CATEGORIES = {"步兵", "载具", "战车", "飞机", "建筑"}
_COUNTRY_CATEGORY = "国家"


def _default_meta() -> dict[str, Any]:
    return {"version": 2, "unit": {}, "country": {}}


def _read_meta() -> dict[str, Any]:
    try:
        payload = json.loads(USER_ICON_META.read_text(encoding="utf-8-sig"))
    except (FileNotFoundError, json.JSONDecodeError, UnicodeDecodeError, OSError):
        payload = _default_meta()
    if not isinstance(payload, dict):
        payload = _default_meta()
    payload["version"] = 2
    for kind in ("unit", "country"):
        if not isinstance(payload.get(kind), dict):
            payload[kind] = {}
    return payload


def _write_meta(payload: dict[str, Any]) -> None:
    USER_ICON_ROOT.mkdir(parents=True, exist_ok=True)
    payload["version"] = 2
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


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


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


def _load_image_bytes(data: bytes) -> Image.Image:
    try:
        with Image.open(BytesIO(data)) as source:
            source.load()
            return source.convert("RGBA")
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("无法读取该图片，请使用 PNG、JPG、BMP 或 WebP") from exc


def _load_image(path: Path) -> Image.Image | None:
    try:
        with Image.open(path) as source:
            source.load()
            return source.convert("RGBA")
    except (FileNotFoundError, UnidentifiedImageError, OSError):
        return None


def _crop_image(
    image: Image.Image,
    width: int,
    height: int,
    zoom: float = 1.0,
    center_x: float = 0.5,
    center_y: float = 0.5,
) -> Image.Image:
    """Crop using normalized center coordinates and zoom relative to a cover fit.

    zoom=1 is the largest source crop that completely fills the requested aspect ratio.
    Increasing zoom tightens that crop without ever exposing empty pixels. center_x/y are
    normalized against the original image and are clamped so the crop stays in bounds.
    """
    source = image.convert("RGBA")
    if source.width <= 0 or source.height <= 0:
        raise ValueError("图片为空")
    zoom = _clamp(float(zoom), 1.0, 8.0)
    center_x = _clamp(float(center_x), 0.0, 1.0)
    center_y = _clamp(float(center_y), 0.0, 1.0)

    cover_scale = max(width / source.width, height / source.height)
    scale = cover_scale * zoom
    crop_width = min(float(source.width), width / scale)
    crop_height = min(float(source.height), height / scale)

    half_x = crop_width / (2.0 * source.width)
    half_y = crop_height / (2.0 * source.height)
    center_x = _clamp(center_x, half_x, 1.0 - half_x)
    center_y = _clamp(center_y, half_y, 1.0 - half_y)
    cx = center_x * source.width
    cy = center_y * source.height
    left = _clamp(cx - crop_width / 2.0, 0.0, source.width - crop_width)
    top = _clamp(cy - crop_height / 2.0, 0.0, source.height - crop_height)

    cropped = source.crop((left, top, left + crop_width, top + crop_height))
    return cropped.resize((width, height), Image.Resampling.LANCZOS)


def _normalize_image(image: Image.Image, width: int, height: int) -> Image.Image:
    return _crop_image(image, width, height)


def _source_path(kind: str, target_id: str) -> Path:
    return SOURCE_ROOT / kind / f"{_safe_stem(target_id)}.png"


def _original_path(kind: str, target_id: str) -> Path:
    return ORIGINAL_ROOT / kind / f"{_safe_stem(target_id)}.png"


def _save_original_source(kind: str, target_id: str, image: Image.Image) -> Path:
    target = _original_path(kind, target_id)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGBA").save(target, format="PNG")
    return target


def _save_generated_source(kind: str, target_id: str, image: Image.Image) -> Path:
    target = _source_path(kind, target_id)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGBA").save(target, format="PNG")
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


def _entry_for(rows: dict[str, Any], target_id: str) -> tuple[str | None, dict[str, Any] | None]:
    if isinstance(rows.get(target_id), dict):
        return target_id, rows[target_id]
    folded = target_id.casefold()
    for key, value in rows.items():
        if key.casefold() == folded and isinstance(value, dict):
            return key, value
    return None, None


def _crop_meta(entry: dict[str, Any] | None) -> dict[str, float]:
    crop = entry.get("crop") if isinstance(entry, dict) else None
    if not isinstance(crop, dict):
        crop = {}
    try:
        zoom = _clamp(float(crop.get("zoom", 1.0)), 1.0, 8.0)
    except (TypeError, ValueError):
        zoom = 1.0
    try:
        center_x = _clamp(float(crop.get("x", 0.5)), 0.0, 1.0)
    except (TypeError, ValueError):
        center_x = 0.5
    try:
        center_y = _clamp(float(crop.get("y", 0.5)), 0.0, 1.0)
    except (TypeError, ValueError):
        center_y = 0.5
    return {"zoom": zoom, "x": center_x, "y": center_y}


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
        Image.new("RGBA", (width, height), (0, 0, 0, 0)).save(tile_path, format="PNG")
        return tile_path

    max_slot = max(slot for slot, _, _ in valid)
    row_count = max(1, max_slot // ATLAS_COLUMNS + 1)
    atlas = Image.new("RGBA", (width * ATLAS_COLUMNS, height * row_count), (0, 0, 0, 0))
    for slot, _, source in valid:
        image = _load_image(source)
        if image is None:
            continue
        col = slot % ATLAS_COLUMNS
        row = slot // ATLAS_COLUMNS
        normalized = _normalize_image(image, width, height)
        atlas.alpha_composite(normalized, (col * width, row * height))
    atlas.save(tile_path, format="PNG")
    return tile_path


def write_pcx(image: Image.Image, path: Path) -> None:
    """Write a classic 8-bit/256-colour PCX accepted by Ares cameo/flag fields."""
    rgb = image.convert("RGB")
    if rgb.width <= 0 or rgb.height <= 0 or rgb.width > 65535 or rgb.height > 65535:
        raise ValueError("PCX 图片尺寸无效")
    paletted = rgb.quantize(
        colors=256,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.FLOYDSTEINBERG,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    paletted.save(tmp, format="PCX")
    tmp.replace(path)


def read_pcx(path: Path) -> Image.Image:
    try:
        with Image.open(path) as source:
            if source.format != "PCX":
                raise ValueError("不是有效的 PCX 文件")
            source.load()
            return source.convert("RGBA")
    except UnidentifiedImageError as exc:
        raise ValueError("不是有效的 PCX 文件") from exc


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

    def _custom_image(self, kind: str, target_id: str) -> Image.Image | None:
        return _load_image(_source_path(kind, target_id))

    def custom_icon_source(self, kind: str, target_id: str) -> dict[str, Any]:
        clean_kind = str(kind).strip().lower()
        clean_id = str(target_id).strip()
        if clean_kind not in {"unit", "country"} or not clean_id:
            return {"exists": False, "image": "", "sourceName": "", "crop": {"zoom": 1.0, "x": 0.5, "y": 0.5}}
        meta = _read_meta()
        rows = meta.get(clean_kind, {})
        if not isinstance(rows, dict):
            rows = {}
        stored_id, entry = _entry_for(rows, clean_id)
        if stored_id is None or entry is None:
            return {"exists": False, "image": "", "sourceName": "", "crop": {"zoom": 1.0, "x": 0.5, "y": 0.5}}
        original = _original_path(clean_kind, stored_id)
        generated = _source_path(clean_kind, stored_id)
        source = original if original.is_file() else generated
        if not source.is_file():
            return {"exists": False, "image": "", "sourceName": "", "crop": _crop_meta(entry)}
        return {
            "exists": True,
            "image": _data_url(source),
            "sourceName": str(entry.get("source_name", "")),
            "crop": _crop_meta(entry),
            "hasOriginal": original.is_file(),
        }

    def _mod_unit_image(
        self,
        art_section: str,
        artmd: IniDocument,
        root: Path,
    ) -> tuple[Image.Image | None, str]:
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

    def _mod_country_image(
        self,
        target_id: str,
        doc: IniDocument,
        root: Path,
    ) -> tuple[Image.Image | None, str]:
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
        rows: list[tuple[str, Image.Image, str, str]],
    ) -> tuple[Path, dict[str, dict[str, Any]]]:
        width, height = UNIT_CELL if kind == "unit" else COUNTRY_CELL
        tile_path = RESOLVED_UNIT_TILE if kind == "unit" else RESOLVED_COUNTRY_TILE
        USER_ICON_ROOT.mkdir(parents=True, exist_ok=True)
        if not rows:
            Image.new("RGBA", (width, height), (0, 0, 0, 0)).save(tile_path, format="PNG")
            return tile_path, {}

        rows = sorted(rows, key=lambda item: item[0].casefold())
        row_count = max(1, (len(rows) + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS)
        atlas = Image.new("RGBA", (width * ATLAS_COLUMNS, height * row_count), (0, 0, 0, 0))
        registry: dict[str, dict[str, Any]] = {}
        for slot, (target_id, icon, source, game_file) in enumerate(rows):
            col = slot % ATLAS_COLUMNS
            row = slot // ATLAS_COLUMNS
            normalized = _normalize_image(icon, width, height)
            atlas.alpha_composite(normalized, (col * width, row * height))
            registry[target_id] = {
                "x": col * width,
                "y": row * height,
                "cellWidth": width,
                "cellHeight": height,
                "source": source,
                "gameFile": game_file,
            }
        atlas.save(tile_path, format="PNG")
        return tile_path, registry

    def library_snapshot(self) -> dict[str, Any]:
        meta = _read_meta()
        root = self.game_root()
        doc = self._doc()
        art_path = self.artmd_path()
        artmd = _load_artmd(art_path) if art_path is not None else IniDocument.from_text("")

        unit_rows: list[tuple[str, Image.Image, str, str]] = []
        country_rows: list[tuple[str, Image.Image, str, str]] = []
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
                mod, game_file = self._mod_unit_image(target["art_section"] or target_id, artmd, root)
                if mod is not None:
                    unit_rows.append((target_id, mod, "mod", game_file))
            else:
                mod, game_file = self._mod_country_image(target_id, doc, root)
                if mod is not None:
                    country_rows.append((target_id, mod, "mod", game_file))

        unit_tile, unit_registry = self._build_resolved_atlas("unit", unit_rows)
        country_tile, country_registry = self._build_resolved_atlas("country", country_rows)
        return {
            "version": 2,
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
        crop_zoom: float = 1.0,
        crop_x: float = 0.5,
        crop_y: float = 0.5,
    ) -> dict[str, Any]:
        clean_kind = str(kind).strip().lower()
        if clean_kind not in {"unit", "country"}:
            raise ValueError("图标类型必须是 unit 或 country")
        clean_id = str(target_id).strip()
        if not clean_id:
            raise ValueError("单位或国家 ID 不能为空")

        image = _load_image_bytes(_decode_upload(data_base64))
        zoom = _clamp(float(crop_zoom), 1.0, 8.0)
        center_x = _clamp(float(crop_x), 0.0, 1.0)
        center_y = _clamp(float(crop_y), 0.0, 1.0)
        width, height = UNIT_CELL if clean_kind == "unit" else COUNTRY_CELL
        cropped = _crop_image(image, width, height, zoom, center_x, center_y)
        _save_original_source(clean_kind, clean_id, image)
        _save_generated_source(clean_kind, clean_id, cropped)

        meta = _read_meta()
        rows = meta.setdefault(clean_kind, {})
        existing = rows.get(clean_id) if isinstance(rows, dict) else None
        if not isinstance(existing, dict):
            existing = {"slot": _allocate_slot(rows if isinstance(rows, dict) else {})}
        existing["source_name"] = str(filename).strip()
        existing["game_file"] = str(existing.get("game_file", ""))
        existing["crop"] = {"zoom": zoom, "x": center_x, "y": center_y}
        existing["original_width"] = image.width
        existing["original_height"] = image.height
        rows[clean_id] = existing
        _write_meta(meta)
        _rebuild_custom_atlas(clean_kind, meta)

        sync_result = {"synced": False, "game_file": "", "art_section": "", "rules_dirty": False}
        root = self.game_root()
        if sync_game and root is not None:
            root.mkdir(parents=True, exist_ok=True)
            game_file = f"rulesmd_{_safe_stem(clean_id)}.pcx"
            pcx_path = root / game_file
            write_pcx(cropped, pcx_path)
            if clean_kind == "unit":
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
        stored_id = clean_id
        if isinstance(rows, dict):
            matched_id, _ = _entry_for(rows, clean_id)
            if matched_id is not None:
                stored_id = matched_id
                rows.pop(matched_id, None)
        for path in (_source_path(clean_kind, stored_id), _original_path(clean_kind, stored_id)):
            try:
                path.unlink()
            except FileNotFoundError:
                pass
        _write_meta(meta)
        _rebuild_custom_atlas(clean_kind, meta)
        return self.library_snapshot()
