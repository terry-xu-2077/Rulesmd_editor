import React, { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import { Image as ImageIcon, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Button } from 'terry-react-ui-library'
import { invoke } from '@tauri-apps/api/core'
import { AppDialog } from './AppDialog'
import './custom-icons.css'

export const CUSTOM_ICON_CACHE_KEY = 'rulesmd.customIconCache'

type IconKind = 'unit' | 'country'
type CropState = { zoom: number; x: number; y: number }
type ImageSize = { width: number; height: number }
type IconSourceSnapshot = { exists: boolean; image: string; sourceName: string; crop: CropState; hasOriginal?: boolean }
export type IconEntry = { x: number; y: number; cellWidth: number; cellHeight: number; source?: string; gameFile?: string }
export type IconTarget = { id: string; label: string; category: string; kind: IconKind; art_section: string }
export type ArtMdRow = { section: string; Cameo: string; CameoPCX: string; AltCameoPCX: string }
export type ArtMdSnapshot = { path: string; exists: boolean; rows: ArtMdRow[]; aresEnabled?: boolean }
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
  aresEnabled?: boolean
  syncBlockedByAres?: boolean
  sync?: { synced: boolean; game_file: string; art_section: string; rules_dirty: boolean }
}

type Props = { open: boolean; onClose: () => void; initialTargetId?: string }

const DEFAULT_CROP: CropState = { zoom: 1, x: .5, y: .5 }
const UNIT_FRAME = { width: 180, height: 144, label: '60×48' }
const COUNTRY_FRAME = { width: 180, height: 120, label: '60×40' }

async function backendCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('backend_call', { method, params })
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
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
  const sheetWidth = entry.cellWidth * 10
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

