import { workspaceApi, type SectionData, type SectionOption } from './backend'
import './parameter-view-mode.css'

type ParameterViewMode = 'controls' | 'raw'

const CONTROL_PANE_SELECTOR = '.fieldsPane.parameterTablePane:not(.rawTextTablePane)'
const RAW_PANE_CLASS = 'rawTextTablePane'
const VIEW_SWITCH_SELECTOR = '.titleViewSwitch'

let mode: ParameterViewMode = 'controls'
let rawPane: HTMLElement | null = null
let refreshTimer: ReturnType<typeof window.setTimeout> | null = null
let refreshGeneration = 0
let pasteWatchTimer: ReturnType<typeof window.setInterval> | null = null
let lastSectionData: SectionData | null = null

function currentSectionId() {
  return document.querySelector<HTMLElement>('.entityHeaderHost .tc-entity-watermark')?.textContent?.trim() || ''
}

function controlPane() {
  return document.querySelector<HTMLElement>(CONTROL_PANE_SELECTOR)
}

function ensureRawPane(source: HTMLElement) {
  if (rawPane?.isConnected) return rawPane
  const pane = document.createElement('section')
  pane.className = `fieldsPane parameterTablePane ${RAW_PANE_CLASS}`
  pane.hidden = true
  pane.setAttribute('aria-label', '原文参数表')
  source.insertAdjacentElement('afterend', pane)
  rawPane = pane
  return pane
}

function copyMouseEvent(event: MouseEvent, type: string) {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: event.clientX,
    clientY: event.clientY,
    button: event.button,
    buttons: event.buttons,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  })
}

function optionQueues(section: SectionData) {
  const queues = new Map<string, SectionOption[]>()
  for (const option of section.options) {
    const key = option.key.trim().toLowerCase()
    const queue = queues.get(key) ?? []
    queue.push(option)
    queues.set(key, queue)
  }
  return queues
}

function bindMirroredInteractions(source: HTMLElement, mirror: HTMLElement) {
  const sourceRows = [...source.querySelectorAll<HTMLElement>('.parameterTableRow')]
  const mirrorRows = [...mirror.querySelectorAll<HTMLElement>('.parameterTableRow')]
  mirrorRows.forEach((row, index) => {
    const target = sourceRows[index]
    if (!target) return
    row.addEventListener('click', event => {
      event.stopPropagation()
      target.dispatchEvent(copyMouseEvent(event, 'click'))
    })
    row.addEventListener('contextmenu', event => {
      event.preventDefault()
      event.stopPropagation()
      target.dispatchEvent(copyMouseEvent(event, 'contextmenu'))
    })
  })

  const sourceHeaders = [...source.querySelectorAll<HTMLButtonElement>('.fieldGroupHeader')]
  const mirrorHeaders = [...mirror.querySelectorAll<HTMLButtonElement>('.fieldGroupHeader')]
  mirrorHeaders.forEach((header, index) => {
    const target = sourceHeaders[index]
    if (!target) return
    header.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      target.click()
    })
  })

  const sourceCountryRows = [...source.querySelectorAll<HTMLButtonElement>('.countryExclusiveRow')]
  const mirrorCountryRows = [...mirror.querySelectorAll<HTMLButtonElement>('.countryExclusiveRow')]
  mirrorCountryRows.forEach((row, index) => {
    const target = sourceCountryRows[index]
    if (!target) return
    row.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      target.click()
    })
  })
}

function renderRawMirror(source: HTMLElement, pane: HTMLElement, section: SectionData) {
  const previousScrollTop = pane.scrollTop
  const clone = source.cloneNode(true) as HTMLElement
  clone.removeAttribute('style')
  clone.hidden = false
  clone.classList.add('rawTextTableClone')

  const queues = optionQueues(section)
  clone.querySelectorAll<HTMLElement>('.parameterTableRow').forEach(row => {
    const key = row.querySelector('.parameterKeyCell code')?.textContent?.trim().toLowerCase() || ''
    const queue = queues.get(key)
    const option = queue?.shift()
    const valueCell = row.querySelector<HTMLElement>('.parameterValueCell')
    if (!valueCell) return

    valueCell.replaceChildren()
    valueCell.classList.add('rawParameterValueCell')
    const value = document.createElement('code')
    value.className = 'rawParameterValue'
    value.textContent = option ? `${option.value}${option.suffix || ''}` : ''
    value.title = value.textContent || ''
    valueCell.appendChild(value)
  })

  pane.replaceChildren(...Array.from(clone.childNodes))
  pane.scrollTop = previousScrollTop
  bindMirroredInteractions(source, pane)
}

