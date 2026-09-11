from pathlib import Path

path = Path("frontend/src/main.tsx")
text = path.read_text(encoding="utf-8")
bad = ".join('" + "\n" + "')"
good = ".join('\\n')"
if bad not in text:
    raise SystemExit("broken clipboard newline literal not found")
path.write_text(text.replace(bad, good, 1), encoding="utf-8")
