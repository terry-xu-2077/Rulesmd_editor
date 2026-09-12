import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CustomIconDialog, refreshIconCache } from './CustomIconDialog'

let installed = false
let installAttempts = 0
let dialogRoot: Root | null = null
let dialogHost: HTMLElement | null = null
const MAX_INSTALL_ATTEMPTS = 80

function closeManager() {
  dialogRoot?.unmount()
  dialogRoot = null
  dialogHost?.remove()
  dialogHost = null
}

function openManager() {
  closeManager()
  dialogHost = document.createElement('div')
  document.body.appendChild(dialogHost)
  dialogRoot = createRoot(dialogHost)
  dialogRoot.render(createElement(CustomIconDialog, { open: true, onClose: closeManager }))
}

function iconResourceButton() {
  const button = document.createElement('button')
  button.className = 'iconButton iconResourceInjected'
  button.title = '图标资源'
  button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg><span class="iconButtonLabel">图标资源</span>`
  button.addEventListener('click', openManager)
  return button
}

function refreshSoon() {
  for (const delay of [350, 900, 1800]) {
    window.setTimeout(() => { void refreshIconCache().catch(() => undefined) }, delay)
  }
}

function install() {
  if (installed) return true
  const toolbar = document.querySelector('.toolbar')
  if (!toolbar) return false
  const settings = [...toolbar.querySelectorAll<HTMLButtonElement>('.iconButton')].find(button => button.title === '设置')
  if (!settings) return false
  if (!toolbar.querySelector('.iconResourceInjected')) settings.insertAdjacentElement('beforebegin', iconResourceButton())
  installed = true

  document.addEventListener('click', event => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.toolbar .iconButton')
    if (!button || (button.title !== '打开' && button.title !== '新建')) return
    refreshSoon()
  }, true)

  void refreshIconCache().catch(() => undefined)
  return true
}

function retryInstall() {
  if (install() || installAttempts >= MAX_INSTALL_ATTEMPTS) return
  installAttempts += 1
  window.setTimeout(retryInstall, 50)
}

function start() {
  installAttempts = 0
  retryInstall()
}

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start, { once: true })
else start()
