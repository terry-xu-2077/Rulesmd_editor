import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const src = path.join(root, 'src')

const read = file => fs.readFileSync(path.join(src, file), 'utf8')
const violations = []

function fail(file, rule, detail) {
  violations.push({ file, rule, detail })
}

function containsAny(file, text, tokens, rule) {
  for (const token of tokens) {
    if (text.includes(token)) fail(file, rule, token)
  }
}

// RED LINE 1: settings layout has one owner only.
for (const file of ['polish.css', 'theme-final.css', 'ui-library-integration.css']) {
  const text = read(file)
  containsAny(file, text, [
    '.settingsDialogBody',
    '.settingsSectionTitle',
    '.settingRow',
    '.settingPathRow',
  ], 'settings styles must live only in settings-panel.css')
}

const settings = read('settings-panel.css')

// RED LINE 2: never use broad descendant tag selectors inside settings rows.
// This exact class of selector caused the BoolSwitch / Select vertical drift incident.
const broadDescendant = /(?:\.settingRow|\.settingsDialogBody)[^,{]*\s+(span|button|input|select|textarea|div|svg|strong|small|em)\b/g
for (const match of settings.matchAll(broadDescendant)) {
  const selector = match[0].replace(/\s+/g, ' ').trim()
  if (!selector.includes('>')) {
    fail('settings-panel.css', 'no broad descendant tag selectors in settings', selector)
  }
}

// RED LINE 3: business settings CSS may place shared-control roots, but must never
// reach into their internal DOM / geometry.
containsAny('settings-panel.css', settings, [
  '.tc-legacy-switch',
  '.tc-legacy-switch-knob',
  '.tc-select-button',
  '.tc-select-current',
  '.tc-select-item',
  '.tc-option-icon',
  '.tc-range',
  '.tc-number',
  '.tc-reset',
  '.tc-pop',
  '.tc-picker',
], 'settings CSS must not style UI Library internals')

// RED LINE 4: the final business theme cannot recolor or reshape shared controls.
// Terry_React_UI_Library owns dark/light component theming.
const themeFinal = read('theme-final.css')
if (/\.tc-[a-z0-9_-]+/i.test(themeFinal)) {
  fail('theme-final.css', 'business theme must not target .tc-* shared controls', 'found .tc-* selector')
}

if (violations.length) {
  console.error('\n[UI CSS RED LINE] Boundary violations found:\n')
  for (const item of violations) {
    console.error(`- ${item.file}: ${item.rule}`)
    console.error(`  ${item.detail}`)
  }
  console.error('\nSee docs/UI_DEVELOPMENT_RULES.md before changing shared-control CSS.\n')
  process.exit(1)
}

console.log('[UI CSS] red-line checks passed.')
