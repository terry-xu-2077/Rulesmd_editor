import React, { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Image as ImageIcon, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Button } from 'terry-react-ui-library'
import { invoke } from '@tauri-apps/api/core'
import { AppDialog } from './AppDialog'
import './custom-icons.css'

export const CUSTOM_ICON_CACHE_KEY = 'rulesmd.customIconCache'

type IconKind = 'unit' | 'country'
export type IconEntry = { x: number; y: number; cellWidth: number; cellHeight: number; source?: string; gameFile?: string }
export type IconTarget = { id: string; label: string; category: string; kind: IconKind; art_section: string }
export type ArtMdRow = { section: string; Cameo: string; CameoPCX: string; AltCameoPCX: string }
export type ArtMdSnapshot = { path: string; exists: boolean; rows: ArtMdRow[] }
export type IconLibrarySnapshot = {
  version: number
  unitTile: string
  countryTile: string
  unit: Record<string, IconEntry>
  country: Record<string, IconEntry>
  targets: IconTarget[]
  artmd: ArtMdSnapshot
  gameRoot: string
  customCount: number
  sync?: { synced: boolean; game_file: string; art_section: string; rules_dirty: boolean }
}

type Props = { open: boolean; onClose: () => void }

async function backendCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('backend_call', { method, params })
}

function cacheSnapshot(snapshot: IconLibrarySnapshot) {
  try {
    localStorage.setItem(CUSTOM_ICON_CACHE_KEY, JSON.stringify({
      version: snapshot.version,
      unitTile: snapshot.unitTile,
      countryTile: snapshot.countryTile,
      unit: snapshot.unit,
      country: snapshot.country,
    }))
  } catch (error) {
    console.warn('Unable to cache icon atlas', error)
  }
  window.dispatchEvent(new CustomEvent('rulesmd-icon-cache-updated'))
}

export async function refreshIconCache() {
  const snapshot = await backendCall<IconLibrarySnapshot>('icon_library_snapshot')
  cacheSnapshot(snapshot)
  return snapshot
}

function markRulesDirty() {
  const label = document.querySelector<HTMLElement>('.toolbar .iconButton[title="保存"] .iconButtonLabel')
  if (!label || label.querySelector('.saveDirtyDot')) return
  const dot = document.createElement('i')
  dot.className = 'saveDirtyDot iconResourceDirtyDot'
  dot.setAttribute('aria-label', '国家图标关联有未保存修改')
  label.appendChild(dot)
}

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

function targetKey(target: IconTarget) {
  return `${target.kind}|${target.id}`
}

function iconStyle(kind: IconKind, entry: IconEntry, snapshot: IconLibrarySnapshot): CSSProperties {
  const rows = kind === 'unit' ? snapshot.unit : snapshot.country
  const entries = Object.values(rows)
  const image = kind === 'unit' ? snapshot.unitTile : snapshot.countryTile
  const sheetWidth = Math.max(entry.cellWidth, ...entries.map(item => item.x + item.cellWidth))
  const sheetHeight = Math.max(entry.cellHeight, ...entries.map(item => item.y + item.cellHeight))
  return {
    backgroundImage: `url(${JSON.stringify(image)})`,
    backgroundSize: `${sheetWidth}px ${sheetHeight}px`,
    backgroundPosition: `-${entry.x}px -${entry.y}px`,
  }
}

function sourceLabel(source?: string) {
  return source === 'custom' ? '用户图标' : source === 'mod' ? 'Mod 图标' : source || '图标'
}

