from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

for path in (ROOT / "frontend" / "src").rglob("*"):
    if path.suffix.lower() not in {".ts", ".tsx"}:
        continue
    text = path.read_text(encoding="utf-8-sig")
    fixed = text.replace("./previousIcons", "./ra2VisualIcons")
    if fixed != text:
        path.write_text(fixed, encoding="utf-8", newline="")
        print(f"fixed {path.relative_to(ROOT)}")

portable = (ROOT / "scripts" / "build-portable.ps1").read_text(encoding="utf-8-sig")
if "Copy-Item -Path (Join-Path $Resources '*')" in portable:
    raise RuntimeError("portable build still copies the entire development resources directory")
if "source_ini" in portable.lower():
    raise RuntimeError("portable build should not reference the development source INI directory")
if "ares_hardcode_unlocks.json" not in portable or "Join-Path $Resources 'generated'" not in portable:
    raise RuntimeError("portable runtime resource copy contract is incomplete")

for path in (ROOT / "frontend" / "src").rglob("*"):
    if path.is_file() and path.suffix.lower() in {".ts", ".tsx"}:
        text = path.read_text(encoding="utf-8-sig")
        if "previousIcons" in text:
            raise RuntimeError(f"stale icon import in {path.relative_to(ROOT)}")

print("post-migration checks passed")
