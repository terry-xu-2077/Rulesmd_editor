from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8-sig")


def write(rel: str, text: str) -> None:
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="")


def replace_many(rel: str, replacements: list[tuple[str, str]]) -> None:
    text = read(rel)
    original = text
    for old, new in replacements:
        text = text.replace(old, new)
    if text == original:
        print(f"unchanged {rel}")
    else:
        write(rel, text)
        print(f"updated   {rel}")


def rename(rel_from: str, rel_to: str) -> None:
    src = ROOT / rel_from
    dst = ROOT / rel_to
    if not src.exists():
        raise FileNotFoundError(src)
    dst.parent.mkdir(parents=True, exist_ok=True)
    src.replace(dst)
    print(f"renamed   {rel_from} -> {rel_to}")


def clean_remaining_term(text: str) -> str:
    def repl(match: re.Match[str]) -> str:
        value = match.group(0)
        if value.isupper():
            return "PREVIOUS"
        if value[:1].isupper():
            return "Previous"
        return "previous"
    return re.sub(r"legacy", repl, text, flags=re.IGNORECASE)


# Rulesmd-specific RA2 visual registry. The rendering engine itself lives in the UI library.
rename("frontend/src/legacyIcons.ts", "frontend/src/ra2VisualIcons.ts")
replace_many("frontend/src/ra2VisualIcons.ts", [
    ("LEGACY_ICON_TILE", "RA2_ICON_TILE"),
    ("LEGACY_COUNTRY_TILE", "COUNTRY_ICON_TILE"),
    ("hasLegacyIcon", "hasUnitIcon"),
    ("legacyIconStyle", "unitIconStyle"),
    ("/legacy/", "/game-assets/"),
    ("legacy", "source"),
    ("Legacy", "Source"),
])

# Frontend API / CSS terminology.
replace_many("frontend/src/main.tsx", [
    ("legacyGeneralGroup", "generalGroupForOption"),
    ("./legacyIcons", "./ra2VisualIcons"),
    ("hasLegacyIcon", "hasUnitIcon"),
    ("legacyIconStyle", "unitIconStyle"),
    ("LegacyUnitIcon", "UnitArtworkIcon"),
    ("legacyUnitIcon", "unitArtworkIcon"),
    ("/legacy/", "/game-assets/"),
])
replace_many("frontend/src/UnitTree.tsx", [
    ("isLegacyGlobalSubsection", "isGlobalSubsection"),
    ("./legacyIcons", "./ra2VisualIcons"),
    ("hasLegacyIcon", "hasUnitIcon"),
    ("legacyIconStyle", "unitIconStyle"),
    ("legacyType", "typeLevel"),
    ("legacyLeaves", "unitLeavesList"),
])
replace_many("frontend/src/generalGroups.ts", [
    ("GENERAL_LEGACY_VIEWS", "GENERAL_NAVIGATION_VIEWS"),
    ("GeneralLegacyViewLabel", "GeneralNavigationViewLabel"),
    ("generalLegacyView", "generalNavigationView"),
    ("isLegacyGlobalSubsection", "isGlobalSubsection"),
    ("matchesLegacyGeneralFilter", "matchesGeneralViewFilter"),
    ("legacyGeneralGroup", "generalGroupForOption"),
    ("legacy", "compatibility"),
    ("Legacy", "Compatibility"),
])

for path in (ROOT / "frontend" / "src").rglob("*"):
    if path.suffix.lower() not in {".ts", ".tsx", ".css", ".md"}:
        continue
    text = path.read_text(encoding="utf-8-sig")
    changed = (text
        .replace("legacyUnitIcon", "unitArtworkIcon")
        .replace("legacyType", "typeLevel")
        .replace("legacyLeaves", "unitLeavesList")
        .replace("/legacy/", "/game-assets/"))
    if changed != text:
        path.write_text(changed, encoding="utf-8", newline="")
        print(f"updated   {path.relative_to(ROOT)}")

# Development source INIs are source material only; runtime consumes generated artifacts.
replace_many("tools/build_rule_resources.py", [
    ("legacy INI files", "source INI files"),
    ("legacy text resources", "source text resources"),
    ("LEGACY_DIR", "SOURCE_INI_DIR"),
    ('RESOURCE_ROOT / "legacy"', 'RESOURCE_ROOT / "source_ini"'),
    ("unsupported legacy resource encoding", "unsupported source resource encoding"),
    ("legacy", "source"),
    ("Legacy", "Source"),
])

rename("tools/import_legacy_resources.py", "tools/import_source_resources.py")
replace_many("tools/import_source_resources.py", [
    ("legacy desktop and web editors", "desktop and web editor source repositories"),
    ('/ "legacy"', '/ "source_ini"'),
    ("legacy", "source"),
    ("Legacy", "Source"),
])

