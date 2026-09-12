import React, { useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Select } from 'terry-react-ui-library'
import { workspaceApi, type SectionOption, type WorkspaceSnapshot } from './backend'
import { resolveVisualIcon } from './ra2VisualIcons'
import './image-parameter-control.css'

type Candidate = {
  value: string
  label: string
  category: string
}

type MountRecord = {
  root: Root
  row: HTMLElement
  hiddenHost: HTMLElement
}

const TECHNO_CATEGORIES = new Set(['步兵', '载具', '战车', '飞机', '建筑'])
const mounts = new Map<HTMLElement, MountRecord>()
let refreshTimer: ReturnType<typeof window.setTimeout> | null = null
let refreshGeneration = 0

function currentSectionId() {
  return document.querySelector<HTMLElement>('.entityHeaderHost .tc-entity-watermark')?.textContent?.trim() || ''
}

function categoryForSection(snapshot: WorkspaceSnapshot, section: string) {
  const folded = section.toLowerCase()
  for (const category of snapshot.categories) {
    if (category.items.some(item => item.section.toLowerCase() === folded)) return category.name
  }
  return ''
}

function candidatesFor(snapshot: WorkspaceSnapshot, currentSection: string, currentValue: string) {
  const currentCategory = categoryForSection(snapshot, currentSection)
  const categories = TECHNO_CATEGORIES.has(currentCategory)
    ? new Set([currentCategory])
    : TECHNO_CATEGORIES

  const result: Candidate[] = []
  const seen = new Set<string>()
  for (const category of snapshot.categories) {
    const normalizedCategory = category.name === '战车' ? '载具' : category.name
    const allowed = [...categories].some(item => (item === '战车' ? '载具' : item) === normalizedCategory)
    if (!allowed) continue
    for (const item of category.items) {
      const folded = item.section.toLowerCase()
      if (seen.has(folded)) continue
      seen.add(folded)
      const name = item.label?.trim() || item.section
      result.push({
        value: item.section,
        label: name.toLowerCase() === item.section.toLowerCase() ? item.section : `${name} · ${item.section}`,
        category: category.name,
      })
    }
  }

  if (currentValue && !seen.has(currentValue.toLowerCase())) {
    result.unshift({ value: currentValue, label: currentValue, category: currentCategory })
  }
  return result
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function ImageReferenceSelect({
  value,
  candidates,
  disabled,
  onChange,
}: {
  value: string
  candidates: Candidate[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [localValue, setLocalValue] = useState(value)
  useEffect(() => setLocalValue(value), [value])

  return <Select
    value={localValue}
    options={candidates.map(candidate => ({
      value: candidate.value,
      label: candidate.label,
      icon: resolveVisualIcon(candidate.value, { category: candidate.category, size: 32 }),
    }))}
    searchable
    searchPlaceholder="搜索图像来源单位或 Section"
    disabled={disabled}
    onChange={next => {
      setLocalValue(next)
      onChange(next)
    }}
  />
}

function cleanupDisconnectedMounts() {
  for (const [host, record] of mounts) {
    if (host.isConnected && record.row.isConnected) continue
    record.root.unmount()
    if (record.hiddenHost.isConnected) record.hiddenHost.style.removeProperty('display')
    mounts.delete(host)
  }
}

function imageRows() {
  return [...document.querySelectorAll<HTMLElement>('.fieldsPane.parameterTablePane:not(.rawTextTablePane) .parameterTableRow')]
    .filter(row => row.querySelector('.parameterKeyCell code')?.textContent?.trim().toLowerCase() === 'image')
}

async function enhanceImageControls() {
  cleanupDisconnectedMounts()
  const sectionId = currentSectionId()
  if (!sectionId) return
  const generation = ++refreshGeneration

  try {
    const [section, snapshot] = await Promise.all([workspaceApi.section(sectionId), workspaceApi.snapshot()])
    if (generation !== refreshGeneration || currentSectionId().toLowerCase() !== section.section.toLowerCase()) return
    const imageOptions = section.options.filter(option => option.key.trim().toLowerCase() === 'image')
    const rows = imageRows()

    rows.forEach((row, index) => {
      const option: SectionOption | undefined = imageOptions[index]
      if (!option) return
      const valueCell = row.querySelector<HTMLElement>('.parameterValueCell')
      const hiddenHost = valueCell?.querySelector<HTMLElement>('.rulesControlHost')
      if (!valueCell || !hiddenHost) return

      // If Image becomes a native Select in the core renderer later, leave it alone and
      // let the built-in implementation take ownership.
      if (hiddenHost.querySelector('.tc-select-button')) return

      let mount = valueCell.querySelector<HTMLElement>(':scope > .imageReferenceSelectMount')
      if (!mount) {
        mount = document.createElement('div')
        mount.className = 'imageReferenceSelectMount'
        valueCell.appendChild(mount)
      }

      hiddenHost.style.display = 'none'
      let record = mounts.get(mount)
      if (!record) {
        record = { root: createRoot(mount), row, hiddenHost }
        mounts.set(mount, record)
      } else {
        record.row = row
        record.hiddenHost = hiddenHost
      }

      const candidates = candidatesFor(snapshot, section.section, option.value)
      record.root.render(<ImageReferenceSelect
        value={option.value}
        candidates={candidates}
        disabled={Boolean(option.disabled)}
        onChange={next => {
          const input = hiddenHost.querySelector<HTMLInputElement>('input')
          if (!input) return
          setNativeInputValue(input, next)
          scheduleEnhance(120)
        }}
      />)
    })
  } catch (error) {
    console.warn('Unable to enhance Image parameter control', error)
  }
}

function scheduleEnhance(delay = 80) {
  if (refreshTimer != null) window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null
    void enhanceImageControls()
  }, delay)
}

const observer = new MutationObserver(mutations => {
  const relevant = mutations.some(mutation => {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement
    return !target?.closest('.imageReferenceSelectMount')
  })
  if (relevant) scheduleEnhance()
})

observer.observe(document.body, { childList: true, subtree: true, characterData: true })
window.addEventListener('rulesmd-icon-cache-updated', () => scheduleEnhance(0))
scheduleEnhance(0)
