const STOPPED_HINT = '此参数已停用，游戏不会读取，但不影响原版已存在参数。'
const DEFAULT_HINT = '右键：停用 / 还原 / 删除参数'

function decorateRow(row: HTMLElement) {
  const stopped = row.classList.contains('disabled')
  row.title = stopped ? STOPPED_HINT : DEFAULT_HINT

  const badge = row.querySelector<HTMLElement>('.disabledBadge')
  if (badge) badge.textContent = '停用'

  if (stopped) {
    row.setAttribute('aria-disabled', 'true')
  } else {
    row.removeAttribute('aria-disabled')
  }
}

function applyStoppedHints(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.parameterTableRow').forEach(decorateRow)
}

const observer = new MutationObserver(mutations => {
  for (const mutation of mutations) {
    if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
      const row = mutation.target.closest<HTMLElement>('.parameterTableRow')
      if (row) decorateRow(row)
      continue
    }
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue
      if (node.matches('.parameterTableRow')) decorateRow(node)
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
