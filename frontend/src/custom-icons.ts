import { invoke } from '@tauri-apps/api/core'
import './custom-icons.css'

const CACHE_KEY = 'rulesmd.customIconCache'

type IconKind = 'unit' | 'country'
type IconEntry = {
  x: number
  y: number
  cellWidth: number
  cellHeight: number
  source?: string
  gameFile?: string
}
type IconTarget = {
  id: string
  label: string
  category: string
  kind: IconKind
  art_section: string
}
type ArtMdRow = {
  section: string
  Cameo: string
  CameoPCX: string
  AltCameoPCX: string
}
type ArtMdSnapshot = {
  path: string
  exists: boolean
  rows: ArtMdRow[]
}
type IconLibrarySnapshot = {
  version: number
  unitTile: string
  countryTile: string
  unit: Record<string, IconEntry>
  country: Record<string, IconEntry>
  targets: IconTarget[]
  artmd: ArtMdSnapshot
  gameRoot: string
  customCount: number
  sync?: {
    synced: boolean
    game_file: string
    art_section: string
    rules_dirty: boolean
  }
}

let currentSnapshot: IconLibrarySnapshot | null = null
let installed = false
let installAttempts = 0
const MAX_INSTALL_ATTEMPTS = 80

async function backendCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('backend_call', { method, params })
}

function cacheSnapshot(snapshot: IconLibrarySnapshot) {
  const cache = {
    version: snapshot.version,
    unitTile: snapshot.unitTile,
    countryTile: snapshot.countryTile,
    unit: snapshot.unit,
    country: snapshot.country,
  }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (error) {
    console.warn('Unable to cache icon atlas', error)
  }
  window.dispatchEvent(new CustomEvent('rulesmd-icon-cache-updated'))
}

async function refreshLibrary(silent = false) {
  try {
    currentSnapshot = await backendCall<IconLibrarySnapshot>('icon_library_snapshot')
    cacheSnapshot(currentSnapshot)
    return currentSnapshot
  } catch (error) {
    if (!silent) window.alert(`读取图标资源失败：${String(error)}`)
    return null
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char] || char))
}

function iconBackgroundStyle(kind: IconKind, entry: IconEntry, snapshot: IconLibrarySnapshot) {
  const rows = kind === 'unit' ? snapshot.unit : snapshot.country
  const image = kind === 'unit' ? snapshot.unitTile : snapshot.countryTile
  const entries = Object.values(rows)
  const sheetWidth = Math.max(entry.cellWidth, ...entries.map(item => item.x + item.cellWidth))
  const sheetHeight = Math.max(entry.cellHeight, ...entries.map(item => item.y + item.cellHeight))
  return [
    `background-image:url(${JSON.stringify(image)})`,
    `background-size:${sheetWidth}px ${sheetHeight}px`,
    `background-position:-${entry.x}px -${entry.y}px`,
  ].join(';')
}

function markRulesDirty() {
  const label = document.querySelector<HTMLElement>('.toolbar .iconButton[title="保存"] .iconButtonLabel')
  if (!label || label.querySelector('.saveDirtyDot')) return
  const dot = document.createElement('i')
  dot.className = 'saveDirtyDot iconResourceDirtyDot'
  dot.setAttribute('aria-label', '国家图标关联有未保存修改')
  label.appendChild(dot)
}

function status(dialog: HTMLElement, message: string) {
  const node = dialog.querySelector<HTMLElement>('.iconResourceStatus')
  if (node) node.textContent = message
}

function sourceLabel(source?: string) {
  if (source === 'custom') return '用户图标'
  if (source === 'mod') return 'Mod 图标'
  return source || '图标'
}

function renderCards(dialog: HTMLElement, snapshot: IconLibrarySnapshot) {
  const host = dialog.querySelector<HTMLElement>('[data-icon-grid]')
  if (!host) return
  const targets = new Map(snapshot.targets.map(target => [`${target.kind}:${target.id.toLowerCase()}`, target]))
  const rows: Array<{ kind: IconKind; id: string; entry: IconEntry }> = [
    ...Object.entries(snapshot.unit).map(([id, entry]) => ({ kind: 'unit' as const, id, entry })),
    ...Object.entries(snapshot.country).map(([id, entry]) => ({ kind: 'country' as const, id, entry })),
  ]
  if (!rows.length) {
    host.innerHTML = '<div class="iconResourceEmpty">当前规则中还没有可读取的用户 / Mod PCX 图标。原版单位仍使用内置 Tile。</div>'
    return
  }
  host.innerHTML = rows.map(({ kind, id, entry }) => {
    const target = targets.get(`${kind}:${id.toLowerCase()}`)
    const name = target?.label && target.label !== id ? `${target.label} · ${id}` : id
    const gameFile = entry.gameFile ? `<span title="${escapeHtml(entry.gameFile)}">${escapeHtml(entry.gameFile)}</span>` : '<span>仅编辑器资源</span>'
    return `<div class="iconResourceCard" data-kind="${kind}" data-id="${escapeHtml(id)}">
      <div class="iconResourceCardIcon ${kind === 'country' ? 'country' : ''}" style="${iconBackgroundStyle(kind, entry, snapshot)}"></div>
      <div class="iconResourceCardText"><b title="${escapeHtml(name)}">${escapeHtml(name)}</b>${gameFile}<span class="iconResourceBadge ${escapeHtml(entry.source || '')}">${sourceLabel(entry.source)}</span></div>
    </div>`
  }).join('')
}

