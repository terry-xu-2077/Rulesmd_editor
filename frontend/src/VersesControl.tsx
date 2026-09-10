import React, { useEffect, useMemo, useState } from 'react'
import { SlidersVertical } from 'lucide-react'
import { Button, Slider, TextField } from 'terry-react-ui-library'
import { AppDialog } from './AppDialog'
import './verses-control.css'

const ARMOR_LABELS = [
  '无装甲', '布质', '铁质', '金属', '中型', '重型', '木质', '钢铁', '混凝土', '特殊1', '特殊2',
] as const

function parseVerses(value: string): number[] | null {
  const tokens = value.split(',').map(item => item.trim())
  if (tokens.length !== ARMOR_LABELS.length) return null
  const result: number[] = []
  for (const token of tokens) {
    const match = token.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))%$/)
    if (!match) return null
    const numeric = Number(match[1])
    if (!Number.isFinite(numeric)) return null
    result.push(numeric)
  }
  return result
}

function formatValue(value: number) {
  if (!Number.isFinite(value)) return '0'
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)))
}

function serializeVerses(values: number[]) {
  return values.map(value => `${formatValue(value)}%`).join(',')
}

export function VersesControl({ value, rawValue, onChange, disabled = false }: {
  value: string
  rawValue?: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const parsed = useMemo(() => parseVerses(value), [value])
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<number[]>(parsed ?? [])

  useEffect(() => {
    if (!open && parsed) setDraft(parsed)
  }, [open, parsed])

  if (!parsed) {
    return <TextField value={value} rawValue={rawValue} onChange={onChange} placeholder="Verses=100%,...（需要 11 项）" disabled={disabled}/>
  }

  const parsedValues = parsed

  function openEditor() {
    if (disabled) return
    setDraft([...parsedValues])
    setOpen(true)
  }

  function update(index: number, next: number) {
    const clamped = Math.max(0, Math.min(1000, next))
    setDraft(current => current.map((currentValue, currentIndex) => currentIndex === index ? clamped : currentValue))
  }

  function confirm() {
    if (draft.length !== ARMOR_LABELS.length) return
    onChange(serializeVerses(draft))
    setOpen(false)
  }

  return <>
    <button className="versesTrigger" type="button" disabled={disabled} onClick={openEditor} title={value}>
      <SlidersVertical size={15}/><span>{value}</span><b>调整</b>
    </button>
    <AppDialog
      open={open}
      title="伤害百分比调整 · Verses"
      icon={<SlidersVertical size={18}/>}
      onClose={() => setOpen(false)}
      closeOnBackdrop
    >
      <div className="versesDialog">
        <div className="versesHint">原版 11 种护甲的伤害倍率。滑轨用于 0–100%，数值框可输入最高 1000%。</div>
        <div className="versesEqualizer" role="group" aria-label="Verses 伤害倍率">
          {ARMOR_LABELS.map((label, index) => <div className="versesBand" key={label}>
            <strong>{formatValue(draft[index] ?? 0)}%</strong>
            <Slider orientation="vertical" value={draft[index] ?? 0} min={0} max={100} step={1} allowOutOfRangeInput onChange={next => update(index, next)}/>
            <span>{label}</span>
          </div>)}
        </div>
        <div className="versesDialogActions"><Button className="quietButton" onClick={() => setOpen(false)}>取消</Button><Button variant="accent" onClick={confirm}>确定</Button></div>
      </div>
    </AppDialog>
  </>
}
