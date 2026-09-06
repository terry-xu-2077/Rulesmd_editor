let scheduled = false

function cloneSelectedTreeIcon() {
  scheduled = false
  const source = document.querySelector<HTMLElement>('.unitTreeLeaf.selected .unitTreeIcon')
  const target = document.querySelector<HTMLElement>('.entityHeaderHost .legacyUnitIcon')
  if (!source || !target) return

  const nextClass = `legacyUnitIcon headerSyncedObjectIcon ${source.classList.contains('fallback') ? 'fallback semantic' : ''}`.trim()
  if (target.className !== nextClass) target.className = nextClass
  if (target.innerHTML !== source.innerHTML) target.innerHTML = source.innerHTML

  const stylePairs: Array<[keyof CSSStyleDeclaration, string]> = [
    ['backgroundImage', source.style.backgroundImage],
    ['backgroundPosition', source.style.backgroundPosition],
    ['backgroundSize', source.style.backgroundSize],
    ['backgroundRepeat', source.style.backgroundRepeat],
    ['backgroundColor', source.style.backgroundColor],
  ]
  for (const [key, value] of stylePairs) {
    if (target.style[key] !== value) target.style[key] = value as never
  }
}

function scheduleClone() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(cloneSelectedTreeIcon)
}

function attachObserver() {
  const sidebar = document.querySelector<HTMLElement>('.sidebar')
  if (!sidebar) {
    requestAnimationFrame(attachObserver)
    return
  }

  // Observe only the source tree. The target lives in .editor, so copying its
  // class/style/children cannot trigger this observer again and create a feedback loop.
  const observer = new MutationObserver(scheduleClone)
  observer.observe(sidebar, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  })
  scheduleClone()
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', attachObserver, { once: true })
} else {
  attachObserver()
}
