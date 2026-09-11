from pathlib import Path

path = Path('frontend/src/main.tsx')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        "import { countryIconStyle, hasUnitIcon, unitIconStyle } from './ra2VisualIcons'",
        "import { countryIconStyle, hasUnitIcon, resolveVisualIcon, unitIconStyle } from './ra2VisualIcons'",
    ),
    (
        "function optionVisualIcon(value: string) {\n  const country = countryIconStyle(value, 32)\n  if (country) return <span className=\"rulesCountryOptionIcon\" style={country}/>\n  if (hasUnitIcon(value)) return <span className=\"rulesUnitOptionIcon\" style={unitIconStyle(value, 32)}/>\n  return undefined\n}\n\nfunction referenceOptionIcon(value: string, kind: ReferenceKind = 'generic') {\n  const visual = optionVisualIcon(value)\n",
        "function optionVisualIcon(value: string, category?: string) {\n  return resolveVisualIcon(value, { category, size: 32 })\n}\n\nfunction referenceOptionIcon(value: string, kind: ReferenceKind = 'generic', category?: string) {\n  const visual = optionVisualIcon(value, category)\n",
    ),
    (
        "  referenceRows = [],\n  observedKeyValues = [],",
        "  referenceRows = [],\n  visualRows = [],\n  observedKeyValues = [],",
    ),
    (
        "  referenceRows?: SectionRow[]\n  observedKeyValues?: string[]",
        "  referenceRows?: SectionRow[]\n  visualRows?: SectionRow[]\n  observedKeyValues?: string[]",
    ),
    (
        "  const raw = option.raw_value ?? undefined\n  const referenceKind = referenceKindForOption(option)\n",
        "  const raw = option.raw_value ?? undefined\n  const referenceKind = referenceKindForOption(option)\n  const visualRowById = new Map(visualRows.map(row => [row.id.toLowerCase(), row]))\n  const visualCategory = (value: string) => visualRowById.get(value.toLowerCase())?.category\n  const visualIconForValue = (value: string) => optionVisualIcon(value, visualCategory(value))\n",
    ),
    (
        "icon: optionVisualIcon(value.value)",
        "icon: visualIconForValue(value.value)",
    ),
    (
        "icon: semanticIcon ? referenceOptionIcon(value.value, referenceKind) : optionVisualIcon(value.value),",
        "icon: semanticIcon ? referenceOptionIcon(value.value, referenceKind, visualCategory(value.value)) : visualIconForValue(value.value),",
    ),
    (
        "icon: semanticIcon ? referenceOptionIcon(option.value, referenceKind) : optionVisualIcon(option.value) })",
        "icon: semanticIcon ? referenceOptionIcon(option.value, referenceKind, visualCategory(option.value)) : visualIconForValue(option.value) })",
    ),
    (
        "icon: referenceOptionIcon(row.id, referenceKind) }))",
        "icon: referenceOptionIcon(row.id, referenceKind, row.category) }))",
    ),
    (
        "icon: referenceOptionIcon(option.value, referenceKind) })",
        "icon: referenceOptionIcon(option.value, referenceKind, visualCategory(option.value)) })",
    ),
    (
        "<FieldControl option={option} disabled={Boolean(option.disabled)} referenceRows={candidates} observedKeyValues=",
        "<FieldControl option={option} disabled={Boolean(option.disabled)} referenceRows={candidates} visualRows={rows} observedKeyValues=",
    ),
]

for old, new in replacements:
    if old not in text:
        raise RuntimeError(f'Expected source fragment not found:\n{old[:180]}')
    text = text.replace(old, new)

path.write_text(text, encoding='utf-8', newline='')
print('Patched category-aware menu icons in frontend/src/main.tsx')
