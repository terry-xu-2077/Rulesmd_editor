function cloneSelectedTreeIcon() {
  const source = document.querySelector<HTMLElement>('.unitTreeLeaf.selected .unitTreeIcon')
  const target = document.querySelector<HTMLElement>('.entityHeaderHost .legacyUnitIcon')
  if (!source || !target) return

  target.className = `legacyUnitIcon headerSyncedObjectIcon ${source.classList.contains('fallback') ? 'fallback semantic' : ''}`
  target.innerHTML = source.innerHTML
  target.style.backgroundImage = source.style.backgroundImage
  target.style.backgroundPosition = source.style.backgroundPosition
  target.style.backgroundSize = source.style.backgroundSize
  target.style.backgroundRepeat = source.style.backgroundRepeat
  target.style.backgroundColor = source.style.backgroundColor
}

const observer = new MutationObserver(() => cloneSelectedTreeIcon())
observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] })
window.addEventListener('DOMContentLoaded', cloneSelectedTreeIcon)
requestAnimationFrame(cloneSelectedTreeIcon)
