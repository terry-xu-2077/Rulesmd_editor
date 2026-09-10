import './ui-detail-enhancements.css'

const RGB_PATTERN = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/

type Rgb = [number, number, number]

function parseRgb(value: string): Rgb | null {
  const match = value.match(RGB_PATTERN)
  if (!match) return null
  const rgb: Rgb = [Number(match[1]), Number(match[2]), Number(match[3])]
  return rgb.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255) ? rgb : null
}

function rgbToHex([red, green, blue]: Rgb) {
  return `#${[red, green, blue].map(channel => channel.toString(16).padStart(2, '0')).join('')}`
}

function hexToRgb(value: string) {
  const normalized = value.replace(/^#/, '')
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return '0,0,0'
  return `${Number.parseInt(normalized.slice(0, 2), 16)},${Number.parseInt(normalized.slice(2, 4), 16)},${Number.parseInt(normalized.slice(4, 6), 16)}`
}

function isColorsView() {
  const headerText = document.querySelector<HTMLElement>('.entityHeaderHost')?.textContent || ''
  return /(?:^|\W)Colors(?:\W|$)/i.test(headerText)
}

function isColorRow(row: HTMLElement) {
  if (isColorsView()) return true
  const group = row.closest<HTMLElement>('.parameterTableGroup')
  const groupTitle = group?.querySelector<HTMLElement>('.fieldGroupHeader > span')?.textContent?.trim() || ''
  return groupTitle === '颜色主题'
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function updateVisualControl(control: HTMLElement, input: HTMLInputElement, picker: HTMLInputElement) {
  const rgb = parseRgb(input.value)
  if (!rgb) return
  const hex = rgbToHex(rgb)
  if (picker.value !== hex) picker.value = hex
  control.style.setProperty('--rules-rgb-preview', hex)
  const valueLabel = control.querySelector<HTMLElement>('.rulesRgbValue')
  if (valueLabel) valueLabel.textContent = rgb.join(',')
}

function createColorControl(row: HTMLElement, host: HTMLElement, input: HTMLInputElement, rgb: Rgb) {
  const control = document.createElement('div')
  control.className = 'rulesRgbControl'
  control.style.setProperty('--rules-rgb-preview', rgbToHex(rgb))

  const swatch = document.createElement('span')
  swatch.className = 'rulesRgbSwatch'
  swatch.setAttribute('aria-hidden', 'true')

  const valueLabel = document.createElement('span')
  valueLabel.className = 'rulesRgbValue'
  valueLabel.textContent = rgb.join(',')

  const picker = document.createElement('input')
  picker.type = 'color'
  picker.className = 'rulesRgbPicker'
  picker.value = rgbToHex(rgb)
  const key = row.querySelector('.parameterKeyCell code')?.textContent?.trim() || '颜色'
  picker.setAttribute('aria-label', `选择 ${key} 颜色`)
  picker.title = `${key}：点击选择颜色`
  picker.addEventListener('input', () => {
    const next = hexToRgb(picker.value)
    valueLabel.textContent = next
    control.style.setProperty('--rules-rgb-preview', picker.value)
    setReactInputValue(input, next)
  })

  control.append(swatch, valueLabel, picker)
  host.classList.add('hasRgbColorPicker')
  host.appendChild(control)
  return control
}

function enhanceColorRows() {
  document.querySelectorAll<HTMLElement>('.parameterTableRow').forEach(row => {
    const host = row.querySelector<HTMLElement>('.rulesControlHost')
    if (!host) return

    const input = host.querySelector<HTMLInputElement>('input:not([type="color"]):not([type="checkbox"]):not([type="range"])')
    const rgb = input ? parseRgb(input.value) : null
    const existing = host.querySelector<HTMLElement>('.rulesRgbControl')

    if (!isColorRow(row) || !input || !rgb) {
      existing?.remove()
      host.classList.remove('hasRgbColorPicker')
      return
    }

    if (existing) {
      const picker = existing.querySelector<HTMLInputElement>('.rulesRgbPicker')
      if (picker) updateVisualControl(existing, input, picker)
      return
    }

    createColorControl(row, host, input, rgb)
  })
}

let enhancementQueued = false
function queueEnhancement() {
  if (enhancementQueued) return
  enhancementQueued = true
  requestAnimationFrame(() => {
    enhancementQueued = false
    enhanceColorRows()
  })
}

const observer = new MutationObserver(queueEnhancement)
observer.observe(document.body, { childList: true, subtree: true, characterData: true })
document.addEventListener('input', event => {
  if (event.target instanceof HTMLInputElement && event.target.closest('.parameterTableRow')) queueEnhancement()
}, true)
document.addEventListener('click', queueEnhancement, true)
queueEnhancement()
