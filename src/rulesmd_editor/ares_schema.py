from __future__ import annotations

import json
from pathlib import Path

from .schema import OptionMeta


ARES_SCHEMA_PATH = Path(__file__).resolve().parent / "resources" / "generated" / "ares_schema.json"


class AresSchemaCatalog:
    """Dedicated Ares metadata catalog.

    Ares rules are intentionally kept separate from the original Yuri's Revenge
    schema. The desktop runtime may merge both catalogs for a unified UI, but source
    data, applicability rules and future Ares-version updates live here only.
    """

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or ARES_SCHEMA_PATH
        self.options: dict[str, OptionMeta] = {}
        self.version = "3.x"
        self.docs_root = "https://ares-developers.github.io/Ares-docs/"
        self._load()

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

    def option(self, key: str) -> OptionMeta | None:
        if key in self.options:
            return self.options[key]
        folded = key.casefold()
        for name, meta in self.options.items():
            if name.casefold() == folded:
                return meta
        if folded.startswith("prerequisite.list") and folded[len("prerequisite.list"):].isdigit():
            return self.options.get("Prerequisite.List#")
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
