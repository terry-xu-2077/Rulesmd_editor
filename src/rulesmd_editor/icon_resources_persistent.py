from __future__ import annotations

from typing import Any

from PIL import Image

from . import icon_resources as base


class PersistentIconResourceService(base.IconResourceService):
    """Harden custom-icon persistence across restarts and repository/app updates.

    The original icon service builds the visible atlas by walking the currently opened
    document and then looking for a generated source image with exactly the same Section
    spelling.  That is intentionally simple, but it makes user icons fragile: a startup
    scan can temporarily miss the target, Section casing can differ, or the generated
    source can be missing while the older custom atlas / synchronized PCX is still
    perfectly usable.

    This wrapper treats icons.json as the durable registry.  Every stored custom icon is
    restored first, independently of the current target list, and missing generated PNGs
    are self-healed from the preserved original, the old custom Tile, or the synchronized
    game PCX when possible.
    """

    @staticmethod
    def _kind_rows(meta: dict[str, Any], kind: str) -> dict[str, Any]:
        rows = meta.get(kind, {})
        return rows if isinstance(rows, dict) else {}

    @staticmethod
    def _cell_size(kind: str) -> tuple[int, int]:
        return base.UNIT_CELL if kind == "unit" else base.COUNTRY_CELL

    @staticmethod
    def _tile_path(kind: str):
        return base.CUSTOM_UNIT_TILE if kind == "unit" else base.CUSTOM_COUNTRY_TILE

    def _atlas_cell(self, kind: str, entry: dict[str, Any]) -> Image.Image | None:
        tile = base._load_image(self._tile_path(kind))
        if tile is None:
            return None
        width, height = self._cell_size(kind)
        try:
            slot = max(0, int(entry.get("slot", 0)))
        except (TypeError, ValueError):
            return None
        col = slot % base.ATLAS_COLUMNS
        row = slot // base.ATLAS_COLUMNS
        left = col * width
        top = row * height
        if left + width > tile.width or top + height > tile.height:
            return None
        cell = tile.crop((left, top, left + width, top + height)).convert("RGBA")
        if cell.getbbox() is None:
            return None
        return cell

    def _stored_custom_image(
        self,
        kind: str,
        target_id: str,
        meta: dict[str, Any] | None = None,
    ) -> Image.Image | None:
        meta = meta or base._read_meta()
        rows = self._kind_rows(meta, kind)
        stored_id, entry = base._entry_for(rows, target_id)
        if stored_id is None or entry is None:
            return None

        generated = base._load_image(base._source_path(kind, stored_id))
        if generated is not None:
            return generated

        width, height = self._cell_size(kind)
        original = base._load_image(base._original_path(kind, stored_id))
        if original is not None:
            crop = base._crop_meta(entry)
            restored = base._crop_image(
                original,
                width,
                height,
                crop["zoom"],
                crop["x"],
                crop["y"],
            )
            base._save_generated_source(kind, stored_id, restored)
            return restored

        # Version-1/partially-updated installs may still have unitTile.png/countryTile.png
        # even when a generated per-object PNG was removed.  Recover that cell before the
        # atlas is ever rebuilt, otherwise the only surviving copy would be overwritten.
        restored = self._atlas_cell(kind, entry)
        if restored is not None:
            base._save_generated_source(kind, stored_id, restored)
            return restored

        # If the user previously enabled “同步到游戏”, the loose PCX is another durable
        # copy.  Recover it even if ArtMD is currently unavailable or the Section/Image
        # mapping changed after the icon was assigned.
        root = self.game_root()
        game_file = str(entry.get("game_file", "")).strip()
        if root is not None and game_file:
            path = base._resolve_relative_case_insensitive(root, game_file)
            if path is not None:
                try:
                    restored = base.read_pcx(path)
                except (OSError, ValueError):
                    restored = None
                if restored is not None:
                    restored = base._normalize_image(restored, width, height)
                    base._save_generated_source(kind, stored_id, restored)
                    return restored
        return None

    def _custom_image(self, kind: str, target_id: str) -> Image.Image | None:
        return self._stored_custom_image(kind, target_id)

    def custom_icon_source(self, kind: str, target_id: str) -> dict[str, Any]:
        clean_kind = str(kind).strip().lower()
        clean_id = str(target_id).strip()
        if clean_kind in {"unit", "country"} and clean_id:
            # Self-heal the generated source first so the base implementation can return
            # the normal source/crop payload without any special frontend path.
            self._stored_custom_image(clean_kind, clean_id)
        return super().custom_icon_source(kind=kind, target_id=target_id)

    def library_snapshot(self) -> dict[str, Any]:
        meta = base._read_meta()
        root = self.game_root()
        doc = self._doc()
        art_path = self.artmd_path()
        artmd = base._load_artmd(art_path) if art_path is not None else base.IniDocument.from_text("")
        targets = self.targets()
        target_by_key = {
            (target["kind"], target["id"].casefold()): target
            for target in targets
        }

        unit_rows: list[tuple[str, Image.Image, str, str]] = []
        country_rows: list[tuple[str, Image.Image, str, str]] = []
        custom_keys: set[tuple[str, str]] = set()

        # Restore durable user entries first.  Do not require the object to already be in
        # the current target scan; this is what makes restart/open timing harmless.
        for kind in ("unit", "country"):
            for stored_id, entry in self._kind_rows(meta, kind).items():
                if not isinstance(entry, dict):
                    continue
                folded_key = (kind, stored_id.casefold())
                if folded_key in custom_keys:
                    continue
                image = self._stored_custom_image(kind, stored_id, meta)
                if image is None:
                    continue
                target = target_by_key.get(folded_key)
                visible_id = target["id"] if target is not None else stored_id
                game_file = str(entry.get("game_file", ""))
                row = (visible_id, image, "custom", game_file)
                (country_rows if kind == "country" else unit_rows).append(row)
                custom_keys.add((kind, visible_id.casefold()))

        # Add Mod/game icons for current document objects that do not have a user icon.
        for target in targets:
            kind = target["kind"]
            target_id = target["id"]
            if (kind, target_id.casefold()) in custom_keys:
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
            "unitTile": base._data_url(unit_tile),
            "countryTile": base._data_url(country_tile),
            "unit": unit_registry,
            "country": country_registry,
            "targets": targets,
            "artmd": self.artmd_snapshot(),
            "gameRoot": str(root) if root else "",
            "customCount": sum(len(self._kind_rows(meta, kind)) for kind in ("unit", "country")),
        }

    def import_custom_icon(self, kind: str, target_id: str, *args: Any, **kwargs: Any) -> dict[str, Any]:
        clean_kind = str(kind).strip().lower()
        clean_id = str(target_id).strip()
        if clean_kind in {"unit", "country"} and clean_id:
            meta = base._read_meta()
            stored_id, _entry = base._entry_for(self._kind_rows(meta, clean_kind), clean_id)
            if stored_id:
                # Reuse the original registry spelling so re-editing cannot create a
                # second icon entry that differs only by Section case.
                clean_id = stored_id
            else:
                target = next(
                    (
                        item for item in self.targets()
                        if item["kind"] == clean_kind and item["id"].casefold() == clean_id.casefold()
                    ),
                    None,
                )
                if target is not None:
                    clean_id = target["id"]
        return super().import_custom_icon(kind=clean_kind, target_id=clean_id, *args, **kwargs)