# Development launcher: only generated runtime metadata is required for startup.
replace_many("scripts/start-dev.ps1", [
    ("$LegacyAssets", "$GameAssets"),
    ("public\\legacy", "public\\game-assets"),
    ("$LegacyHelp = Join-Path $Root 'src\\rulesmd_editor\\resources\\legacy\\HelpInfor.ini'\n", ""),
    ("$LegacyNames = Join-Path $Root 'src\\rulesmd_editor\\resources\\legacy\\NamesDesc.ini'\n", ""),
    ("Sync-LegacyAsset", "Sync-GameAsset"),
    ("Legacy UI:", "Game UI:"),
    ("legacy asset", "game asset"),
    ("$LegacyBase", "$GameAssetBase"),
    ("Synchronizing legacy RulesmdEditorWeb UI assets", "Synchronizing RulesmdEditorWeb game UI assets"),
    ("(-not (Test-Path $RuleSchema)) -or (-not (Test-Path $LegacyHelp)) -or (-not (Test-Path $LegacyNames))", "(-not (Test-Path $RuleSchema))"),
])

# Portable build: source INIs may exist locally for development, but never enter the package.
portable = read("scripts/build-portable.ps1")
portable = portable.replace("$LegacyHelp = Join-Path $Resources 'legacy\\HelpInfor.ini'\n", "")
portable = portable.replace("$LegacyNames = Join-Path $Resources 'legacy\\NamesDesc.ini'\n", "")
portable = portable.replace("$LegacyAssets", "$GameAssets")
portable = portable.replace("public\\legacy", "public\\game-assets")
portable = portable.replace("$PackageLegacyHelp = Join-Path $PackageResources 'legacy\\HelpInfor.ini'\n", "")
portable = portable.replace("Sync-LegacyAsset", "Sync-GameAsset")
portable = portable.replace("Ensure-LegacyAssets", "Ensure-GameAssets")
portable = portable.replace("legacy UI assets", "game UI assets")
portable = portable.replace("legacy asset", "game asset")
portable = portable.replace("$required = @($RuleTemplate, $RuleSchema, $LegacyHelp, $LegacyNames)", "$required = @($RuleTemplate, $RuleSchema)")
portable = portable.replace("        $PackageLegacyHelp,\n", "")
portable = portable.replace(
    "    Copy-Item -Path (Join-Path $Resources '*') -Destination $PackageResources -Recurse -Force\n",
    "    Copy-Item -LiteralPath (Join-Path $Resources 'generated') -Destination $PackageResources -Recurse -Force\n"
    "    Copy-Item -LiteralPath (Join-Path $Resources 'ares_hardcode_unlocks.json') -Destination $PackageResources -Force\n",
)
marker = "    if ($missingPackagedResources.Count -gt 0) {\n        Fail \"Portable resources are incomplete:`n$($missingPackagedResources -join \"`n\")\"\n    }\n"
insert = marker + "\n    $resourceRootItems = @(Get-ChildItem -LiteralPath $PackageResources -Force)\n    $unexpectedResources = @($resourceRootItems | Where-Object { $_.Name -notin @('generated', 'ares_hardcode_unlocks.json') })\n    if ($unexpectedResources.Count -gt 0) {\n        Fail \"Portable resources contain development/source files: $($unexpectedResources.Name -join ', ')\"\n    }\n"
if marker not in portable:
    raise RuntimeError("portable resource validation marker not found")
portable = portable.replace(marker, insert, 1)
write("scripts/build-portable.ps1", portable)
print("updated   scripts/build-portable.ps1")

# Make the same boundary explicit for Python wheel builds.
pyproject = read("pyproject.toml")
if "[tool.hatch.build]\n" not in pyproject:
    pyproject += "\n[tool.hatch.build]\nexclude = [\n  \"src/rulesmd_editor/resources/source_ini/**\",\n]\n"
write("pyproject.toml", pyproject)
print("updated   pyproject.toml")

# Remaining occurrences are descriptive carry-over only; normalize them consistently.
for rel in ["frontend/src", "scripts"]:
    for path in (ROOT / rel).rglob("*"):
        if not path.is_file() or path.suffix.lower() not in {".ts", ".tsx", ".css", ".ps1", ".md"}:
            continue
        text = path.read_text(encoding="utf-8-sig")
        cleaned = clean_remaining_term(text)
        if cleaned != text:
            path.write_text(cleaned, encoding="utf-8", newline="")
            print(f"cleaned   {path.relative_to(ROOT)}")

print("terminology migration complete")
