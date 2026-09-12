import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CustomIconDialog, refreshIconCache } from './CustomIconDialog'
import './icon-settings-entry.css'

let dialogRoot: Root | null = null
let dialogHost: HTMLElement | null = null
let documentReady = false
let consumerRefreshTimer: number | null = null

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
  // File dialogs return focus before/around the async open call. Retry long enough to
  // cover the document swap without making icon recovery depend on dialog timing.
  for (const delay of [120, 350, 900, 1800, 4000]) {
    window.setTimeout(() => { void refreshIconCache().catch(() => undefined) }, delay)
  }
}

function refreshAllReactIconConsumers() {
  if (consumerRefreshTimer != null) window.clearTimeout(consumerRefreshTimer)
  consumerRefreshTimer = window.setTimeout(() => {
    consumerRefreshTimer = null
    // UnitTree listens to this event directly. Re-select the active editor object as well
    // so parameter Select/MultiSelect controls rebuild their React option icon nodes.
    const selected = document.querySelector<HTMLButtonElement>('.unitTreeLeaf.selected')
      ?? document.querySelector<HTMLButtonElement>('.unitGlobalRule.selected')
    selected?.click()
  }, 0)
}

function hasOpenDocument() {
  // Do not require a leaf row here. UnitTree intentionally renders leaves only after a
  // side/type group is expanded, so using .unitTreeLeaf made a freshly opened document
  // look "not ready" and prevented its persisted icons from ever being loaded.
  return Boolean(document.querySelector('.unitHierarchy'))
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

  window.addEventListener('rulesmd-icon-cache-updated', refreshAllReactIconConsumers)
  // A native open dialog can remain on screen while the click-scheduled refreshes fire.
  // Refresh again when the editor window regains focus so the newly opened backend
  // document, rather than the previous/empty one, is used to rebuild the icon cache.
  window.addEventListener('focus', () => {
    if (hasOpenDocument()) refreshSoon()
  })

  // The icon script can start before React has opened/restored a rules document. Do not
  // ask the backend for an icon snapshot while there is no document: that empty snapshot
  // would overwrite the valid persisted browser cache from the previous session.
  const observer = new MutationObserver(() => {
    const icon = document.querySelector<HTMLElement>('.entityHeaderHost .headerUnitComposite')
    if (icon && icon.dataset.iconSettingsBound !== '1') {
      icon.dataset.iconSettingsBound = '1'
      prepareHeaderIcon(icon)
    }

    const hasDocument = hasOpenDocument()
    if (hasDocument && !documentReady) {
      documentReady = true
      void refreshIconCache().catch(() => undefined)
    } else if (!hasDocument) {
      documentReady = false
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  const existingIcon = document.querySelector<HTMLElement>('.entityHeaderHost .headerUnitComposite')
  if (existingIcon) prepareHeaderIcon(existingIcon)

  if (hasOpenDocument()) {
    documentReady = true
    void refreshIconCache().catch(() => undefined)
  }
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', install, { once: true })
else install()
