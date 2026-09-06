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
const themeContractOwner = 'theme-contract.css'
const businessCss = allCss.filter(file => file !== settingsOwner && file !== integrationOwner)
const ordinaryBusinessCss = businessCss.filter(file => file !== themeContractOwner)

// RED LINE 0: one CSS loading path only.
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
if (/<link\b[^>]*rel=["']stylesheet["'][^>]*\/src\//i.test(indexHtml) || /<link\b[^>]*\/src\/[^>]*\.css/i.test(indexHtml)) {
  fail('index.html', 'do not load /src/*.css with HTML link tags', 'global CSS must use the module cascade')
}

const polishRaw = read('polish.css')
if (!/^\s*@import\s+["']\.\/app\.css["']\s*;/i.test(polishRaw)) {
  fail('polish.css', 'polish.css must import app.css first', 'missing leading @import ./app.css')
}

const appImports = [...read('app.css').matchAll(/@import\s+["']\.\/([^"']+\.css)["']\s*;/g)].map(match => match[1])

for (const file of appImports) {
  if (!fs.existsSync(path.join(src, file))) {
    fail('app.css', 'every late-layer import must exist', file)
  }
}

const duplicateImports = [...new Set(appImports.filter((file, index) => appImports.indexOf(file) !== index))]
for (const file of duplicateImports) {
  fail('app.css', 'late-layer imports must be unique', file)
}

const requiredLateLayers = [
  'catalog-browser.css',
  'qt-density.css',
  'settings-panel.css',
  'inspector-combined.css',
  'navigation-polish.css',
  'workspace-polish.css',
  'editor-control-grid.css',
  'workspace-final-fixes.css',
  'theme-final.css',
  'theme-contract.css',
  'theme-surface-overrides.css',
  'ui-library-integration.css',
]

for (const file of requiredLateLayers) {
  if (!appImports.includes(file)) {
    fail('app.css', 'required late-layer is missing', file)
  }
}

let previousIndex = -1
for (const file of requiredLateLayers) {
  const index = appImports.indexOf(file)
  if (index < 0) continue
  if (index <= previousIndex) {
    fail('app.css', 'required late-layer relative order changed', requiredLateLayers.join(' -> '))
    break
  }
  previousIndex = index
}

if (appImports.at(-1) !== integrationOwner) {
  fail('app.css', 'UI Library integration must remain the final late layer', `actual last layer: ${appImports.at(-1) || '(none)'}`)
}

// RED LINE 1: settings layout has one owner only.
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
const broadDescendant = /(?:\.settingRow|\.settingsDialogBody)[^,{]*\s+(span|button|input|select|textarea|div|svg|strong|small|em)\b/g
for (const match of settings.matchAll(broadDescendant)) {
  const selector = match[0].replace(/\s+/g, ' ').trim()
  if (!selector.includes('>')) {
    fail(settingsOwner, 'no broad descendant tag selectors in settings', selector)
  }
}

// RED LINE 3: settings CSS may place shared-control roots, but must never reach into internals.
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

// RED LINE 4: ordinary business CSS cannot target .tc-*.
// theme-contract.css is the dedicated variable bridge and is intentionally allowed to
// host the .app.tc-theme contract selector; it still may not style component internals.
for (const file of ordinaryBusinessCss) {
  const text = cssCode(file)
  if (/\.tc-[a-z0-9_-]+/i.test(text)) {
    fail(file, 'shared UI selectors belong only in ui-library-integration.css', 'found .tc-* selector')
  }
}

// RED LINE 5: integration layer may target roots/context, but not component implementation details.
const integration = cssCode(integrationOwner)
containsAny(integrationOwner, integration, [
  '.tc-legacy-switch',
  '.tc-legacy-switch-knob',
  '.tc-select-current',
  '.tc-option-icon',
  '.tc-range::-',
], 'integration CSS must not own shared component internals')

// RED LINE 6: color ownership is centralized. Components receive semantic colors and derive
// local shades; they do not carry independent palettes.
const themeContract = cssCode(themeContractOwner)
for (const token of ['--theme-base', '--theme-accent', '--theme-effect', '--theme-text', '--theme-text-bright']) {
  if (!themeContract.includes(`${token}:`)) {
    fail(themeContractOwner, 'theme contract must define all five source channels', token)
  }
}

const contractManagedCss = [
  'theme-surface-overrides.css',
  'ui-library-integration.css',
  'entity-header-country-badge.css',
]
const hardColor = /#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/ig
for (const file of contractManagedCss) {
  const text = cssCode(file)
  for (const match of text.matchAll(hardColor)) {
    fail(file, 'contract-managed component CSS must not own hard-coded colors', match[0])
  }
}

const customizer = read('theme-customizer.ts')
const allowedPublished = new Set([
  '--theme-base',
  '--theme-accent',
  '--theme-effect',
  '--theme-text',
  '--theme-text-bright',
])
for (const match of customizer.matchAll(/style\.setProperty\(\s*['"](--[^'"]+)['"]/g)) {
  if (!allowedPublished.has(match[1])) {
    fail('theme-customizer.ts', 'theme customizer may publish only the five source color channels', match[1])
  }
}

containsAny(integrationOwner, integration, [
  '--tc-base:',
  '--tc-accent:',
  '--tc-effect:',
  '--tc-text-main:',
  '--tc-text-bright:',
  '--tc-panel:',
  '--tc-panel-2:',
  '--tc-panel-focus:',
  '--tc-row-hover:',
], 'UI Library integration must consume the theme contract, not define its own palette')

if (violations.length) {
  console.error('\n[UI CSS RED LINE] Boundary violations found:\n')
  for (const item of violations) {
    console.error(`- ${item.file}: ${item.rule}`)
    console.error(`  ${item.detail}`)
  }
  console.error('\nSee docs/UI_DEVELOPMENT_RULES.md before changing shared-control CSS.\n')
  process.exit(1)
}

console.log(`[UI CSS] red-line checks passed (${allCss.length} CSS files scanned, ${appImports.length} late layers).`)
