from __future__ import annotations

import json
from pathlib import Path

from .ini_document import IniDocument
from .schema import ARES_OPTIONS, OptionMeta, SchemaCatalog

RESOURCE_ROOT = Path(__file__).resolve().parent / "resources"
LEGACY_DIR = RESOURCE_ROOT / "legacy"
GENERATED_DIR = RESOURCE_ROOT / "generated"


class RuntimeSchemaCatalog(SchemaCatalog):
    """Schema catalog optimized for the desktop editor runtime.

    The generated JSON is the normal fast path. Legacy INI parsing is retained only as
    a development/backwards-compatible fallback when the resource compiler has not run.
    """

    def __init__(self, resource_root: Path | None = None):
        root = resource_root or RESOURCE_ROOT
        self.resource_dir = root
        self.options: dict[str, OptionMeta] = dict(ARES_OPTIONS)
        self.name_desc: dict[str, str] = {}

        generated = root / "generated"
        schema_path = generated / "rules_schema.json"
        names_path = generated / "section_names.json"
        if schema_path.exists():
            self._load_compiled(schema_path)
            if names_path.exists():
                try:
                    data = json.loads(names_path.read_text("utf-8"))
                    if isinstance(data, dict):
                        self.name_desc.update({str(k): str(v) for k, v in data.items()})
                except (OSError, ValueError, TypeError):
                    pass
        else:
            legacy = root / "legacy"
            # Compatibility with older checkouts that imported resources directly into
            # resources/ rather than resources/legacy/.
            source = legacy if legacy.exists() else root
            self._load_legacy(source)
            self._load_json_overlay()

    def _load_compiled(self, path: Path) -> None:
        try:
            payload = json.loads(path.read_text("utf-8"))
        except (OSError, ValueError, TypeError):
            return
        options = payload.get("options", {}) if isinstance(payload, dict) else {}
        if not isinstance(options, dict):
            return
        for key, row in options.items():
            if not isinstance(row, dict):
                continue
            old = self.options.get(key)
            values = row.get("values", [])
            normalized_values: list[tuple[str, str]] = []
            if isinstance(values, list):
                for item in values:
                    if isinstance(item, dict):
                        normalized_values.append((str(item.get("value", "")), str(item.get("label", ""))))
                    elif isinstance(item, (list, tuple)) and len(item) >= 2:
                        normalized_values.append((str(item[0]), str(item[1])))
            self.options[key] = OptionMeta(
                name=key,
                description=str(row.get("description", old.description if old else "")),
                help_text=str(row.get("help", old.help_text if old else "")),
                category=str(row.get("category", old.category if old else "特殊")),
                source=str(row.get("source", old.source if old else "YR")),
                values=tuple(normalized_values) or (old.values if old else ()),
                value_type=str(row.get("value_type", old.value_type if old else "text")),
                applies_to=tuple(str(v) for v in row.get("applies_to", old.applies_to if old else ())),
                default=str(row.get("default", old.default if old else "")),
                docs=str(row.get("docs", old.docs if old else "")),
            )


def new_rules_document(resource_root: Path | None = None) -> IniDocument:
    """Create a new document from the cleaned Yuri's Revenge 1.001 template."""
    root = resource_root or RESOURCE_ROOT
    generated = root / "generated" / "rulesmd.template.ini"
    if generated.exists():
        text = generated.read_text("utf-8")
        doc = IniDocument.from_text(text, encoding="utf-8")
        doc.newline = "\r\n"
        doc.final_newline = True
        doc.dirty = False
        return doc

    # Development fallback: if the legacy pre-file exists but generated resources are
    # missing, build an equivalent template in memory rather than silently returning an
    # empty two-line file.
    legacy_candidates = (root / "legacy" / "rulesmd.pre", root / "rulesmd.pre")
    for legacy in legacy_candidates:
        if not legacy.exists():
            continue
        data = legacy.read_bytes()
        for encoding in ("utf-8-sig", "utf-8", "gb18030", "cp1252"):
            try:
                text = data.decode(encoding)
                break
            except UnicodeDecodeError:
                text = ""
        if text:
            try:
                # Imported lazily to keep the normal application startup independent
                # of tooling modules.
                from tools.build_rule_resources import modenc_clean_template
                cleaned, _ = modenc_clean_template(text)
                doc = IniDocument.from_text(cleaned, encoding="utf-8")
                doc.newline = "\r\n"
                doc.dirty = False
                return doc
            except Exception:
                pass

    return IniDocument.new()