function renderTargetOptions(dialog: HTMLElement, snapshot: IconLibrarySnapshot) {
  const select = dialog.querySelector<HTMLSelectElement>('[data-icon-target]')
  if (!select) return
  const previous = select.value
  const groups = new Map<string, IconTarget[]>()
  snapshot.targets.forEach(target => {
    const label = target.kind === 'country' ? '国家' : target.category
    const items = groups.get(label) ?? []
    items.push(target)
    groups.set(label, items)
  })
  select.innerHTML = [...groups.entries()].map(([group, items]) => `<optgroup label="${escapeHtml(group)}">${items.map(target => {
    const label = target.label && target.label !== target.id ? `${target.label} · ${target.id}` : target.id
    return `<option value="${target.kind}|${escapeHtml(target.id)}">${escapeHtml(label)}</option>`
  }).join('')}</optgroup>`).join('')
  if (previous && [...select.options].some(option => option.value === previous)) select.value = previous
  syncTargetState(dialog, snapshot)
}

function selectedTarget(dialog: HTMLElement, snapshot: IconLibrarySnapshot) {
  const value = dialog.querySelector<HTMLSelectElement>('[data-icon-target]')?.value || ''
  const [kind, ...idParts] = value.split('|')
  const id = idParts.join('|')
  return snapshot.targets.find(target => target.kind === kind && target.id === id) ?? null
}

function syncTargetState(dialog: HTMLElement, snapshot: IconLibrarySnapshot) {
  const target = selectedTarget(dialog, snapshot)
  const variant = dialog.querySelector<HTMLSelectElement>('[data-icon-variant]')
  const remove = dialog.querySelector<HTMLButtonElement>('[data-icon-remove]')
  if (variant) {
    variant.disabled = target?.kind !== 'unit'
    if (target?.kind !== 'unit') variant.value = 'cameo'
  }
  if (remove) {
    const entry = target ? (target.kind === 'unit' ? snapshot.unit[target.id] : snapshot.country[target.id]) : undefined
    remove.disabled = !entry || entry.source !== 'custom'
  }
}

function renderArtMd(dialog: HTMLElement, snapshot: ArtMdSnapshot, targets: IconTarget[]) {
  const path = dialog.querySelector<HTMLElement>('[data-artmd-path]')
  const rows = dialog.querySelector<HTMLElement>('[data-artmd-rows]')
  const sectionInput = dialog.querySelector<HTMLInputElement>('[data-artmd-section]')
  const dataList = dialog.querySelector<HTMLDataListElement>('[data-artmd-sections]')
  if (path) path.textContent = snapshot.path || '未确定 artmd.ini 路径；请先在设置中选择游戏启动程序。'
  if (dataList) {
    const sections = new Map<string, string>()
    targets.filter(target => target.kind === 'unit' && target.art_section).forEach(target => sections.set(target.art_section.toLowerCase(), target.art_section))
    snapshot.rows.forEach(row => sections.set(row.section.toLowerCase(), row.section))
    dataList.innerHTML = [...sections.values()].sort((a, b) => a.localeCompare(b)).map(value => `<option value="${escapeHtml(value)}"></option>`).join('')
  }
  if (!rows) return
  if (!snapshot.rows.length) {
    rows.innerHTML = '<div class="iconResourceEmpty">artmd.ini 中暂未发现 Cameo / CameoPCX / AltCameoPCX。</div>'
    if (sectionInput && !sectionInput.value) sectionInput.value = targets.find(target => target.kind === 'unit')?.art_section || ''
    return
  }
  rows.innerHTML = snapshot.rows.map(row => {
    const value = row.CameoPCX || row.Cameo || row.AltCameoPCX || ''
    return `<button type="button" class="artmdRow" data-art-section="${escapeHtml(row.section)}"><b>${escapeHtml(row.section)}</b><span title="${escapeHtml(value)}">${escapeHtml(value)}</span></button>`
  }).join('')
  rows.querySelectorAll<HTMLButtonElement>('.artmdRow').forEach(button => {
    button.addEventListener('click', () => {
      rows.querySelectorAll('.artmdRow').forEach(row => row.classList.remove('active'))
      button.classList.add('active')
      const row = snapshot.rows.find(item => item.section === button.dataset.artSection)
      if (!row) return
      const section = dialog.querySelector<HTMLInputElement>('[data-artmd-section]')
      const cameo = dialog.querySelector<HTMLInputElement>('[data-artmd-cameo]')
      const pcx = dialog.querySelector<HTMLInputElement>('[data-artmd-pcx]')
      const alt = dialog.querySelector<HTMLInputElement>('[data-artmd-alt-pcx]')
      if (section) section.value = row.section
      if (cameo) cameo.value = row.Cameo || ''
      if (pcx) pcx.value = row.CameoPCX || ''
      if (alt) alt.value = row.AltCameoPCX || ''
    })
  })
}