export function CustomIconDialog({ open, onClose }: Props) {
  const [snapshot, setSnapshot] = useState<IconLibrarySnapshot | null>(null)
  const [tab, setTab] = useState<'icons' | 'artmd'>('icons')
  const [selectedKey, setSelectedKey] = useState('')
  const [variant, setVariant] = useState<'cameo' | 'alt'>('cameo')
  const [syncGame, setSyncGame] = useState(true)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [message, setMessage] = useState('就绪')
  const [busy, setBusy] = useState(false)
  const [artSection, setArtSection] = useState('')
  const [artCameo, setArtCameo] = useState('')
  const [artPcx, setArtPcx] = useState('')
  const [artAlt, setArtAlt] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setMessage('正在读取图标资源…')
    void refreshIconCache().then(next => {
      if (cancelled) return
      setSnapshot(next)
      setSelectedKey(current => current && next.targets.some(target => targetKey(target) === current) ? current : (next.targets[0] ? targetKey(next.targets[0]) : ''))
      setMessage(`已读取：${Object.keys(next.unit).length} 个单位图标，${Object.keys(next.country).length} 个国家图标。`)
    }).catch(error => { if (!cancelled) setMessage(`读取图标资源失败：${String(error)}`) })
    return () => { cancelled = true }
  }, [open])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const selected = useMemo(() => snapshot?.targets.find(target => targetKey(target) === selectedKey) ?? null, [selectedKey, snapshot])
  const groups = useMemo(() => {
    const result = new Map<string, IconTarget[]>()
    for (const target of snapshot?.targets ?? []) {
      const group = target.kind === 'country' ? '国家' : target.category
      result.set(group, [...(result.get(group) ?? []), target])
    }
    return [...result.entries()]
  }, [snapshot])
  const cards = useMemo(() => snapshot ? [
    ...Object.entries(snapshot.unit).map(([id, entry]) => ({ kind: 'unit' as const, id, entry })),
    ...Object.entries(snapshot.country).map(([id, entry]) => ({ kind: 'country' as const, id, entry })),
  ] : [], [snapshot])
  const artSections = useMemo(() => {
    const values = new Map<string, string>()
    snapshot?.targets.filter(target => target.kind === 'unit' && target.art_section).forEach(target => values.set(target.art_section.toLowerCase(), target.art_section))
    snapshot?.artmd.rows.forEach(row => values.set(row.section.toLowerCase(), row.section))
    return [...values.values()].sort((a, b) => a.localeCompare(b))
  }, [snapshot])

  function chooseFile(next: File | null) {
    setFile(next)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(next ? URL.createObjectURL(next) : '')
  }

  async function refreshAll() {
    setBusy(true)
    setMessage('正在重新扫描用户与 Mod 图标…')
    try {
      const next = await refreshIconCache()
      setSnapshot(next)
      setMessage(`已刷新：${Object.keys(next.unit).length} 个单位图标，${Object.keys(next.country).length} 个国家图标。`)
    } catch (error) {
      setMessage(`刷新失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function importIcon() {
    if (!selected) { setMessage('请先选择单位或国家。'); return }
    if (!file) { setMessage('请先选择图片。'); return }
    setBusy(true)
    setMessage(`正在导入 ${selected.id} 图标…`)
    try {
      const next = await backendCall<IconLibrarySnapshot>('import_custom_icon', {
        kind: selected.kind,
        target_id: selected.id,
        data_base64: await fileDataUrl(file),
        filename: file.name,
        sync_game: syncGame,
        variant,
      })
      cacheSnapshot(next)
      setSnapshot(next)
      if (next.sync?.rules_dirty) markRulesDirty()
      setMessage(next.sync?.synced
        ? `已应用 ${selected.id}：游戏资源 ${next.sync.game_file}${next.sync.art_section ? `，Art Section [${next.sync.art_section}]` : ''}。`
        : `已保存 ${selected.id} 的编辑器自定义图标。`)
    } catch (error) {
      setMessage(`导入失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function removeIcon() {
    if (!selected || !window.confirm(`删除 ${selected.id} 的用户自定义图标吗？\n不会自动删除游戏目录中的 PCX，也不会删除已有 ArtMD / File.Flag 关联。`)) return
    setBusy(true)
    try {
      const next = await backendCall<IconLibrarySnapshot>('remove_custom_icon', { kind: selected.kind, target_id: selected.id })
      cacheSnapshot(next)
      setSnapshot(next)
      setMessage(`已删除 ${selected.id} 的用户图标；若 Mod 中存在可读取 PCX，会自动回退显示该 Mod 图标。`)
    } catch (error) {
      setMessage(`删除失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  function chooseArtRow(row: ArtMdRow) {
    setArtSection(row.section)
    setArtCameo(row.Cameo || '')
    setArtPcx(row.CameoPCX || '')
    setArtAlt(row.AltCameoPCX || '')
  }

  async function saveArtMd() {
    if (!artSection.trim()) { setMessage('Art Section 不能为空。'); return }
    setBusy(true)
    try {
      const artmd = await backendCall<ArtMdSnapshot>('set_artmd_icon', {
        section: artSection.trim(), cameo: artCameo, cameo_pcx: artPcx, alt_cameo_pcx: artAlt,
      })
      const next = await refreshIconCache()
      setSnapshot({ ...next, artmd })
      setMessage(`已保存 [${artSection.trim()}] 的图标关联。`)
    } catch (error) {
      setMessage(`保存 ArtMD 失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const selectedEntry = selected && snapshot
    ? (selected.kind === 'unit' ? snapshot.unit[selected.id] : snapshot.country[selected.id])
    : undefined

  return <AppDialog open={open} title="图标资源" icon={<ImageIcon size={18}/>} size="wide" onClose={onClose}>
    <div className="iconResourceShell">
      <div className="iconResourceTopline"><span>{snapshot?.gameRoot ? `游戏目录：${snapshot.gameRoot}` : '未绑定游戏目录'}</span></div>
      <div className="iconResourceTabs">
        <button type="button" className={tab === 'icons' ? 'active' : ''} onClick={() => setTab('icons')}>自定义 / Mod 图标</button>
        <button type="button" className={tab === 'artmd' ? 'active' : ''} onClick={() => setTab('artmd')}>ArtMD 图标配置</button>
      </div>

      {tab === 'icons' ? <div className="iconResourcePanelBody">
        <div className="iconResourceToolbar">
          <label className="iconResourceField"><span>单位或国家</span><select value={selectedKey} onChange={event => setSelectedKey(event.target.value)}>{groups.map(([group, targets]) => <optgroup key={group} label={group}>{targets.map(target => <option key={targetKey(target)} value={targetKey(target)}>{target.label && target.label !== target.id ? `${target.label} · ${target.id}` : target.id}</option>)}</optgroup>)}</select></label>
          <div className="iconResourceHint">用户图标写入独立 Tile；Ares 的 CameoPCX / File.Flag 会自动读取。用户图标优先，Mod 图标其次，原版内置 Tile 兜底。</div>
          <Button disabled={busy} onClick={() => void refreshAll()}><RefreshCw size={15}/>刷新 Mod 图标</Button>
        </div>

        <div className="iconResourceImport">
          <button type="button" className="iconResourcePreview" onClick={() => fileRef.current?.click()}>{previewUrl ? <img src={previewUrl} alt="导入图标预览"/> : <span>选择 PNG / JPG / BMP / WebP</span>}</button>
          <div className="iconResourceImportControls">
            <input ref={fileRef} className="iconResourceHiddenInput" type="file" accept="image/png,image/jpeg,image/bmp,image/webp" onChange={event => chooseFile(event.target.files?.[0] ?? null)}/>
            <div className="iconResourceInline"><Button onClick={() => fileRef.current?.click()}><Upload size={15}/>选择图片</Button><span className="iconResourceHint">{file?.name || '尚未选择文件'}</span></div>
            <div className="iconResourceInline"><label><input type="checkbox" checked={syncGame} onChange={event => setSyncGame(event.target.checked)}/>同步到游戏</label><label>单位图标 <select value={variant} disabled={selected?.kind !== 'unit'} onChange={event => setVariant(event.target.value as 'cameo' | 'alt')}><option value="cameo">普通 Cameo</option><option value="alt">精英 AltCameo</option></select></label></div>
            <div className="iconResourceHint">单位同步时生成 60×48、256 色 PCX 并维护 artmd.ini；国家同步时生成 PCX 并更新当前规则的 File.Flag。</div>
            <div className="iconResourceActions"><Button variant="accent" disabled={busy || !selected || !file} onClick={() => void importIcon()}>导入并应用</Button><Button disabled={busy || !selectedEntry || selectedEntry.source !== 'custom'} onClick={() => void removeIcon()}><Trash2 size={15}/>删除用户图标</Button></div>
          </div>
        </div>

        <div className="iconResourceGrid">{cards.length ? cards.map(({ kind, id, entry }) => {
          const target = snapshot?.targets.find(item => item.kind === kind && item.id.toLowerCase() === id.toLowerCase())
          const label = target?.label && target.label !== id ? `${target.label} · ${id}` : id
          return <div className="iconResourceCard" key={`${kind}:${id}`}><div className={`iconResourceCardIcon ${kind === 'country' ? 'country' : ''}`} style={snapshot ? iconStyle(kind, entry, snapshot) : undefined}/><div className="iconResourceCardText"><b title={label}>{label}</b><span title={entry.gameFile || ''}>{entry.gameFile || '仅编辑器资源'}</span><em className={`iconResourceBadge ${entry.source || ''}`}>{sourceLabel(entry.source)}</em></div></div>
        }) : <div className="iconResourceEmpty">当前规则中还没有可读取的用户 / Mod PCX 图标。原版单位仍使用内置 Tile。</div>}</div>
      </div> : <div className="iconResourcePanelBody">
        <div className="artmdPath">{snapshot?.artmd.path || '未确定 artmd.ini 路径；请先在设置中选择游戏启动程序。'}</div>
        <div className="artmdLayout">
          <div className="artmdRows">{snapshot?.artmd.rows.length ? snapshot.artmd.rows.map(row => <button key={row.section} type="button" className={artSection === row.section ? 'active' : ''} onClick={() => chooseArtRow(row)}><b>{row.section}</b><span>{row.CameoPCX || row.Cameo || row.AltCameoPCX}</span></button>) : <div className="iconResourceEmpty">暂未发现 Cameo / CameoPCX / AltCameoPCX。</div>}</div>
          <div className="artmdEditor"><h3>仅编辑图标关联</h3>
            <label className="iconResourceField"><span>Art Section</span><input value={artSection} list="artmd-known-sections" onChange={event => setArtSection(event.target.value)}/><datalist id="artmd-known-sections">{artSections.map(value => <option key={value} value={value}/>)}</datalist></label>
            <label className="iconResourceField"><span>Cameo（传统 SHP 名称）</span><input value={artCameo} onChange={event => setArtCameo(event.target.value)} placeholder="例如 MTNKICON"/></label>
            <label className="iconResourceField"><span>CameoPCX（Ares）</span><input value={artPcx} onChange={event => setArtPcx(event.target.value)} placeholder="例如 mytank.pcx"/></label>
            <label className="iconResourceField"><span>AltCameoPCX（Ares 精英）</span><input value={artAlt} onChange={event => setArtAlt(event.target.value)} placeholder="例如 mytank_elite.pcx"/></label>
            <div className="iconResourceHint">只管理这三个图标字段；其它 artmd.ini 内容原样保留。字段留空再保存会删除对应项。</div>
            <div className="iconResourceActions"><Button variant="accent" disabled={busy || !artSection.trim()} onClick={() => void saveArtMd()}>保存 ArtMD 图标配置</Button><Button disabled={busy} onClick={() => void refreshAll()}><RefreshCw size={15}/>重新读取</Button></div>
          </div>
        </div>
      </div>}
      <div className="iconResourceStatus">{message}</div>
    </div>
  </AppDialog>
}
