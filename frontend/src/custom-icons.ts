import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CustomIconDialog, refreshIconCache } from './CustomIconDialog'
import './icon-settings-entry.css'

let dialogRoot: Root | null = null
let dialogHost: HTMLElement | null = null

function closeManager() {
  dialogRoot?.unmount()
  dialogRoot = null
  dialogHost?.remove()
  dialogHost = null
}

function openManager(initialTargetId = '') {
  closeManager()
  dialogHost = document.createElement('div')
  document.body.appendChild(dialogHost)
  dialogRoot = createRoot(dialogHost)
  dialogRoot.render(createElement(CustomIconDialog, { open: true, onClose: closeManager, initialTargetId }))
}

function currentEntityId() {
  return document.querySelector<HTMLElement>('.entityHeaderHost .tc-entity-watermark')?.textContent?.trim()
    || document.querySelector<HTMLElement>('.unitTreeLeaf.selected')?.dataset.unitId
    || ''
}

function headerIconFromTarget(target: EventTarget | null) {
  return (target as HTMLElement | null)?.closest<HTMLElement>('.entityHeaderHost .headerUnitComposite') ?? null
}

function prepareHeaderIcon(icon: HTMLElement) {
  icon.title = '设置图标'
  icon.setAttribute('aria-label', '设置图标')
  icon.setAttribute('role', 'button')
  icon.tabIndex = 0
}

function activateHeaderIcon(icon: HTMLElement, event: Event) {
  const id = currentEntityId()
  if (!id) return
  event.preventDefault()
  event.stopPropagation()
  prepareHeaderIcon(icon)
  openManager(id)
}

function refreshSoon() {
  for (const delay of [350, 900, 1800]) {
    window.setTimeout(() => { void refreshIconCache().catch(() => undefined) }, delay)
  }
}

function install() {
  // Icon editing belongs only to the visible composite in the current-entity header.
  // Icons inside the left navigation tree remain navigation-only targets.
  document.addEventListener('pointerover', event => {
    const icon = headerIconFromTarget(event.target)
    if (icon) prepareHeaderIcon(icon)
  }, true)

  document.addEventListener('click', event => {
    const icon = headerIconFromTarget(event.target)
    if (icon) {
      activateHeaderIcon(icon, event)
      return
    }

    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.toolbar .iconButton')
    if (!button || (button.title !== '打开' && button.title !== '新建')) return
    refreshSoon()
  }, true)

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const icon = headerIconFromTarget(event.target)
    if (!icon) return
    activateHeaderIcon(icon, event)
  }, true)

  // UnitTree portals the visible header icon after the editor header itself exists.
  // Bind tooltip/accessibility metadata whenever that portal is recreated for a new unit.
  const observer = new MutationObserver(() => {
    const icon = document.querySelector<HTMLElement>('.entityHeaderHost .headerUnitComposite')
    if (icon && icon.dataset.iconSettingsBound !== '1') {
      icon.dataset.iconSettingsBound = '1'
      prepareHeaderIcon(icon)
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  const existingIcon = document.querySelector<HTMLElement>('.entityHeaderHost .headerUnitComposite')
  if (existingIcon) prepareHeaderIcon(existingIcon)
  void refreshIconCache().catch(() => undefined)
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', install, { once: true })
else install()