async function refreshRawMirror() {
  const source = controlPane()
  const sectionId = currentSectionId()
  if (!source || !sectionId) {
    rawPane?.replaceChildren()
    return
  }

  const pane = ensureRawPane(source)
  const generation = ++refreshGeneration
  try {
    const section = await workspaceApi.section(sectionId)
    if (generation !== refreshGeneration || section.section.toLowerCase() !== currentSectionId().toLowerCase()) return
    lastSectionData = section
    renderRawMirror(source, pane, section)
    applyViewMode(false)
  } catch (error) {
    console.warn('Unable to build raw parameter table', error)
  }
}

function scheduleRawRefresh(delay = 80) {
  if (refreshTimer != null) window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null
    void refreshRawMirror()
  }, delay)
}

function viewButtons() {
  const host = document.querySelector<HTMLElement>(VIEW_SWITCH_SELECTOR)
  const buttons = host ? [...host.querySelectorAll<HTMLButtonElement>('button')].slice(0, 2) : []
  return { host, buttons }
}

function syncSwitchLabels() {
  const { host, buttons } = viewButtons()
  if (!host || buttons.length < 2) return
  buttons[0].textContent = '控件'
  buttons[1].textContent = '原文'
  buttons[0].dataset.parameterView = 'controls'
  buttons[1].dataset.parameterView = 'raw'
  buttons[0].classList.toggle('active', mode === 'controls')
  buttons[1].classList.toggle('active', mode === 'raw')
  buttons[0].setAttribute('aria-pressed', String(mode === 'controls'))
  buttons[1].setAttribute('aria-pressed', String(mode === 'raw'))
  host.setAttribute('aria-label', '参数显示模式')

  if (host.dataset.parameterViewBound === '1') return
  host.dataset.parameterViewBound = '1'
  host.addEventListener('click', event => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button[data-parameter-view]')
    if (!button || button.disabled) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    setMode(button.dataset.parameterView === 'raw' ? 'raw' : 'controls')
  }, true)
}

function applyViewMode(transferScroll = true) {
  const source = controlPane()
  if (!source) {
    if (rawPane) rawPane.hidden = true
    syncSwitchLabels()
    return
  }
  const pane = ensureRawPane(source)
  const outgoing = mode === 'raw' ? source : pane
  const incoming = mode === 'raw' ? pane : source
  const scrollTop = transferScroll ? outgoing.scrollTop : incoming.scrollTop

  source.hidden = mode === 'raw'
  pane.hidden = mode !== 'raw'
  if (transferScroll) incoming.scrollTop = scrollTop
  syncSwitchLabels()
}

function setMode(next: ParameterViewMode) {
  if (next === mode) {
    applyViewMode(false)
    return
  }
  const source = controlPane()
  const pane = source ? ensureRawPane(source) : rawPane
  const previousScrollTop = mode === 'controls' ? source?.scrollTop ?? 0 : pane?.scrollTop ?? 0
  mode = next
  applyViewMode(false)
  const incoming = mode === 'controls' ? source : pane
  if (incoming) incoming.scrollTop = previousScrollTop
  if (mode === 'raw') scheduleRawRefresh(0)
}

