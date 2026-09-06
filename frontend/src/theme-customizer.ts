type ThemeMode = 'dark' | 'light'
type ThemePalette = {
  base: string
  accent: string
  effect: string
  textMain: string
  textBright: string
}

const DEFAULTS: Record<ThemeMode, ThemePalette> = {
  dark: {
    base: '#011437',
    accent: '#2ad5b8',
    effect: '#70eeff',
    textMain: '#ffffff',
    textBright: '#7fe8d8',
  },
  light: {
    base: '#dbe8f6',
    accent: '#159f8b',
    effect: '#16a6c7',
    textMain: '#343a40',
    textBright: '#168f9f',
  },
}

const FIELD_META: Array<{ key: keyof ThemePalette; label: string }> = [
  { key: 'base', label: '底色 Base' },
  { key: 'accent', label: '控件亮色 Accent' },
  { key: 'effect', label: '特效色 Effect' },
  { key: 'textMain', label: '普通文本 Text' },
  { key: 'textBright', label: '文本亮色 Text Bright' },
]

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function storageKey(mode: ThemeMode) {
  return `rulesmd.palette.${mode}`
}

function loadPalette(mode: ThemeMode): ThemePalette {
  const fallback = DEFAULTS[mode]
  try {
    const raw = localStorage.getItem(storageKey(mode))
    if (!raw) return { ...fallback }
    const parsed = JSON.parse(raw) as Partial<ThemePalette>
    return {
      base: isHexColor(parsed.base) ? parsed.base : fallback.base,
      accent: isHexColor(parsed.accent) ? parsed.accent : fallback.accent,
      effect: isHexColor(parsed.effect) ? parsed.effect : fallback.effect,
      textMain: isHexColor(parsed.textMain) ? parsed.textMain : fallback.textMain,
      textBright: isHexColor(parsed.textBright) ? parsed.textBright : fallback.textBright,
    }
  } catch {
    return { ...fallback }
  }
}

const palettes: Record<ThemeMode, ThemePalette> = {
  dark: loadPalette('dark'),
  light: loadPalette('light'),
}

function savePalette(mode: ThemeMode) {
  localStorage.setItem(storageKey(mode), JSON.stringify(palettes[mode]))
}

function effectiveMode(app: HTMLElement): ThemeMode {
  return app.dataset.mode === 'light' ? 'light' : 'dark'
}

function currentMode(): ThemeMode {
  const app = document.querySelector<HTMLElement>('.app.tc-theme')
  return app ? effectiveMode(app) : 'dark'
}

function applyPalette() {
  const app = document.querySelector<HTMLElement>('.app.tc-theme')
  if (!app) return
  const mode = effectiveMode(app)
  const palette = palettes[mode]
  const targets = [document.documentElement.style, app.style]

  // Theme customizer owns only the five semantic source colors. Every component and
  // compatibility alias derives its shades from these inputs in theme-contract.css.
  for (const style of targets) {
    style.setProperty('--theme-base', palette.base)
    style.setProperty('--theme-accent', palette.accent)
    style.setProperty('--theme-effect', palette.effect)
    style.setProperty('--theme-text', palette.textMain)
    style.setProperty('--theme-text-bright', palette.textBright)
  }
}

function renderInputs(panel: HTMLElement) {
  const mode = currentMode()
  const palette = palettes[mode]
  panel.dataset.mode = mode
  panel.querySelectorAll<HTMLInputElement>('input[type="color"][data-palette-key]').forEach(input => {
    const key = input.dataset.paletteKey as keyof ThemePalette
    input.value = palette[key]
  })
  const modeText = panel.querySelector<HTMLElement>('.themePaletteModeHint')
  if (modeText) modeText.textContent = mode === 'dark' ? '当前深色配色' : '当前浅色配色'
}

function buildCustomizer(row: HTMLElement) {
  if (row.dataset.themeCustomizerReady === '1') return
  row.dataset.themeCustomizerReady = '1'
  row.classList.add('settingAppearanceRow')

  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'themeCustomizerToggle'
  toggle.textContent = '自定义配色 ▾'
  toggle.setAttribute('aria-expanded', 'false')

  const panel = document.createElement('div')
  panel.className = 'themeCustomizerPanel'
  panel.hidden = true

  const toolbar = document.createElement('div')
  toolbar.className = 'themePaletteToolbar'
  const hint = document.createElement('span')
  hint.className = 'themePaletteModeHint'
  toolbar.append(hint)

  const grid = document.createElement('div')
  grid.className = 'themePaletteGrid'

  for (const meta of FIELD_META) {
    const label = document.createElement('label')
    label.className = 'themePaletteField'
    const text = document.createElement('span')
    text.textContent = meta.label
    const input = document.createElement('input')
    input.type = 'color'
    input.dataset.paletteKey = meta.key
    input.addEventListener('input', () => {
      const mode = currentMode()
      palettes[mode][meta.key] = input.value
      savePalette(mode)
      applyPalette()
    })
    label.append(text, input)
    grid.append(label)
  }

  const footer = document.createElement('div')
  footer.className = 'themePaletteFooter'
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'themePaletteReset'
  reset.textContent = '还原当前配色'
  reset.addEventListener('click', () => {
    const mode = currentMode()
    palettes[mode] = { ...DEFAULTS[mode] }
    savePalette(mode)
    renderInputs(panel)
    applyPalette()
  })
  footer.append(reset)

  toggle.addEventListener('click', () => {
    const nextOpen = panel.hidden
    panel.hidden = !nextOpen
    toggle.setAttribute('aria-expanded', String(nextOpen))
    toggle.textContent = nextOpen ? '自定义配色 ▴' : '自定义配色 ▾'
    if (nextOpen) renderInputs(panel)
  })

  panel.append(toolbar, grid, footer)
  row.append(toggle, panel)
  renderInputs(panel)
}

function attachCustomizer() {
  document.querySelectorAll<HTMLElement>('.settingsDialogBody.settingsGrid .settingRow').forEach(row => {
    const title = row.querySelector<HTMLElement>(':scope > div:first-child > strong')?.textContent?.trim()
    if (title === '外观' || title === '配色') buildCustomizer(row)
  })
}

function refreshAfterUiEvent() {
  requestAnimationFrame(() => {
    applyPalette()
    attachCustomizer()
    document.querySelectorAll<HTMLElement>('.themeCustomizerPanel:not([hidden])').forEach(renderInputs)
  })
}

// The appearance/palette Select above the customizer is the single source of truth for
// which palette is active. The customizer deliberately has no second dark/light switch.
document.addEventListener('click', event => {
  const target = event.target as HTMLElement | null
  if (!target) return
  const button = target.closest<HTMLButtonElement>('button')
  if (button?.title === '设置' || target.closest('.settingsDialogBody')) refreshAfterUiEvent()
}, true)

document.addEventListener('change', event => {
  const target = event.target as HTMLElement | null
  if (target?.closest('.settingsDialogBody')) refreshAfterUiEvent()
}, true)

queueMicrotask(() => {
  applyPalette()
  attachCustomizer()
})
window.addEventListener('storage', () => {
  palettes.dark = loadPalette('dark')
  palettes.light = loadPalette('light')
  applyPalette()
})
