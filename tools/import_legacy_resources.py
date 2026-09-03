"""Import reusable data resources from the legacy desktop and web editors.

The old web editor's desc/OptionsDesc.ini is authoritative for how an option key
maps to a single-select list, multi-select list, or dynamic unit list.  These files
are source material only; runtime code consumes generated JSON when available.
"""
from __future__ import annotations

from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "src" / "rulesmd_editor" / "resources" / "legacy"

DESKTOP_BASE = "https://raw.githubusercontent.com/terry-xu-2077/RulesmdEditor/master/Resources/"
WEB_DESC_BASE = "https://raw.githubusercontent.com/terry-xu-2077/RulesmdEditorWeb/main/desc/"

DESKTOP_FILES = [
    "HelpInfor.ini",
    "IdentType.ini",
    "ModDesc.ini",
    "NamesDesc.ini",
    "OptionCategory.ini",
    "OptionsDesc.ini",
    "rulesmd.pre",
]
WEB_FILES = ["OptionsDesc.ini", "NamesDesc.ini", "HelpInfor.ini"]


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 0:
        return
    print(f"import {target.relative_to(ROOT)}")
    with urlopen(url, timeout=45) as response:
        target.write_bytes(response.read())


def main() -> None:
    for name in DESKTOP_FILES:
        download(DESKTOP_BASE + name, TARGET / "desktop" / name)
    for name in WEB_FILES:
        download(WEB_DESC_BASE + name, TARGET / "web" / name)
    print(f"done -> {TARGET}")


if __name__ == "__main__":
    main()
