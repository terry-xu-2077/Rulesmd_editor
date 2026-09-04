import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const src = path.join(root, 'src')

const read = file => fs.readFileSync(path.join(src, file), 'utf8')
const cssCode = file => read(file).replace(/\/\*[\s\S]*?\*\//g, '')
const violations = []

function fail(file, rule, detail) {
  violations.push({ file, rule, detail })
}

function containsAny(file, text, tokens, rule) {
  for (const token of tokens) {
    if (text.includes(token)) fail(file, rule, token)
  }
}

const allCss = fs.readdirSync(src).filter(file => file.endsWith('.css')).sort()
const settingsOwner = 'settings-panel.css'
const integrationOwner = 'ui-library-integration.css'
const businessCss = allCss.filter(file => file !== settingsOwner && file !== integrationOwner)

// RED LINE 0: one CSS loading path only.
// The regression seen in the editor header/select popup came from mixing index.html <link>
// styles with Vite module CSS: main.tsx styles were injected later and defeated the intended
// "final" layers. Global late layers now enter through polish.css -> app.css only.
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
if (/<link\b[^>]*rel=["']stylesheet["'][^>]*\/src\//i.test(indexHtml) || /<link\b[^>]*\/src\/[^>]*\.css/i.test(indexHtml)) {
  fail('index.html', 'do not load /src/*.css with HTML link tags', 'global CSS must use the module cascade')
}

const polishRaw = read('polish.css')
if (!/^\s*@import\s+["']\.\/app\.css["']\s*;/i.test(polishRaw)) {
  fail('polish.css', 'polish.css must import app.css first', 'missing leading @import ./app.css')
}

const expectedLateLayers = [
  'catalog-browser.css',
  'qt-density.css',
  'settings-panel.css',
  'inspector-combined.css',
  'navigation-polish.css',
  'workspace-polish.css',
  'editor-control-grid.css',
  'workspace-final-fixes.css',
  'theme-final.css',
  'ui-library-integration.css',
]
const appImports = [...read('app.css').matchAll(/@import\s+["']\.\/([^"']+\.css)["']\s*;/g)].map(match => match[1])
if (appImports.join('\n') !== expectedLateLayers.join('\n')) {
  fail('app.css', 'late-layer CSS order is a maintained contract', `expected: ${expectedLateLayers.join(' -> ')}\n  actual: ${appImports.join(' -> ')}`)
}

// RED LINE 1: settings layout has one owner only.
// The historical .settingRow span leak lived in styles.css; new CSS files are scanned automatically too.
for (const file of [...businessCss, integrationOwner]) {
  const text = cssCode(file)
  containsAny(file, text, [
    '.settingsDialogBody',
    '.settingsSectionTitle',
    '.settingRow',
    '.settingPathRow',
    '.settingsModal',
  ], 'settings styles must live only in settings-panel.css')
}

const settings = cssCode(settingsOwner)

// RED LINE 2: never use broad descendant tag selectors inside settings rows.
// This exact class of selector caused the BoolSwitch / Select vertical drift incident.
const broadDescendant = /(?:\.settingRow|\.settingsDialogBody)[^,{]*\s+(span|button|input|select|textarea|div|svg|strong|small|em)\b/g
for (const match of settings.matchAll(broadDescendant)) {
  const selector = match[0].replace(/\s+/g, ' ').trim()
  if (!selector.includes('>')) {
    fail(settingsOwner, 'no broad descendant tag selectors in settings', selector)
  }
}

// RED LINE 3: settings CSS may place shared-control roots, but must never reach into
// their internal DOM / geometry.
containsAny(settingsOwner, settings, [
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

// RED LINE 4: every ordinary business CSS file is forbidden from targeting .tc-*.
// All contextual shared-control integration belongs in ui-library-integration.css.
for (const file of businessCss) {
  const text = cssCode(file)
  if (/\.tc-[a-z0-9_-]+/i.test(text)) {
    fail(file, 'shared UI selectors belong only in ui-library-integration.css', 'found .tc-* selector')
  }
}

// RED LINE 5: the integration layer may target shared-control roots/context, but must not
// take ownership of known implementation details that caused the previous cascade incident.
const integration = cssCode(integrationOwner)
containsAny(integrationOwner, integration, [
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

console.log(`[UI CSS] red-line checks passed (${allCss.length} CSS files scanned).`)
