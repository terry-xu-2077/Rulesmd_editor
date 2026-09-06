const STOPPED_HINT = '此参数已停用，游戏不会读取，但不影响原版已存在参数。'

function applyStoppedHints(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.parameterTableRow.disabled').forEach(row => {
    row.title = STOPPED_HINT
  })
}

const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
      const row = mutation.target.closest<HTMLElement>('.parameterTableRow')
      if (row) {
        if (row.classList.contains('disabled')) row.title = STOPPED_HINT
        else if (row.title === STOPPED_HINT) row.removeAttribute('title')
      }
      continue
    }
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue
      if (node.matches('.parameterTableRow.disabled')) node.title = STOPPED_HINT
      applyStoppedHints(node)
    }
  }
})

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class'],
})

applyStoppedHints()
