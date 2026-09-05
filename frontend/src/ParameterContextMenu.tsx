import React, { useEffect, useMemo, useRef } from 'react'
import { Ban, CheckCircle2, RotateCcw, Trash2 } from 'lucide-react'
import type { SectionOption } from './backend'

export type ParameterContextMenuState = {
  lineId: number
  x: number
  y: number
}

type Props = {
  state: ParameterContextMenuState | null
  option: SectionOption | null
  onClose: () => void
  onToggleDisabled: (option: SectionOption) => void
  onRestore: (option: SectionOption) => void
  onDelete: (option: SectionOption) => void
}

export function ParameterContextMenu({ state, option, onClose, onToggleDisabled, onRestore, onDelete }: Props) {
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
    const width = 220
    const height = 174
    return {
      left: Math.max(8, Math.min(state.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(state.y, window.innerHeight - height - 8)),
    }
  }, [state])

  if (!state || !option) return null
  const disabled = Boolean(option.disabled)

  return <div ref={ref} className="parameterContextMenu" style={position} role="menu" aria-label={`${option.key} 参数操作`} onContextMenu={event => event.preventDefault()}>
    <div className="parameterContextTitle">
      <strong>{option.label || option.key}</strong>
      <code>{option.key}</code>
    </div>
    <button type="button" role="menuitem" onClick={() => { onToggleDisabled(option); onClose() }}>
      {disabled ? <CheckCircle2 size={15}/> : <Ban size={15}/>}<span>{disabled ? '启用参数' : '禁用参数'}</span>
      <small>{disabled ? '恢复参与游戏规则' : '保留为注释，不参与游戏规则'}</small>
    </button>
    <button type="button" role="menuitem" onClick={() => { onRestore(option); onClose() }}>
      <RotateCcw size={15}/><span>还原参数</span><small>恢复到打开文件时的状态</small>
    </button>
    <div className="parameterContextSeparator"/>
    <button type="button" role="menuitem" className="danger" onClick={() => { onDelete(option); onClose() }}>
      <Trash2 size={15}/><span>删除参数…</span><small>从当前 Section 中移除</small>
    </button>
  </div>
}
