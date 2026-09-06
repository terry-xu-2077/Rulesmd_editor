import { invoke } from '@tauri-apps/api/core'
import './save-as.css'

type SaveMode = 'fragment' | 'full'
type SaveBinding = { mode: SaveMode; path: string }
type Snapshot = { document: { path: string | null; dirty: boolean } }

let binding: SaveBinding | null = null
let cachedDocumentPath: string | null = null
let installed = false

async function backendCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('backend_call', { method, params })
}

async function refreshDocumentPath() {
  try {
    const snapshot = await backendCall<Snapshot>('snapshot')
    cachedDocumentPath = snapshot.document.path
  } catch {
    cachedDocumentPath = null
  }
}

function clearDirtyDot() {
  document.querySelector('.toolbar .saveDirtyDot')?.remove()
}

function statusText(message: string) {
  const status = document.querySelector('.statusbar, .statusBar, [data-role="status"]')
  if (status) status.textContent = message
}

function closeChooser() {
  document.querySelector('.saveModeOverlay')?.remove()
}

function chooseMode(): Promise<SaveMode | null> {
  closeChooser()
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'saveModeOverlay'
    overlay.innerHTML = `
      <div class="saveModeDialog" role="dialog" aria-modal="true" aria-label="选择保存类型">
        <div class="saveModeHeader">
          <strong>选择保存类型</strong>
          <button type="button" class="saveModeClose" aria-label="关闭">×</button>
        </div>
        <div class="saveModeBody">
          <button type="button" class="saveModeChoice" data-mode="fragment">
            <span class="saveModeChoiceTitle">仅修改的规则片段</span>
            <span>只导出新增和修改的规则，适合 CnCNet / RF GlobalCode.ini，避免覆盖客户端其它规则。</span>
          </button>
          <button type="button" class="saveModeChoice" data-mode="full">
            <span class="saveModeChoiceTitle">全部规则</span>
            <span>导出当前完整 Rules 文档，适合传统 rulesmd.ini / rules.ini。</span>
          </button>
        </div>
        <div class="saveModeFooter">“另存为”每次都会询问；普通“保存”只在文档还没有保存类型时询问。</div>
      </div>`
    const finish = (mode: SaveMode | null) => {
      overlay.remove()
      resolve(mode)
    }
    overlay.addEventListener('click', event => {
      if (event.target === overlay) finish(null)
    })
    overlay.querySelector('.saveModeClose')?.addEventListener('click', () => finish(null))
    overlay.querySelectorAll<HTMLButtonElement>('.saveModeChoice').forEach(button => {
      button.addEventListener('click', () => finish(button.dataset.mode as SaveMode))
    })
    document.body.appendChild(overlay)
  })
}

async function pickPath(mode: SaveMode): Promise<string | null> {
  const defaultName = mode === 'fragment' ? 'GlobalCode.ini' : 'rulesmd.ini'
  return invoke<string | null>('pick_save_file', { defaultName })
}

async function saveTo(mode: SaveMode, path: string): Promise<boolean> {
  try {
    if (mode === 'fragment') {
      await backendCall('save_fragment', { path })
    } else {
      await backendCall('save', { path })
      cachedDocumentPath = path
    }
    binding = { mode, path }
    clearDirtyDot()
    localStorage.setItem('rulesmd.lastFile', path)
    statusText(mode === 'fragment' ? `已保存规则片段 ${path}` : `已保存 ${path}`)
    return true
  } catch (error) {
    window.alert(`保存失败：${String(error)}`)
    return false
  }
}

async function saveWithPrompt() {
  const mode = await chooseMode()
  if (!mode) return
  const path = await pickPath(mode)
  if (!path) return
  await saveTo(mode, path)
}

async function handleSaveClick(event: MouseEvent) {
  if (binding) {
    event.preventDefault()
    event.stopImmediatePropagation()
    await saveTo(binding.mode, binding.path)
    return
  }

  if (cachedDocumentPath) return

  event.preventDefault()
  event.stopImmediatePropagation()
  await saveWithPrompt()
}

function saveAsButton() {
  const button = document.createElement('button')
  button.className = 'iconButton'
  button.title = '另存为'
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/><path d="M12 11v6"/><path d="m9 14 3 3 3-3"/>
    </svg>
    <span class="iconButtonLabel">另存为</span>`
  button.addEventListener('click', event => {
    event.preventDefault()
    void saveWithPrompt()
  })
  return button
}

function install() {
  if (installed) return
  const toolbar = document.querySelector('.toolbar')
  if (!toolbar) return
  const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>('.iconButton')]
  const save = buttons.find(button => button.title === '保存')
  if (!save) return

  installed = true
  save.addEventListener('click', event => { void handleSaveClick(event) }, true)
  save.insertAdjacentElement('afterend', saveAsButton())

  for (const button of buttons) {
    if (button.title !== '新建' && button.title !== '打开') continue
    button.addEventListener('click', () => {
      binding = null
      cachedDocumentPath = null
      window.setTimeout(() => { void refreshDocumentPath() }, 350)
      window.setTimeout(() => { void refreshDocumentPath() }, 1000)
    }, true)
  }
  void refreshDocumentPath()
}

const observer = new MutationObserver(() => install())
observer.observe(document.documentElement, { childList: true, subtree: true })
install()
