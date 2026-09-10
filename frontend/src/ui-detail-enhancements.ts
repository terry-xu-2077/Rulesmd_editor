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

function currentSectionId() {
  return document.querySelector<HTMLElement>('.entityHeaderHost .tc-entity-watermark')?.textContent?.trim() || ''
}

function isColorSection() {
  return /^(?:colors?|colours?)$/i.test(currentSectionId())
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function syncPicker(picker: HTMLInputElement, input: HTMLInputElement) {
  const rgb = parseRgb(input.value)
  if (!rgb) return
  const hex = rgbToHex(rgb)
  if (picker.value !== hex) picker.value = hex
}

function enhanceColorRows() {
  const colorSection = isColorSection()

  document.querySelectorAll<HTMLElement>('.parameterTableRow').forEach(row => {
    const host = row.querySelector<HTMLElement>('.rulesControlHost')
    if (!host) return

    const existing = host.querySelector<HTMLInputElement>('.rulesRgbPicker')
    const input = host.querySelector<HTMLInputElement>('input:not([type="color"]):not([type="checkbox"]):not([type="range"])')
    const rgb = input ? parseRgb(input.value) : null

    if (!colorSection || !input || !rgb) {
      existing?.remove()
      host.classList.remove('hasRgbColorPicker')
      return
    }

    if (existing) {
      host.classList.add('hasRgbColorPicker')
      syncPicker(existing, input)
      return
    }

    const picker = document.createElement('input')
    picker.type = 'color'
    picker.className = 'rulesRgbPicker'
    picker.value = rgbToHex(rgb)
    const key = row.querySelector('.parameterKeyCell code')?.textContent?.trim() || '颜色'
    picker.setAttribute('aria-label', `选择 ${key} 颜色`)
    picker.title = '颜色选择器；右侧仍可直接输入 R,G,B'
    picker.addEventListener('input', () => setReactInputValue(input, hexToRgb(picker.value)))

    host.classList.add('hasRgbColorPicker')
    host.insertBefore(picker, host.firstChild)
  })
}

let enhancementQueued = false
function queueEnhancement() {
  if (enhancementQueued) return
  enhancementQueued = true
  queueMicrotask(() => {
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
