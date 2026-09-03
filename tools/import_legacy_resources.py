"""Import reusable data/icon resources from the legacy RulesmdEditor repository.

Run once while preparing a source checkout/package:
    python tools/import_legacy_resources.py

The rewrite intentionally does not import any PyQt5 generated UI/python code.
"""
from pathlib import Path
from urllib.request import urlopen

BASE = "https://raw.githubusercontent.com/terry-xu-2077/RulesmdEditor/master/Resources/"
FILES = [
    "HelpInfor.ini",
    "IdentType.ini",
    "ModDesc.ini",
    "NamesDesc.ini",
    "OptionCategory.ini",
    "OptionsDesc.ini",
    "app.ico",
    "icons-normal.png",
    "ra2md.csf",
    "rulesmd.pre",
]


def main():
    target = Path(__file__).resolve().parents[1] / "src" / "rulesmd_editor" / "resources"
    target.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        print(f"import {name}")
        with urlopen(BASE + name, timeout=30) as response:
            (target / name).write_bytes(response.read())
    print(f"done -> {target}")


if __name__ == "__main__":
    main()