function renderSnapshot(dialog: HTMLElement, snapshot: IconLibrarySnapshot) {
  const root = dialog.querySelector<HTMLElement>('[data-game-root]')
  if (root) root.textContent = snapshot.gameRoot ? `游戏目录：${snapshot.gameRoot}` : '未绑定游戏目录'
  renderTargetOptions(dialog, snapshot)
  renderCards(dialog, snapshot)
  renderArtMd(dialog, snapshot.artmd, snapshot.targets)
}

async function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

function createDialog() {
  document.querySelector('.iconResourceOverlay')?.remove()
  const overlay = document.createElement('div')
  overlay.className = 'iconResourceOverlay'
  overlay.innerHTML = `<div class="iconResourceDialog" role="dialog" aria-modal="true" aria-label="图标资源">
    <div class="iconResourceHeader"><strong>图标资源</strong><small data-game-root>读取游戏目录…</small><button type="button" class="iconResourceClose" aria-label="关闭">×</button></div>
    <div class="iconResourceTabs"><button type="button" class="iconResourceTab active" data-tab="icons">自定义 / Mod 图标</button><button type="button" class="iconResourceTab" data-tab="artmd">ArtMD 图标配置</button></div>
    <div class="iconResourceBody">
      <section class="iconResourcePanel active" data-panel="icons">
        <div class="iconResourceToolbar">
          <label class="iconResourceField"><span>单位或国家</span><select data-icon-target></select></label>
          <div class="iconResourceHint">用户图标写入独立 Tile；已有 Mod 的 Ares PCX 会自动读取。用户图标优先于 Mod 图标，原版内置图标最后兜底。</div>
          <div class="iconResourceActions"><button type="button" class="iconResourceButton" data-icon-refresh>刷新 Mod 图标</button></div>
        </div>
        <div class="iconResourceImport">
          <div class="iconResourcePreview" data-file-preview><span class="iconResourceHint">选择 PNG / JPG / BMP / WebP</span></div>
          <div class="iconResourceImportControls">
            <input class="iconResourceHiddenInput" type="file" accept="image/png,image/jpeg,image/bmp,image/webp" data-icon-file>
            <div class="iconResourceInline"><button type="button" class="iconResourceButton" data-icon-choose>选择图片</button><span class="iconResourceHint" data-file-name>尚未选择文件</span></div>
            <div class="iconResourceInline"><label><input type="checkbox" checked data-sync-game> 同步到游戏</label><label>单位图标：<select data-icon-variant><option value="cameo">普通 Cameo</option><option value="alt">精英 AltCameo</option></select></label></div>
            <div class="iconResourceHint">单位会生成 60×48、256 色 PCX，并更新 artmd.ini 的 CameoPCX / AltCameoPCX；国家会生成 PCX 并更新当前规则中的 File.Flag。不开 Ares 时仍可只作为编辑器自定义图标使用。</div>
            <div class="iconResourceActions"><button type="button" class="iconResourceButton primary" data-icon-import>导入并应用</button><button type="button" class="iconResourceButton danger" data-icon-remove disabled>删除用户图标</button></div>
          </div>
        </div>
        <div class="iconResourceGrid" data-icon-grid></div>
      </section>
      <section class="iconResourcePanel" data-panel="artmd">
        <div class="artmdPath" data-artmd-path></div>
        <div class="artmdLayout">
          <div class="artmdRows" data-artmd-rows></div>
          <div class="artmdEditor">
            <h3 class="artmdEditorTitle">仅编辑图标关联</h3>
            <label class="iconResourceField"><span>Art Section</span><input type="text" list="artmd-known-sections" data-artmd-section><datalist id="artmd-known-sections" data-artmd-sections></datalist></label>
            <label class="iconResourceField"><span>Cameo（传统 SHP 名称）</span><input type="text" data-artmd-cameo placeholder="例如 MTNKICON"></label>
            <label class="iconResourceField"><span>CameoPCX（Ares）</span><input type="text" data-artmd-pcx placeholder="例如 mytank.pcx"></label>
            <label class="iconResourceField"><span>AltCameoPCX（Ares 精英）</span><input type="text" data-artmd-alt-pcx placeholder="例如 mytank_elite.pcx"></label>
            <div class="iconResourceHint">这里不是完整 artmd.ini 编辑器，只管理单位图标需要的三个字段。空值保存会删除对应字段，其它 ArtMD 内容原样保留。</div>
            <div class="iconResourceActions" style="margin-top:12px"><button type="button" class="iconResourceButton primary" data-artmd-save>保存 ArtMD 图标配置</button><button type="button" class="iconResourceButton" data-artmd-refresh>重新读取</button></div>
          </div>
        </div>
      </section>
    </div>
    <div class="iconResourceStatus">就绪</div>
  </div>`

  const dialog = overlay.querySelector<HTMLElement>('.iconResourceDialog')!
  const close = () => overlay.remove()
  overlay.addEventListener('click', event => { if (event.target === overlay) close() })
  dialog.querySelector('.iconResourceClose')?.addEventListener('click', close)
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') close() })

  dialog.querySelectorAll<HTMLButtonElement>('.iconResourceTab').forEach(tab => {
    tab.addEventListener('click', () => {
      dialog.querySelectorAll('.iconResourceTab').forEach(item => item.classList.toggle('active', item === tab))
      dialog.querySelectorAll<HTMLElement>('.iconResourcePanel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab))
    })
  })

  const fileInput = dialog.querySelector<HTMLInputElement>('[data-icon-file]')!
  dialog.querySelector('[data-icon-choose]')?.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    const name = dialog.querySelector<HTMLElement>('[data-file-name]')
    const preview = dialog.querySelector<HTMLElement>('[data-file-preview]')
    if (!file) return
    if (name) name.textContent = file.name
    const url = URL.createObjectURL(file)
    if (preview) preview.innerHTML = `<img src="${url}" alt="导入图标预览">`
  })

  dialog.querySelector('[data-icon-target]')?.addEventListener('change', () => {
    if (currentSnapshot) syncTargetState(dialog, currentSnapshot)
  })

  dialog.querySelector('[data-icon-refresh]')?.addEventListener('click', async () => {
    status(dialog, '正在重新扫描用户与 Mod 图标…')
    const next = await refreshLibrary(false)
    if (next) {
      renderSnapshot(dialog, next)
      status(dialog, `已刷新：识别 ${Object.keys(next.unit).length} 个单位图标、${Object.keys(next.country).length} 个国家图标。`)
    }
  })

  dialog.querySelector('[data-icon-import]')?.addEventListener('click', async () => {
    const snapshot = currentSnapshot
    const target = snapshot ? selectedTarget(dialog, snapshot) : null
    const file = fileInput.files?.[0]
    if (!target) { status(dialog, '请先选择单位或国家。'); return }
    if (!file) { status(dialog, '请先选择图片。'); return }
    try {
      status(dialog, `正在导入 ${target.id} 图标…`)
      const dataBase64 = await fileDataUrl(file)
      const syncGame = Boolean(dialog.querySelector<HTMLInputElement>('[data-sync-game]')?.checked)
      const variant = dialog.querySelector<HTMLSelectElement>('[data-icon-variant]')?.value || 'cameo'
      const next = await backendCall<IconLibrarySnapshot>('import_custom_icon', {
        kind: target.kind,
        target_id: target.id,
        data_base64: dataBase64,
        filename: file.name,
        sync_game: syncGame,
        variant,
      })
      currentSnapshot = next
      cacheSnapshot(next)
      renderSnapshot(dialog, next)
      if (next.sync?.rules_dirty) markRulesDirty()
      if (next.sync?.synced) status(dialog, `已应用 ${target.id}：游戏资源 ${next.sync.game_file}${next.sync.art_section ? `，Art Section [${next.sync.art_section}]` : ''}。`)
      else if (syncGame && !next.gameRoot) status(dialog, `已保存编辑器图标；未找到游戏目录，因此暂未同步到游戏。`)
      else status(dialog, `已保存 ${target.id} 的编辑器自定义图标。`)
    } catch (error) {
      status(dialog, `导入失败：${String(error)}`)
    }
  })

  dialog.querySelector('[data-icon-remove]')?.addEventListener('click', async () => {
    const snapshot = currentSnapshot
    const target = snapshot ? selectedTarget(dialog, snapshot) : null
    if (!target) return
    if (!window.confirm(`删除 ${target.id} 的用户自定义图标吗？\n不会自动删除游戏目录中的 PCX，也不会删除已有 ArtMD / File.Flag 关联。`)) return
    try {
      const next = await backendCall<IconLibrarySnapshot>('remove_custom_icon', { kind: target.kind, target_id: target.id })
      currentSnapshot = next
      cacheSnapshot(next)
      renderSnapshot(dialog, next)
      status(dialog, `已删除 ${target.id} 的用户图标；如果 Mod 中存在可读取 PCX，会自动回退显示该 Mod 图标。`)
    } catch (error) {
      status(dialog, `删除失败：${String(error)}`)
    }
  })

  async function reloadArtMd() {
    try {
      const artmd = await backendCall<ArtMdSnapshot>('artmd_snapshot')
      if (currentSnapshot) currentSnapshot.artmd = artmd
      renderArtMd(dialog, artmd, currentSnapshot?.targets ?? [])
      status(dialog, artmd.exists ? `已重新读取 ${artmd.path}` : `当前尚未创建 artmd.ini；首次保存图标关联时会创建。`)
    } catch (error) {
      status(dialog, `读取 ArtMD 失败：${String(error)}`)
    }
  }
  dialog.querySelector('[data-artmd-refresh]')?.addEventListener('click', () => void reloadArtMd())
  dialog.querySelector('[data-artmd-save]')?.addEventListener('click', async () => {
    const section = dialog.querySelector<HTMLInputElement>('[data-artmd-section]')?.value.trim() || ''
    if (!section) { status(dialog, 'Art Section 不能为空。'); return }
    try {
      const artmd = await backendCall<ArtMdSnapshot>('set_artmd_icon', {
        section,
        cameo: dialog.querySelector<HTMLInputElement>('[data-artmd-cameo]')?.value ?? '',
        cameo_pcx: dialog.querySelector<HTMLInputElement>('[data-artmd-pcx]')?.value ?? '',
        alt_cameo_pcx: dialog.querySelector<HTMLInputElement>('[data-artmd-alt-pcx]')?.value ?? '',
      })
      if (currentSnapshot) currentSnapshot.artmd = artmd
      renderArtMd(dialog, artmd, currentSnapshot?.targets ?? [])
      status(dialog, `已保存 [${section}] 的图标关联。`)
      const next = await refreshLibrary(true)
      if (next) renderSnapshot(dialog, next)
    } catch (error) {
      status(dialog, `保存 ArtMD 失败：${String(error)}`)
    }
  })

  const themeHost = document.querySelector<HTMLElement>('.app.tc-theme') ?? document.body
  themeHost.appendChild(overlay)
  window.setTimeout(() => dialog.focus(), 0)
  return dialog
}

