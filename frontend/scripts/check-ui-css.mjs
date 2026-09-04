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

const businessCss = [
  'styles.css',
  'polish.css',
  'theme-final.css',
  'qt-density.css',
  'workspace-polish.css',
  'workspace-final-fixes.css',
]

// RED LINE 1: settings layout has one owner only.
// styles.css is included because the historical .settingRow span leak lived there.
for (const file of [...businessCss, 'ui-library-integration.css']) {
  const text = read(file)
  containsAny(file, text, [
    '.settingsDialogBody',
    '.settingsSectionTitle',
    '.settingRow',
    '.settingPathRow',
    '.settingsModal',
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

// RED LINE 4: business CSS never targets shared UI classes. All contextual .tc-* rules
// belong in ui-library-integration.css; component internals belong in the UI Library repo.
for (const file of businessCss) {
  const text = read(file)
  if (/\.tc-[a-z0-9_-]+/i.test(text)) {
    fail(file, 'shared UI selectors belong only in ui-library-integration.css', 'found .tc-* selector')
  }
}

// RED LINE 5: the integration layer may target shared-control roots/context, but must not
// style implementation details that have no business-slot responsibility.
const integration = read('ui-library-integration.css')
containsAny('ui-library-integration.css', integration, [
  '.tc-legacy-switch',
  '.tc-legacy-switch-knob',
  '.tc-select-current',
  '.tc-option-icon',
  '.tc-range::-',
], 'integration CSS must not own shared component internals')

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
