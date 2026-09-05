from __future__ import annotations

from dataclasses import replace
import json
from pathlib import Path

from .schema import OptionMeta


RESOURCE_ROOT = Path(__file__).resolve().parent / "resources"
ARES_SCHEMA_PATH = RESOURCE_ROOT / "generated" / "ares_schema.json"
ARES_HARDCODE_UNLOCKS_PATH = RESOURCE_ROOT / "ares_hardcode_unlocks.json"
UNLOCK_ICON = "🔓︎"  # U+FE0E text presentation: keep the icon flat/monochrome instead of emoji-style.


class AresSchemaCatalog:
    """Dedicated Ares metadata catalog.

    Ares rules are intentionally kept separate from the original Yuri's Revenge
    schema. The desktop runtime may merge both catalogs for a unified UI, but source
    data, applicability rules and future Ares-version updates live here only.

    Curated hard-code unlock notes are maintained separately from generated metadata.
    This lets the editor explain *why* a tag matters without losing that information
    when the upstream Ares schema is regenerated.
    """

    def __init__(self, path: Path | None = None, unlocks_path: Path | None = None) -> None:
        self.path = path or ARES_SCHEMA_PATH
        self.unlocks_path = unlocks_path or ARES_HARDCODE_UNLOCKS_PATH
        self.options: dict[str, OptionMeta] = {}
        self.version = "3.x"
        self.docs_root = "https://ares-developers.github.io/Ares-docs/"
        self._unlock_rows: dict[str, dict[str, object]] = {}
        self._load()
        self._load_hardcode_unlocks()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            payload = json.loads(self.path.read_text("utf-8"))
        except Exception:
            return
        self.version = str(payload.get("ares_version", self.version))
        self.docs_root = str(payload.get("docs_root", self.docs_root))
        for key, row in payload.get("options", {}).items():
            values = tuple(
                (str(item.get("value", "")), str(item.get("label") or item.get("value", "")))
                for item in row.get("values", [])
            )
            self.options[key] = OptionMeta(
                name=key,
                description=str(row.get("description", "")),
                help_text=str(row.get("help", "")),
                category=str(row.get("category", "Ares")),
                source="Ares",
                values=values,
                value_type=str(row.get("value_type", "text")),
                applies_to=tuple(str(x) for x in row.get("applies_to", [])),
                default=str(row.get("default", "")),
                docs=str(row.get("docs", "")),
            )

    @staticmethod
    def _unlock_help(row: dict[str, object]) -> str:
        parts = [f"{UNLOCK_ICON}【Ares 解除原版硬编码】"]
        vanilla = str(row.get("vanilla_limit", "")).strip()
        unlock = str(row.get("ares_unlock", "")).strip()
        notes = str(row.get("notes", "")).strip()
        if vanilla:
            parts.append(f"原版限制：{vanilla}")
        if unlock:
            parts.append(f"Ares 解锁：{unlock}")
        if notes:
            parts.append(f"注意：{notes}")
        return "\n".join(parts)

    def _row_for_key(self, key: str) -> dict[str, object] | None:
        folded = key.casefold()
        for name, row in self._unlock_rows.items():
            if name.casefold() == folded:
                return row
        if folded.startswith("prerequisite.list") and folded[len("prerequisite.list"):].isdigit():
            return self._unlock_rows.get("Prerequisite.List#")
        if folded.startswith("weaponturretindex") and folded[len("weaponturretindex"):].isdigit():
            return self._unlock_rows.get("WeaponTurretIndex#")
        if folded.startswith("versus.") and len(folded) > len("versus."):
            return self._unlock_rows.get("Versus.*")
        return None

    def _load_hardcode_unlocks(self) -> None:
        if not self.unlocks_path.exists():
            return
        try:
            payload = json.loads(self.unlocks_path.read_text("utf-8"))
        except Exception:
            return
        raw_rows = payload.get("options", {})
        if not isinstance(raw_rows, dict):
            return
        self._unlock_rows = {
            str(key): row
            for key, row in raw_rows.items()
            if isinstance(row, dict)
        }

        # Overlay generated Ares metadata, and also inject curated tags that are missing
        # from the generated snapshot. The generated file remains the broad catalog;
        # this curated file only owns hard-code-unlock semantics and a few essential tags.
        for key, row in self._unlock_rows.items():
            if key.endswith(("#", "*")):
                continue
            current = self.option(key)
            if current is None:
                current = OptionMeta(name=key, source="Ares")
            self.options[key] = self._apply_unlock_row(current, row)

    def _apply_unlock_row(self, meta: OptionMeta, row: dict[str, object]) -> OptionMeta:
        base_help = str(row.get("help", meta.help_text)).strip()
        unlock_help = self._unlock_help(row)
        help_text = f"{base_help}\n\n{unlock_help}" if base_help else unlock_help
        description = str(row.get("description", meta.description)).strip() or meta.name
        if not description.startswith("🔓"):
            description = f"{UNLOCK_ICON} {description}"
        values = meta.values
        if "values" in row:
            values = tuple(
                (str(item.get("value", "")), str(item.get("label") or item.get("value", "")))
                for item in row.get("values", [])
                if isinstance(item, dict)
            )
        applies_to = meta.applies_to
        if "applies_to" in row:
            applies_to = tuple(str(item) for item in row.get("applies_to", []))
        return replace(
            meta,
            description=description,
            help_text=help_text,
            category=str(row.get("category", meta.category or "Ares")),
            values=values,
            value_type=str(row.get("value_type", meta.value_type or "text")),
            applies_to=applies_to,
            default=str(row.get("default", meta.default)),
            docs=str(row.get("docs", meta.docs)),
        )

    def enrich(self, meta: OptionMeta) -> OptionMeta:
        """Attach curated hard-code-unlock help to either YR or Ares metadata."""
        row = self._row_for_key(meta.name)
        return self._apply_unlock_row(meta, row) if row else meta

    def is_hardcode_unlock(self, key: str) -> bool:
        return self._row_for_key(key) is not None

    def option(self, key: str) -> OptionMeta | None:
        if key in self.options:
            return self.options[key]
        folded = key.casefold()
        for name, meta in self.options.items():
            if name.casefold() == folded:
                return meta
        if folded.startswith("prerequisite.list") and folded[len("prerequisite.list"):].isdigit():
            base = self.options.get("Prerequisite.List#")
            return self.enrich(replace(base, name=key)) if base else None
        if folded.startswith("weaponturretindex") and folded[len("weaponturretindex"):].isdigit():
            row = self._unlock_rows.get("WeaponTurretIndex#")
            return self._apply_unlock_row(OptionMeta(name=key, source="Ares"), row) if row else None
        if folded.startswith("versus.") and len(folded) > len("versus."):
            row = self._unlock_rows.get("Versus.*")
            return self._apply_unlock_row(OptionMeta(name=key, source="Ares"), row) if row else None
        return None

    def available_options(self, *, query: str = "", applies_to: str | None = None) -> list[OptionMeta]:
        q = query.strip().casefold()
        result: list[OptionMeta] = []
        for meta in self.options.values():
            if applies_to and applies_to not in meta.applies_to and "TechnoType" not in meta.applies_to:
                continue
            if q:
                haystack = " ".join((meta.name, meta.description, meta.help_text, meta.category)).casefold()
                if q not in haystack:
                    continue
            result.append(meta)
        return sorted(result, key=lambda item: (item.category, item.description or item.name, item.name))
