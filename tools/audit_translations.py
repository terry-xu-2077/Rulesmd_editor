from __future__ import annotations

"""Report presentation labels that still need a source-backed Chinese translation.

Run after rules resources are prepared:
    python tools/audit_translations.py

The audit never edits data.  It is intentionally conservative: a remaining engine ID is
reported rather than guessed so translation work can be tied back to legacy INIs or docs.
"""

import re
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from rulesmd_editor.runtime_catalog import RuntimeSchemaCatalog  # noqa: E402


def has_cjk(text: str) -> bool:
    return bool(re.search(r"[\u3400-\u9fff]", text))


def main() -> None:
    catalog = RuntimeSchemaCatalog()

    option_gaps = []
    for key, meta in sorted(catalog.options.items(), key=lambda item: item[0].casefold()):
        label = (meta.description or "").strip()
        if not label or label.casefold() == key.casefold() or not has_cjk(label):
            option_gaps.append((key, label, meta.help_text[:80].replace("\n", " ")))

    name_gaps = []
    for key, label in sorted(catalog.name_desc.items(), key=lambda item: item[0].casefold()):
        value = (label or "").strip()
        if not value or value.casefold() == key.casefold() or not has_cjk(value):
            name_gaps.append((key, value))

    print(f"Parameter translation gaps: {len(option_gaps)}")
    for key, label, help_text in option_gaps:
        print(f"  {key:36} | {label or '<blank>':28} | {help_text}")

    print(f"\nObject/name translation gaps: {len(name_gaps)}")
    for key, label in name_gaps:
        print(f"  {key:36} | {label or '<blank>'}")

    print("\nAdd verified fixes to src/rulesmd_editor/translations_zh.py; never rename engine keys.")


if __name__ == "__main__":
    main()
