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

function applyPalette() {
  const app = document.querySelector<HTMLElement>('.app.tc-theme')
  if (!app) return
  const mode = effectiveMode(app)
  const palette = palettes[mode]
  const targets = [document.documentElement.style, app.style]

  for (const style of targets) {
    style.setProperty('--tc-base', palette.base)
    style.setProperty('--tc-accent', palette.accent)
    style.setProperty('--tc-effect', palette.effect)
    style.setProperty('--tc-text-main', palette.textMain)
    style.setProperty('--tc-text-bright', palette.textBright)
  }

  app.style.setProperty('--bg', palette.base)
  app.style.setProperty('--text', palette.textMain)
  app.style.setProperty('--accent', palette.effect)
  app.style.setProperty('--teal', palette.accent)
}

let editingMode: ThemeMode = 'dark'

function renderInputs(panel: HTMLElement) {
  const palette = palettes[editingMode]
  panel.querySelectorAll<HTMLInputElement>('input[type="color"][data-palette-key]').forEach(input => {
    const key = input.dataset.paletteKey as keyof ThemePalette
    input.value = palette[key]
  })
  panel.querySelectorAll<HTMLButtonElement>('.themePaletteModeButton').forEach(button => {
    button.classList.toggle('active', button.dataset.mode === editingMode)
  })
  const modeText = panel.querySelector<HTMLElement>('.themePaletteModeHint')
  if (modeText) modeText.textContent = editingMode === 'dark' ? '正在编辑深色配色' : '正在编辑浅色配色'
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

  const darkButton = document.createElement('button')
  darkButton.type = 'button'
  darkButton.className = 'themePaletteModeButton'
  darkButton.dataset.mode = 'dark'
  darkButton.textContent = '深色配色'

  const lightButton = document.createElement('button')
  lightButton.type = 'button'
  lightButton.className = 'themePaletteModeButton'
  lightButton.dataset.mode = 'light'
  lightButton.textContent = '浅色配色'

  const hint = document.createElement('span')
  hint.className = 'themePaletteModeHint'

  toolbar.append(darkButton, lightButton, hint)

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
      palettes[editingMode][meta.key] = input.value
      savePalette(editingMode)
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
    palettes[editingMode] = { ...DEFAULTS[editingMode] }
    savePalette(editingMode)
    renderInputs(panel)
    applyPalette()
  })
  footer.append(reset)

  darkButton.addEventListener('click', () => {
    editingMode = 'dark'
    renderInputs(panel)
  })
  lightButton.addEventListener('click', () => {
    editingMode = 'light'
    renderInputs(panel)
  })

  toggle.addEventListener('click', () => {
    const nextOpen = panel.hidden
    panel.hidden = !nextOpen
    toggle.setAttribute('aria-expanded', String(nextOpen))
    toggle.textContent = nextOpen ? '自定义配色 ▴' : '自定义配色 ▾'
    if (nextOpen) {
      const app = document.querySelector<HTMLElement>('.app.tc-theme')
      editingMode = app ? effectiveMode(app) : 'dark'
      renderInputs(panel)
    }
  })

  panel.append(toolbar, grid, footer)
  row.append(toggle, panel)
  renderInputs(panel)
}

function attachCustomizer() {
  document.querySelectorAll<HTMLElement>('.settingsDialogBody.settingsGrid .settingRow').forEach(row => {
    const title = row.querySelector<HTMLElement>(':scope > div:first-child > strong')?.textContent?.trim()
    if (title === '外观') buildCustomizer(row)
  })
}

function refreshAfterUiEvent() {
  requestAnimationFrame(() => {
    applyPalette()
    attachCustomizer()
  })
}

// Event-driven only. Settings opening and appearance changes are finite user actions,
// so there is no reason to observe the entire document tree.
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