export function CustomIconDialog({ open, onClose, initialTargetId = '' }: Props) {
  const [snapshot, setSnapshot] = useState<IconLibrarySnapshot | null>(null)
  const [tab, setTab] = useState<'icons' | 'artmd'>('icons')
  const [selectedKey, setSelectedKey] = useState('')
  const [variant, setVariant] = useState<'cameo' | 'alt'>('cameo')
  const [syncGame, setSyncGame] = useState(true)
  const [sourceDataUrl, setSourceDataUrl] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [crop, setCrop] = useState<CropState>(DEFAULT_CROP)
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 0, height: 0 })
  const [message, setMessage] = useState('就绪')
  const [busy, setBusy] = useState(false)
  const [artSection, setArtSection] = useState('')
  const [artCameo, setArtCameo] = useState('')
  const [artPcx, setArtPcx] = useState('')
  const [artAlt, setArtAlt] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const sourceRequest = useRef(0)
  const dragRef = useRef<null | { pointerId: number; clientX: number; clientY: number; crop: CropState; displayWidth: number; displayHeight: number }>(null)

  const aresEnabled = snapshot?.aresEnabled ?? true

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setMessage('正在读取图标资源…')
    void refreshIconCache().then(next => {
      if (cancelled) return
      setSnapshot(next)
      const preferred = initialTargetId
        ? next.targets.find(target => target.id.toLowerCase() === initialTargetId.toLowerCase())
        : undefined
      setSelectedKey(preferred ? targetKey(preferred) : (next.targets[0] ? targetKey(next.targets[0]) : ''))
      setSyncGame(Boolean(next.aresEnabled ?? true))
      setMessage(`已读取：${Object.keys(next.unit).length} 个单位图标，${Object.keys(next.country).length} 个国家图标。`)
    }).catch(error => { if (!cancelled) setMessage(`读取图标资源失败：${String(error)}`) })
    return () => { cancelled = true }
  }, [open, initialTargetId])

  useEffect(() => { if (!aresEnabled) setSyncGame(false) }, [aresEnabled])

  const selected = useMemo(() => snapshot?.targets.find(target => targetKey(target) === selectedKey) ?? null, [selectedKey, snapshot])
  const frame = selected?.kind === 'country' ? COUNTRY_FRAME : UNIT_FRAME
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

  useEffect(() => {
    const request = ++sourceRequest.current
    setImageSize({ width: 0, height: 0 })
    if (!selected) {
      setSourceDataUrl('')
      setSourceName('')
      setCrop(DEFAULT_CROP)
      return
    }
    void backendCall<IconSourceSnapshot>('custom_icon_source', { kind: selected.kind, target_id: selected.id }).then(source => {
      if (request !== sourceRequest.current) return
      if (!source.exists || !source.image) {
        setSourceDataUrl('')
        setSourceName('')
        setCrop(DEFAULT_CROP)
        return
      }
      setSourceDataUrl(source.image)
      setSourceName(source.sourceName || '已有用户图标')
      setCrop({
        zoom: clamp(Number(source.crop?.zoom) || 1, 1, 8),
        x: clamp(Number(source.crop?.x) || .5, 0, 1),
        y: clamp(Number(source.crop?.y) || .5, 0, 1),
      })
    }).catch(() => {
      if (request !== sourceRequest.current) return
      setSourceDataUrl('')
      setSourceName('')
      setCrop(DEFAULT_CROP)
    })
  }, [selected?.id, selected?.kind])

  function constrainCrop(next: CropState): CropState {
    const zoom = clamp(next.zoom, 1, 8)
    if (!imageSize.width || !imageSize.height) return { zoom, x: clamp(next.x, 0, 1), y: clamp(next.y, 0, 1) }
    const cover = Math.max(frame.width / imageSize.width, frame.height / imageSize.height)
    const sourceCropWidth = frame.width / (cover * zoom)
    const sourceCropHeight = frame.height / (cover * zoom)
    const marginX = Math.min(.5, sourceCropWidth / (2 * imageSize.width))
    const marginY = Math.min(.5, sourceCropHeight / (2 * imageSize.height))
    return {
      zoom,
      x: clamp(next.x, marginX, 1 - marginX),
      y: clamp(next.y, marginY, 1 - marginY),
    }
  }

  const cropGeometry = useMemo(() => {
    if (!sourceDataUrl || !imageSize.width || !imageSize.height) return null
    const safe = constrainCrop(crop)
    const cover = Math.max(frame.width / imageSize.width, frame.height / imageSize.height)
    const scale = cover * safe.zoom
    const displayWidth = imageSize.width * scale
    const displayHeight = imageSize.height * scale
    return {
      displayWidth,
      displayHeight,
      left: frame.width / 2 - safe.x * displayWidth,
      top: frame.height / 2 - safe.y * displayHeight,
    }
  }, [crop, frame.height, frame.width, imageSize.height, imageSize.width, sourceDataUrl])

  async function chooseFile(next: File | null) {
    if (!next) return
    try {
      const data = await fileDataUrl(next)
      sourceRequest.current += 1
      setSourceDataUrl(data)
      setSourceName(next.name)
      setImageSize({ width: 0, height: 0 })
      setCrop(DEFAULT_CROP)
      setMessage('拖动画面调整位置，使用缩放滑块确定最终构图。')
    } catch (error) {
      setMessage(`读取图片失败：${String(error)}`)
    }
  }

  function beginCropDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!cropGeometry) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      crop,
      displayWidth: cropGeometry.displayWidth,
      displayHeight: cropGeometry.displayHeight,
    }
  }

  function moveCrop(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.clientX
    const dy = event.clientY - drag.clientY
    setCrop(constrainCrop({
      ...drag.crop,
      x: drag.crop.x - dx / drag.displayWidth,
      y: drag.crop.y - dy / drag.displayHeight,
    }))
  }

  function endCropDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function zoomCrop(nextZoom: number) {
    setCrop(current => constrainCrop({ ...current, zoom: nextZoom }))
  }

  function wheelCrop(event: ReactWheelEvent<HTMLDivElement>) {
    if (!sourceDataUrl) return
    event.preventDefault()
    zoomCrop(crop.zoom + (event.deltaY < 0 ? .12 : -.12))
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
    if (!sourceDataUrl) { setMessage('请先选择图片。'); return }
    const finalCrop = constrainCrop(crop)
    setBusy(true)
    setMessage(`正在生成 ${selected.id} 图标…`)
    try {
      const next = await backendCall<IconLibrarySnapshot>('import_custom_icon', {
        kind: selected.kind,
        target_id: selected.id,
        data_base64: sourceDataUrl,
        filename: sourceName,
        sync_game: aresEnabled && syncGame,
        variant,
        crop_zoom: finalCrop.zoom,
        crop_x: finalCrop.x,
        crop_y: finalCrop.y,
      })
      cacheSnapshot(next)
      setSnapshot(next)
      setCrop(finalCrop)
      if (next.sync?.rules_dirty) markRulesDirty()
      if (!aresEnabled) setMessage(`已应用 ${selected.id} 的编辑器图标。Ares 已关闭，因此没有写入游戏 PCX 关联。`)
      else setMessage(next.sync?.synced
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
      setSourceDataUrl('')
      setSourceName('')
      setImageSize({ width: 0, height: 0 })
      setCrop(DEFAULT_CROP)
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
        section: artSection.trim(),
        cameo: artCameo,
        cameo_pcx: aresEnabled ? artPcx : null,
        alt_cameo_pcx: aresEnabled ? artAlt : null,
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

  return <AppDialog open={open} title="图标资源" icon={<ImageIcon size={18}/>} onClose={onClose}>
    <div className="iconResourceShell">
      <div className="iconResourceTopline"><span>{snapshot?.gameRoot ? `游戏目录：${snapshot.gameRoot}` : '未绑定游戏目录'}</span></div>
      <div className="iconResourceTabs">
        <button type="button" className={tab === 'icons' ? 'active' : ''} onClick={() => setTab('icons')}>自定义 / Mod 图标</button>
        <button type="button" className={tab === 'artmd' ? 'active' : ''} onClick={() => setTab('artmd')}>ArtMD 图标配置</button>
      </div>

      {tab === 'icons' ? <div className="iconResourcePanelBody">
        <div className="iconResourceToolbar">
          <label className="iconResourceField"><span>单位或国家</span><select value={selectedKey} onChange={event => setSelectedKey(event.target.value)}>{groups.map(([group, targets]) => <optgroup key={group} label={group}>{targets.map(target => <option key={targetKey(target)} value={targetKey(target)}>{target.label && target.label !== target.id ? `${target.label} · ${target.id}` : target.id}</option>)}</optgroup>)}</select></label>
          <div className="iconResourceHint">用户图标优先，Mod 图标其次，原版内置 Tile 兜底。</div>
          <Button disabled={busy} onClick={() => void refreshAll()}><RefreshCw size={15}/>刷新</Button>
        </div>

        {!aresEnabled && <div className="iconResourceAresNotice">Ares 支持已关闭。可以更换编辑器内显示图标，但不会生成或写入 CameoPCX / AltCameoPCX / File.Flag。</div>}

        <div className="iconResourceImport">
          <div className="iconCropColumn">
            <div
              className={`iconCropFrame ${sourceDataUrl ? 'hasImage' : ''}`}
              style={{ width: frame.width, height: frame.height }}
              onPointerDown={beginCropDrag}
              onPointerMove={moveCrop}
              onPointerUp={endCropDrag}
              onPointerCancel={endCropDrag}
              onWheel={wheelCrop}
              title={sourceDataUrl ? '拖动画面调整位置；滚轮可缩放' : '选择图片'}
            >
              {sourceDataUrl && cropGeometry ? <img
                src={sourceDataUrl}
                alt="图标裁剪预览"
                draggable={false}
                onLoad={event => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                style={{
                  width: cropGeometry.displayWidth,
                  height: cropGeometry.displayHeight,
                  left: cropGeometry.left,
                  top: cropGeometry.top,
                }}
              /> : sourceDataUrl ? <img
                src={sourceDataUrl}
                alt="图标裁剪预览"
                draggable={false}
                onLoad={event => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              /> : <button type="button" className="iconCropEmpty" onClick={() => fileRef.current?.click()}>选择图片</button>}
              <div className="iconCropGuide" aria-hidden="true"/>
              <span className="iconCropSize">{frame.label}</span>
            </div>
            <div className="iconCropZoom">
              <span>缩放</span><input type="range" min="1" max="4" step="0.01" value={Math.min(4, crop.zoom)} disabled={!sourceDataUrl} onChange={event => zoomCrop(Number(event.target.value))}/><em>{crop.zoom.toFixed(2)}×</em>
            </div>
            <button type="button" className="iconCropReset" disabled={!sourceDataUrl} onClick={() => setCrop(constrainCrop(DEFAULT_CROP))}>重置构图</button>
          </div>

          <div className="iconResourceImportControls">
            <input ref={fileRef} className="iconResourceHiddenInput" type="file" accept="image/png,image/jpeg,image/bmp,image/webp" onChange={event => void chooseFile(event.target.files?.[0] ?? null)}/>
            <div className="iconResourceInline"><Button onClick={() => fileRef.current?.click()}><Upload size={15}/>选择图片</Button><span className="iconResourceHint">{sourceName || 'PNG / JPG / BMP / WebP'}</span></div>
            <div className="iconResourceHint">裁剪框就是最终构图。拖动画面调整位置，缩放后会生成 {frame.label} 图标；仅保存最终裁剪结果，如需重新构图请重新选择原图。</div>
            <div className="iconResourceInline"><label className={!aresEnabled ? 'disabledChoice' : ''}><input type="checkbox" disabled={!aresEnabled} checked={aresEnabled && syncGame} onChange={event => setSyncGame(event.target.checked)}/>同步到游戏（Ares）</label>{selected?.kind === 'unit' && <label className={!aresEnabled ? 'disabledChoice' : ''}>单位图标 <select value={variant} disabled={!aresEnabled} onChange={event => setVariant(event.target.value as 'cameo' | 'alt')}><option value="cameo">普通 Cameo</option><option value="alt">精英 AltCameo</option></select></label>}</div>
            <div className="iconResourceActions"><Button variant="accent" disabled={busy || !selected || !sourceDataUrl} onClick={() => void importIcon()}>导入并应用</Button><Button disabled={busy || !selectedEntry || selectedEntry.source !== 'custom'} onClick={() => void removeIcon()}><Trash2 size={15}/>删除用户图标</Button></div>
          </div>
        </div>

        {cards.length > 0 && <div className="iconResourceGrid">{cards.map(({ kind, id, entry }) => {
          const target = snapshot?.targets.find(item => item.kind === kind && item.id.toLowerCase() === id.toLowerCase())
          const label = target?.label && target.label !== id ? `${target.label} · ${id}` : id
          return <div className="iconResourceCard" key={`${kind}:${id}`}><div className={`iconResourceCardIcon ${kind === 'country' ? 'country' : ''}`} style={snapshot ? iconStyle(kind, entry, snapshot) : undefined}/><div className="iconResourceCardText"><b title={label}>{label}</b><span>{entry.gameFile || '仅编辑器'}</span><em className={`iconResourceBadge ${entry.source || ''}`}>{sourceLabel(entry.source)}</em></div></div>
        })}</div>}
      </div> : <div className="iconResourcePanelBody">
        <div className="artmdPath">{snapshot?.artmd.path || '未确定 artmd.ini 路径；请先在设置中选择游戏启动程序。'}</div>
        {!aresEnabled && <div className="iconResourceAresNotice">原版可使用 Cameo=SHP 名称。PCX Cameo 是 Ares 扩展，因此当前只读显示，不允许修改。</div>}
        <div className="artmdLayout">
          <div className="artmdRows">{snapshot?.artmd.rows.length ? snapshot.artmd.rows.map(row => <button key={row.section} type="button" className={artSection === row.section ? 'active' : ''} onClick={() => chooseArtRow(row)}><b>{row.section}</b><span>{row.CameoPCX || row.Cameo || row.AltCameoPCX}</span></button>) : <div className="iconResourceEmpty">暂未发现图标关联。</div>}</div>
          <div className="artmdEditor"><h3>图标关联</h3>
            <label className="iconResourceField"><span>Art Section</span><input value={artSection} list="artmd-known-sections" onChange={event => setArtSection(event.target.value)}/><datalist id="artmd-known-sections">{artSections.map(value => <option key={value} value={value}/>)}</datalist></label>
            <label className="iconResourceField"><span>Cameo（原版 SHP 名称）</span><input value={artCameo} onChange={event => setArtCameo(event.target.value)} placeholder="例如 MTNKICON"/></label>
            <label className={`iconResourceField ${!aresEnabled ? 'aresOnlyDisabled' : ''}`}><span>CameoPCX（仅 Ares）</span><input disabled={!aresEnabled} value={artPcx} onChange={event => setArtPcx(event.target.value)} placeholder="例如 mytank.pcx"/></label>
            <label className={`iconResourceField ${!aresEnabled ? 'aresOnlyDisabled' : ''}`}><span>AltCameoPCX（仅 Ares）</span><input disabled={!aresEnabled} value={artAlt} onChange={event => setArtAlt(event.target.value)} placeholder="例如 mytank_elite.pcx"/></label>
            <div className="iconResourceActions"><Button variant="accent" disabled={busy || !artSection.trim()} onClick={() => void saveArtMd()}>保存</Button><Button disabled={busy} onClick={() => void refreshAll()}><RefreshCw size={15}/>重新读取</Button></div>
          </div>
        </div>
      </div>}
      <div className="iconResourceStatus">{message}</div>
    </div>
  </AppDialog>
}