const STOPPED_HINT = '此参数已停用，游戏不会读取，但不影响原版已存在参数。'
const DEFAULT_HINT = '右键：停用 / 还原 / 删除参数'

function decorateRow(row: HTMLElement) {
  const stopped = row.classList.contains('disabled')
  row.title = stopped ? STOPPED_HINT : DEFAULT_HINT

  const badge = row.querySelector<HTMLElement>('.disabledBadge')
  if (badge && badge.textContent !== '停用') badge.textContent = '停用'

  if (stopped) row.setAttribute('aria-disabled', 'true')
  else row.removeAttribute('aria-disabled')
}

function rowFromEventTarget(target: EventTarget | null) {
  return target instanceof HTMLElement ? target.closest<HTMLElement>('.parameterTableRow') : null
}

// Only touch a row when the user actually interacts with it. No global DOM observer.
document.addEventListener('pointerover', event => {
  const row = rowFromEventTarget(event.target)
  if (row) decorateRow(row)
}, true)

document.addEventListener('focusin', event => {
  const row = rowFromEventTarget(event.target)
  if (row) decorateRow(row)
}, true)

document.addEventListener('contextmenu', event => {
  const row = rowFromEventTarget(event.target)
  if (row) decorateRow(row)
}, true)
