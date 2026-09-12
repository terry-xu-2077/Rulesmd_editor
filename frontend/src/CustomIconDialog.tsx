import React, { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
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
export type IconLibrarySnapshot = {
  version: number
  unitTile: string
  countryTile: string
  unit: Record<string, IconEntry>
  country: Record<string, IconEntry>
  targets: IconTarget[]
  gameRoot: string
  customCount: number
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

export function CustomIconDialog({ open, onClose, initialTargetId = '' }: Props) {
  const [snapshot, setSnapshot] = useState<IconLibrarySnapshot | null>(null)
  const [selectedKey, setSelectedKey] = useState('')
  const [sourceDataUrl, setSourceDataUrl] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [crop, setCrop] = useState<CropState>(DEFAULT_CROP)
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 0, height: 0 })
  const [message, setMessage] = useState('就绪')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const sourceRequest = useRef(0)
  const dragRef = useRef<null | {
    pointerId: number
    clientX: number
    clientY: number
    crop: CropState
    displayWidth: number
    displayHeight: number
  }>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setMessage('正在读取应用内图标资源…')
    void refreshIconCache().then(next => {
      if (cancelled) return
      setSnapshot(next)
      const preferred = initialTargetId
        ? next.targets.find(target => target.id.toLowerCase() === initialTargetId.toLowerCase())
        : undefined
      setSelectedKey(preferred ? targetKey(preferred) : (next.targets[0] ? targetKey(next.targets[0]) : ''))
      setMessage(`已读取：${Object.keys(next.unit).length} 个单位图标，${Object.keys(next.country).length} 个国家图标。`)
    }).catch(error => {
      if (!cancelled) setMessage(`读取图标资源失败：${String(error)}`)
    })
    return () => { cancelled = true }
  }, [open, initialTargetId])

  const selected = useMemo(
    () => snapshot?.targets.find(target => targetKey(target) === selectedKey) ?? null,
    [selectedKey, snapshot],
  )
  const frame = selected?.kind === 'country' ? COUNTRY_FRAME : UNIT_FRAME
  const groups = useMemo(() => {
    const result = new Map<string, IconTarget[]>()
    for (const target of snapshot?.targets ?? []) {
      const group = target.kind === 'country' ? '国家' : target.category
      result.set(group, [...(result.get(group) ?? []), target])
    }
    return [...result.entries()]
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
    void backendCall<IconSourceSnapshot>('custom_icon_source', {
      kind: selected.kind,
      target_id: selected.id,
    }).then(source => {
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
    if (!imageSize.width || !imageSize.height) {
      return { zoom, x: clamp(next.x, 0, 1), y: clamp(next.y, 0, 1) }
    }
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
      setMessage('拖动画面调整位置，使用缩放滑块确定应用内最终构图。')
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
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
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
    setMessage('正在重新扫描应用内用户图标与可读取的 Mod 图标…')
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
    setMessage(`正在生成 ${selected.id} 的应用内图标…`)
    try {
      const next = await backendCall<IconLibrarySnapshot>('import_custom_icon', {
        kind: selected.kind,
        target_id: selected.id,
        data_base64: sourceDataUrl,
        filename: sourceName,
        crop_zoom: finalCrop.zoom,
        crop_x: finalCrop.x,
        crop_y: finalCrop.y,
      })
      cacheSnapshot(next)
      setSnapshot(next)
      setCrop(finalCrop)
      setMessage(`已应用 ${selected.id} 的编辑器图标；不会修改任何游戏文件。`)
    } catch (error) {
      setMessage(`导入失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function removeIcon() {
    if (!selected || !window.confirm(`删除 ${selected.id} 的用户自定义图标吗？`)) return
    setBusy(true)
    try {
      const next = await backendCall<IconLibrarySnapshot>('remove_custom_icon', {
        kind: selected.kind,
        target_id: selected.id,
      })
      cacheSnapshot(next)
      setSnapshot(next)
      setSourceDataUrl('')
      setSourceName('')
      setImageSize({ width: 0, height: 0 })
      setCrop(DEFAULT_CROP)
      setMessage(`已删除 ${selected.id} 的用户图标；若存在可读取的 Mod 图标，会自动回退显示。`)
    } catch (error) {
      setMessage(`删除失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const selectedEntry = selected && snapshot
    ? (selected.kind === 'unit' ? snapshot.unit[selected.id] : snapshot.country[selected.id])
    : undefined

  return <AppDialog open={open} title="图标资源" icon={<ImageIcon size={18}/>} onClose={onClose}>
    <div className="iconResourceShell">
      <div className="iconResourceTopline">
        <span>仅影响编辑器内显示，不生成 PCX，不修改 ArtMD / rulesmd.ini。</span>
      </div>

      <div className="iconResourcePanelBody">
        <div className="iconResourceToolbar">
          <label className="iconResourceField">
            <span>单位或国家</span>
            <select value={selectedKey} onChange={event => setSelectedKey(event.target.value)}>
              {groups.map(([group, targets]) => <optgroup key={group} label={group}>
                {targets.map(target => <option key={targetKey(target)} value={targetKey(target)}>
                  {target.label && target.label !== target.id ? `${target.label} · ${target.id}` : target.id}
                </option>)}
              </optgroup>)}
            </select>
          </label>
          <div className="iconResourceHint">用户图标优先，Mod 图标其次，原版内置 Tile 兜底。</div>
          <Button disabled={busy} onClick={() => void refreshAll()}><RefreshCw size={15}/>刷新</Button>
        </div>

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
                onLoad={event => setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })}
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
                onLoad={event => setImageSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })}
              /> : <button type="button" className="iconCropEmpty" onClick={() => fileRef.current?.click()}>选择图片</button>}
              <div className="iconCropGuide" aria-hidden="true"/>
              <span className="iconCropSize">{frame.label}</span>
            </div>
            <div className="iconCropZoom">
              <span>缩放</span>
              <input
                type="range"
                min="1"
                max="4"
                step="0.01"
                value={Math.min(4, crop.zoom)}
                disabled={!sourceDataUrl}
                onChange={event => zoomCrop(Number(event.target.value))}
              />
              <em>{crop.zoom.toFixed(2)}×</em>
            </div>
            <button
              type="button"
              className="iconCropReset"
              disabled={!sourceDataUrl}
              onClick={() => setCrop(constrainCrop(DEFAULT_CROP))}
            >重置构图</button>
          </div>

          <div className="iconResourceImportControls">
            <input
              ref={fileRef}
              className="iconResourceHiddenInput"
              type="file"
              accept="image/png,image/jpeg,image/bmp,image/webp"
              onChange={event => void chooseFile(event.target.files?.[0] ?? null)}
            />
            <div className="iconResourceInline">
              <Button onClick={() => fileRef.current?.click()}><Upload size={15}/>选择图片</Button>
              <span className="iconResourceHint">{sourceName || 'PNG / JPG / BMP / WebP'}</span>
            </div>
            <div className="iconResourceHint">
              裁剪框就是编辑器内最终构图。拖动画面调整位置，缩放后生成 {frame.label} 图标；不会写入游戏资源。
            </div>
            <div className="iconResourceActions">
              <Button variant="accent" disabled={busy || !selected || !sourceDataUrl} onClick={() => void importIcon()}>
                导入并应用
              </Button>
              <Button
                disabled={busy || !selectedEntry || selectedEntry.source !== 'custom'}
                onClick={() => void removeIcon()}
              >
                <Trash2 size={15}/>删除用户图标
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="iconResourceStatus">{message}</div>
    </div>
  </AppDialog>
}