async function openManager() {
  const dialog = createDialog()
  status(dialog, '正在读取图标资源…')
  const snapshot = await refreshLibrary(false)
  if (!snapshot) {
    status(dialog, '无法读取图标资源。')
    return
  }
  renderSnapshot(dialog, snapshot)
  status(dialog, `已读取图标资源：用户/Mod 可视图标 ${Object.keys(snapshot.unit).length + Object.keys(snapshot.country).length} 个。`)
}

function iconResourceButton() {
  const button = document.createElement('button')
  button.className = 'iconButton iconResourceInjected'
  button.title = '图标资源'
  button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg><span class="iconButtonLabel">图标资源</span>`
  button.addEventListener('click', () => { void openManager() })
  return button
}

function install() {
  if (installed) return true
  const toolbar = document.querySelector('.toolbar')
  if (!toolbar) return false
  const settings = [...toolbar.querySelectorAll<HTMLButtonElement>('.iconButton')].find(button => button.title === '设置')
  if (!settings) return false
  if (!toolbar.querySelector('.iconResourceInjected')) settings.insertAdjacentElement('beforebegin', iconResourceButton())
  installed = true

  // Opening a different rules/mod directory changes both ArtMD and File.Flag lookups.
  document.addEventListener('click', event => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.toolbar .iconButton')
    if (!button || (button.title !== '打开' && button.title !== '新建')) return
    for (const delay of [350, 900, 1800]) window.setTimeout(() => { void refreshLibrary(true) }, delay)
  }, true)
  void refreshLibrary(true)
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
