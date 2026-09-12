import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CustomIconDialog, refreshIconCache } from './CustomIconDialog'

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

function selectedUnitId() {
  return document.querySelector<HTMLElement>('.unitTreeLeaf.selected')?.dataset.unitId || ''
}

function targetUnitId(target: HTMLElement) {
  const leaf = target.closest<HTMLElement>('.unitTreeLeaf[data-unit-id]')
  if (leaf?.dataset.unitId) return leaf.dataset.unitId
  if (target.closest('.entityHeaderHost,.headerUnitComposite')) return selectedUnitId()
  return ''
}

function isEditableIconTarget(target: HTMLElement) {
  return Boolean(target.closest('.unitTreeIcon,.unitTreeIconWrap,.unitArtworkIcon,.unitTreeCountryTextIcon'))
}

function refreshSoon() {
  for (const delay of [350, 900, 1800]) {
    window.setTimeout(() => { void refreshIconCache().catch(() => undefined) }, delay)
  }
}

function install() {
  document.addEventListener('contextmenu', event => {
    const target = event.target as HTMLElement | null
    if (!target || !isEditableIconTarget(target)) return
    const id = targetUnitId(target)
    if (!id) return
    event.preventDefault()
    event.stopPropagation()
    openManager(id)
  }, true)

  document.addEventListener('click', event => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.toolbar .iconButton')
    if (!button || (button.title !== '打开' && button.title !== '新建')) return
    refreshSoon()
  }, true)

  void refreshIconCache().catch(() => undefined)
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', install, { once: true })
else install()