function clearFieldSearch() {
  const input = document.querySelector<HTMLInputElement>('.editorSearch input')
  if (!input || !input.value) return
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, '')
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function chooseAllGroups() {
  const host = document.querySelector<HTMLElement>('.editorFilterSelect')
  const button = host?.querySelector<HTMLButtonElement>('button')
  if (!button) return
  button.click()
  window.setTimeout(() => {
    const items = [...document.querySelectorAll<HTMLElement>('.tc-select-item')]
    const all = items.find(item => item.textContent?.trim() === '全部')
    all?.click()
  }, 0)
}

function expandCollapsedGroups() {
  document.querySelectorAll<HTMLButtonElement>(`${CONTROL_PANE_SELECTOR} .fieldGroupHeader`).forEach(header => {
    if (header.querySelector('.lucide-chevron-right')) header.click()
  })
}

function selectionSignature() {
  const source = controlPane()
  if (!source) return ''
  const selected = [...source.querySelectorAll<HTMLElement>('.parameterTableRow.selected')]
    .map(row => row.querySelector('.parameterKeyCell code')?.textContent?.trim() || '')
  const focused = source.querySelector<HTMLElement>('.parameterTableRow.focused .parameterKeyCell code')?.textContent?.trim() || ''
  return `${focused}|${selected.join(',')}`
}

function scrollToFocusedRow() {
  const source = controlPane()
  const pane = rawPane
  const targetPane = mode === 'raw' && pane && !pane.hidden ? pane : source
  const target = targetPane?.querySelector<HTMLElement>('.parameterTableRow.focused')
    ?? targetPane?.querySelector<HTMLElement>('.parameterTableRow.selected')
  target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

function armPasteFocus() {
  if (pasteWatchTimer != null) window.clearInterval(pasteWatchTimer)
  const before = selectionSignature()
  const started = performance.now()
  let fallbackScrolled = false

  pasteWatchTimer = window.setInterval(() => {
    const elapsed = performance.now() - started
    const signature = selectionSignature()
    const changed = Boolean(signature && signature !== before)

    if (changed) {
      clearFieldSearch()
      chooseAllGroups()
      window.setTimeout(() => {
        expandCollapsedGroups()
        scheduleRawRefresh(0)
        window.setTimeout(scrollToFocusedRow, 120)
      }, 80)
      if (pasteWatchTimer != null) window.clearInterval(pasteWatchTimer)
      pasteWatchTimer = null
      return
    }

    if (!fallbackScrolled && elapsed >= 650) {
      fallbackScrolled = true
      clearFieldSearch()
      expandCollapsedGroups()
      scrollToFocusedRow()
    }

    if (elapsed >= 3000) {
      if (pasteWatchTimer != null) window.clearInterval(pasteWatchTimer)
      pasteWatchTimer = null
    }
  }, 60)
}

function bindPasteWatcher() {
  if (document.documentElement.dataset.parameterPasteFocusBound === '1') return
  document.documentElement.dataset.parameterPasteFocusBound = '1'
  document.addEventListener('click', event => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.parameterContextMenu button[role="menuitem"]')
    if (!button) return
    const label = button.querySelector('span')?.textContent?.trim() || button.textContent?.trim() || ''
    if (label === '粘贴参数') armPasteFocus()
  }, true)
}

function applyEnhancements() {
  syncSwitchLabels()
  const source = controlPane()
  if (!source) {
    if (rawPane) rawPane.hidden = true
    return
  }
  ensureRawPane(source)
  applyViewMode(false)
  scheduleRawRefresh()
}

const observer = new MutationObserver(mutations => {
  const externalMutation = mutations.some(mutation => {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
    return !target?.closest(`.${RAW_PANE_CLASS}`)
  })
  if (!externalMutation) return
  window.queueMicrotask(applyEnhancements)
})

observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled'] })
bindPasteWatcher()
applyEnhancements()

// Keep the mirror fresh even when a control updates its internal DOM without changing
// the surrounding parameter row structure. The backend is local, and this low-frequency
// refresh avoids rebuilding or remounting the control view itself.
window.setInterval(() => {
  if (!controlPane() || !currentSectionId()) return
  if (mode === 'raw' || lastSectionData?.section.toLowerCase() !== currentSectionId().toLowerCase()) scheduleRawRefresh(0)
}, 700)
