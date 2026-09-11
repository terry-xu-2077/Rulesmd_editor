import React, { useEffect, useMemo, useRef } from 'react'
import { Ban, CheckCircle2, ClipboardPaste, Copy, RotateCcw, Trash2 } from 'lucide-react'
import type { SectionOption } from './backend'

export type ParameterContextMenuState = {
  lineId: number | null
  x: number
  y: number
}

type Props = {
  state: ParameterContextMenuState | null
  options: SectionOption[]
  section: string
  clipboardCount: number
  onClose: () => void
  onSetDisabled: (options: SectionOption[], disabled: boolean) => void
  onRestore: (options: SectionOption[]) => void
  onDelete: (options: SectionOption[]) => void
  onCopy: (options: SectionOption[]) => void
  onPaste: () => void
}

export function ParameterContextMenu({
  state,
  options,
  section,
  clipboardCount,
  onClose,
  onSetDisabled,
  onRestore,
  onDelete,
  onCopy,
  onPaste,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!state) return
    const closeOnPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const closeOnScroll = () => onClose()
    document.addEventListener('pointerdown', closeOnPointer)
    document.addEventListener('keydown', closeOnKey)
    window.addEventListener('scroll', closeOnScroll, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer)
      document.removeEventListener('keydown', closeOnKey)
      window.removeEventListener('scroll', closeOnScroll, true)
    }
  }, [onClose, state])

  const position = useMemo(() => {
    if (!state) return { left: 0, top: 0 }
    const width = 236
    const estimatedItems = (options.length ? 4 : 0) + (clipboardCount ? 1 : 0)
    const height = 62 + estimatedItems * 44 + 20
    return {
      left: Math.max(8, Math.min(state.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(state.y, window.innerHeight - height - 8)),
    }
  }, [clipboardCount, options.length, state])

  if (!state) return null

  const first = options[0]
  const multi = options.length > 1
  const allDisabled = options.length > 0 && options.every(option => Boolean(option.disabled))
  const nextDisabled = !allDisabled

  return <div ref={ref} className="parameterContextMenu" style={position} role="menu" aria-label={`${section || '当前 Section'} 参数操作`} onContextMenu={event => event.preventDefault()}>
    <div className="parameterContextTitle">
      <strong>{multi ? `已选择 ${options.length} 个参数` : first ? (first.label || first.key) : '参数操作'}</strong>
      <code>{multi ? `${first?.key ?? ''} 等 ${options.length} 项` : first?.key ?? `[${section}]`}</code>
    </div>

    {options.length > 0 && <>
      <button type="button" role="menuitem" onClick={() => { onSetDisabled(options, nextDisabled); onClose() }}>
        {allDisabled ? <CheckCircle2 size={15}/> : <Ban size={15}/>}<span>{allDisabled ? (multi ? '启用所选参数' : '启用参数') : (multi ? '停用所选参数' : '停用参数')}</span>
        <small>{allDisabled ? '恢复为活动参数' : '转为编辑器注释，便于调试与后续恢复'}</small>
      </button>
      <button type="button" role="menuitem" onClick={() => { onRestore(options); onClose() }}>
        <RotateCcw size={15}/><span>{multi ? '还原所选参数' : '还原参数'}</span><small>恢复到打开文件时的状态</small>
      </button>
      <button type="button" role="menuitem" onClick={() => { onCopy(options); onClose() }}>
        <Copy size={15}/><span>{multi ? `复制 ${options.length} 个参数` : '复制参数'}</span><small>可切换到其他单位后粘贴</small>
      </button>
    </>}

    {clipboardCount > 0 && <button type="button" role="menuitem" onClick={() => { onPaste(); onClose() }}>
      <ClipboardPaste size={15}/><span>粘贴参数</span><small>{clipboardCount} 项；同名参数将覆盖当前值</small>
    </button>}

    {options.length > 0 && <>
      <div className="parameterContextSeparator"/>
      <button type="button" role="menuitem" className="danger" onClick={() => { onDelete(options); onClose() }}>
        <Trash2 size={15}/><span>{multi ? `删除所选 ${options.length} 项…` : '删除参数…'}</span><small>从当前 Section 中移除</small>
      </button>
    </>}
  </div>
}
