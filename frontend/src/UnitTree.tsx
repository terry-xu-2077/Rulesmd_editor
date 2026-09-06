import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bomb,
  Box,
  Building2,
  ChevronDown,
  ChevronRight,
  Crosshair,
  Flag,
  Plane,
  Rocket,
  SlidersHorizontal,
  Sparkles,
  Truck,
  Users,
} from 'lucide-react'
import { workspaceApi } from './backend'
import { isLegacyGlobalSubsection } from './generalGroups'
import { countryIconStyle, hasLegacyIcon, legacyIconStyle } from './legacyIcons'
import { buildRulesNavigation, type NavigationSide } from './rulesNavigation'
import './unit-tree.css'

type Side = NavigationSide

export type UnitTreeRow = {
  id: string
  label: string
  type: string
  category: string
  side: Side
}

type Props = {
  rows: UnitTreeRow[]
  selectedId?: string | null
  query: string
  documentEpoch: number
  onSelect: (row: UnitTreeRow) => void
}

type TypeGroup = { name: string; units: UnitTreeRow[] }
type ReferenceEdge = { row: UnitTreeRow; key: string }
type DockRect = { left: number; width: number; bottom: number; tableVisible: boolean }

// Keep the left navigation close to the old Qt / Web editors: object type is the
// primary hierarchy. Faction and country ownership are attributes of a unit, not
// extra tree levels.
const TYPE_ORDER = ['步兵', '载具', '飞机', '建筑', '超级武器', '国家', '武器', '弹头', '弹体']
const COUNTRY_OWNABLE_TYPES = new Set(['步兵', '载具', '飞机', '建筑'])

function normalizedType(category: string) {
  return category === '战车' ? '载具' : category
}

function sortTypes(a: TypeGroup, b: TypeGroup) {
  const ai = TYPE_ORDER.indexOf(a.name)
  const bi = TYPE_ORDER.indexOf(b.name)
  return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name, 'zh-CN')
}

function FallbackTypeIcon({ category, size = 15 }: { category: string; size?: number }) {
  const type = normalizedType(category)
  const Icon = type === '步兵' ? Users
    : type === '载具' ? Truck
      : type === '飞机' ? Plane
        : type === '建筑' ? Building2
          : type === '超级武器' ? Sparkles
            : type === '国家' ? Flag
              : type === '武器' ? Crosshair
                : type === '弹头' ? Bomb
                  : type === '弹体' ? Rocket
                    : Box
  return <Icon size={size}/>
}

function UnitIcon({ unit, compact = false }: { unit: UnitTreeRow; compact?: boolean }) {
  const size = compact ? 24 : 28
  if (normalizedType(unit.category) === '国家') {
    const flag = countryIconStyle(unit.id, compact ? 24 : 28)
    if (flag) return <span className={`unitTreeIcon ${compact ? 'compact' : ''}`} style={flag}/>
  }
  if (hasLegacyIcon(unit.id)) return <span className={`unitTreeIcon ${compact ? 'compact' : ''}`} style={{ ...legacyIconStyle(unit.id, size) }}/>
  return <span className={`unitTreeIcon fallback semantic ${compact ? 'compact' : ''}`}><FallbackTypeIcon category={unit.category} size={compact ? 13 : 15}/></span>
}

function CountryBadge({ id }: { id: string }) {
  const style = countryIconStyle(id, 16)
  if (!style) return null
  return <span className="unitCountryBadge" style={style} aria-label={`国家 ${id}`}/>
}

function UnitLeaf({
  unit,
  exclusiveCountry,
  selectedId,
  onSelect,
}: {
  unit: UnitTreeRow
  exclusiveCountry?: UnitTreeRow
  selectedId?: string | null
  onSelect: (row: UnitTreeRow) => void
}) {
  const countryLabel = exclusiveCountry ? ` · 仅 ${exclusiveCountry.label}` : ''
  return <button
    key={unit.id}
    data-unit-id={unit.id.toLowerCase()}
    className={`unitTreeLeaf ${selectedId?.toLowerCase() === unit.id.toLowerCase() ? 'selected' : ''}`}
    onClick={() => onSelect(unit)}
    title={`${unit.label} · ${unit.id}${countryLabel}`}
  >
    <span className="unitTreeIconWrap">
      <UnitIcon unit={unit}/>
      {exclusiveCountry && <CountryBadge id={exclusiveCountry.id}/>} 
    </span>
    <span className="unitTreeLeafText"><b>{unit.label}</b><small>{unit.id}</small></span>
    <ChevronRight size={13}/>
  </button>
}

function parseReferenceGraph(rawRules: string, rows: UnitTreeRow[]) {
  const rowById = new Map(rows.map(row => [row.id.trim().toLowerCase(), row]))
  const incoming = new Map<string, ReferenceEdge[]>()
  const outgoing = new Map<string, ReferenceEdge[]>()
  let section = ''

  const addEdge = (source: UnitTreeRow, target: UnitTreeRow, key: string) => {
    if (source.id.toLowerCase() === target.id.toLowerCase()) return
    const sourceKey = source.id.toLowerCase()
    const targetKey = target.id.toLowerCase()
    const out = outgoing.get(sourceKey) ?? []
    if (!out.some(edge => edge.row.id.toLowerCase() === targetKey && edge.key.toLowerCase() === key.toLowerCase())) {
      out.push({ row: target, key })
      outgoing.set(sourceKey, out)
    }
    const inc = incoming.get(targetKey) ?? []
    if (!inc.some(edge => edge.row.id.toLowerCase() === sourceKey && edge.key.toLowerCase() === key.toLowerCase())) {
      inc.push({ row: source, key })
      incoming.set(targetKey, inc)
    }
  }

  for (const rawLine of rawRules.split(/\r?\n/)) {
    const header = rawLine.match(/^\s*\[([^\]]+)]/)
    if (header) {
      section = header[1].trim()
      continue
    }
    if (!section || /^\s*[;#]/.test(rawLine)) continue
    const match = rawLine.match(/^\s*([^=;#]+?)\s*=\s*(.*)$/)
    if (!match) continue
    const source = rowById.get(section.toLowerCase())
    if (!source) continue
    const key = match[1].trim()
    const value = match[2].split(';', 1)[0]
    for (const token of value.split(',').map(item => item.trim()).filter(Boolean)) {
      const target = rowById.get(token.toLowerCase())
      if (target) addEdge(source, target, key)
    }
  }

  return { incoming, outgoing }
}

function ReferenceNode({ edge, direction, onSelect }: {
  edge: ReferenceEdge
  direction: 'incoming' | 'outgoing'
  onSelect: (row: UnitTreeRow) => void
}) {
  const relation = direction === 'incoming' ? `${edge.row.id}.${edge.key} → 当前对象` : `当前对象.${edge.key} → ${edge.row.id}`
  return <button className="referenceChainNode" onClick={() => onSelect(edge.row)} title={relation}>
    <UnitIcon unit={edge.row} compact/>
    <span><b>{edge.row.label}</b><small>{edge.row.id}</small></span>
    <em>{edge.key}</em>
  </button>
}

export function UnitTree({ rows, selectedId, query, documentEpoch, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [rawRules, setRawRules] = useState('')
  const [dockRect, setDockRect] = useState<DockRect | null>(null)
  const selectedRef = useRef(selectedId)
  selectedRef.current = selectedId

  useEffect(() => {
    setExpanded({})
  }, [documentEpoch])

  useEffect(() => {
    let cancelled = false
    if (!rows.length) {
      setRawRules('')
      return () => { cancelled = true }
    }
    void workspaceApi.rawText().then(raw => {
      if (!cancelled) setRawRules(raw)
    }).catch(() => {
      if (!cancelled) setRawRules('')
    })
    return () => { cancelled = true }
  }, [documentEpoch, rows.length])

  useEffect(() => {
    const update = () => {
      const editor = document.querySelector<HTMLElement>('.editor')
      if (!editor) {
        setDockRect(null)
        return
      }
      const rect = editor.getBoundingClientRect()
      setDockRect({
        left: rect.left,
        width: rect.width,
        bottom: Math.max(0, window.innerHeight - rect.bottom),
        tableVisible: Boolean(editor.querySelector('.parameterTablePane')),
      })
    }
    update()
    const observer = new MutationObserver(update)
    const editor = document.querySelector<HTMLElement>('.editor')
    if (editor) observer.observe(editor, { childList: true, subtree: true })
    const resizeObserver = typeof ResizeObserver !== 'undefined' && editor ? new ResizeObserver(update) : null
    resizeObserver?.observe(editor!)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [documentEpoch])

  useEffect(() => {
    if (!selectedId) return
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(selectedId.toLowerCase()) : selectedId.toLowerCase().replace(/["\\]/g, '\\$&')
    const item = document.querySelector<HTMLElement>(`.unitTreeLeaf[data-unit-id="${escaped}"]`)
    item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])

  const navigation = useMemo(() => buildRulesNavigation(rawRules), [rawRules])
  const referenceGraph = useMemo(() => parseReferenceGraph(rawRules, rows), [rawRules, rows])

  const generalRow = useMemo(
    () => rows.find(row => row.id.trim().toLowerCase() === 'general') ?? null,
    [rows],
  )

  const selectedRow = useMemo(() => {
    const key = selectedId?.trim().toLowerCase()
    return key ? rows.find(row => row.id.trim().toLowerCase() === key) ?? null : null
  }, [rows, selectedId])

  const referenceChain = useMemo(() => {
    if (!selectedRow) return { incoming: [] as ReferenceEdge[], outgoing: [] as ReferenceEdge[] }
    const key = selectedRow.id.toLowerCase()
    return {
      incoming: referenceGraph.incoming.get(key) ?? [],
      outgoing: referenceGraph.outgoing.get(key) ?? [],
    }
  }, [referenceGraph, selectedRow])

  const hasReferenceChain = Boolean(referenceChain.incoming.length || referenceChain.outgoing.length)

  useEffect(() => {
    document.body.classList.toggle('has-reference-chain', hasReferenceChain && Boolean(dockRect?.tableVisible))
    return () => document.body.classList.remove('has-reference-chain')
  }, [dockRect?.tableVisible, hasReferenceChain])

  const countryById = useMemo(() => new Map(
    rows
      .filter(row => normalizedType(row.category) === '国家')
      .map(row => [row.id.trim().toLowerCase(), row]),
  ), [rows])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const browsable = rows.filter(row => {
      const id = row.id.trim().toLowerCase()
      return id !== 'general' && !isLegacyGlobalSubsection(row.id)
    })
    if (!q) return browsable
    return browsable.filter(row => `${row.label} ${row.id} ${row.type} ${row.category}`.toLowerCase().includes(q))
  }, [query, rows])

  const groups = useMemo<TypeGroup[]>(() => {
    const grouped = new Map<string, UnitTreeRow[]>()
    // Preserve source / registration order inside each type, like the old editors.
    for (const row of filteredRows) {
      const type = normalizedType(row.category)
      if (!grouped.has(type)) grouped.set(type, [])
      grouped.get(type)!.push(row)
    }
    return [...grouped.entries()].map(([name, units]) => ({ name, units })).sort(sortTypes)
  }, [filteredRows])

  const exclusiveCountryOf = (unit: UnitTreeRow) => {
    const type = normalizedType(unit.category)
    if (!rawRules || !COUNTRY_OWNABLE_TYPES.has(type)) return undefined
    const countryId = navigation.exclusiveCountryOf(unit.id)
    return countryId ? countryById.get(countryId.trim().toLowerCase()) : undefined
  }

  const searching = Boolean(query.trim())
  const isOpen = (key: string, defaultOpen: boolean) => searching || (key in expanded ? expanded[key] : defaultOpen)
  const toggle = (key: string, open: boolean) => setExpanded(value => ({ ...value, [key]: !open }))

  if (!rows.length) return <div className="unitTreeEmpty">还没有可浏览的对象。</div>

  return <div className="unitHierarchy">
    {generalRow && <div className="unitGlobalBlock">
      <button
        className={`unitGlobalRule ${selectedId?.toLowerCase() === 'general' ? 'selected' : ''}`}
        onClick={() => onSelect(generalRow)}
        title="游戏全局规则 · General"
      >
        <span className="unitGlobalIcon"><SlidersHorizontal size={15}/></span>
        <span className="unitGlobalText"><b>{generalRow.label || '全局规则'}</b><small>General</small></span>
      </button>
    </div>}

    <div className="unitTreeScroller">
      {groups.map(group => {
        const key = `t:${group.name}`
        const selectedInGroup = group.units.some(unit => unit.id.toLowerCase() === selectedId?.toLowerCase())
        const open = isOpen(key, true || selectedInGroup)
        return <section className="unitTypeGroup" key={group.name}>
          <button className="unitTreeLevel legacyType" onClick={() => toggle(key, open)}>
            {open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}<strong>{group.name}</strong><em>{group.units.length}</em>
          </button>
          {open && <div className="unitLeaves legacyLeaves">
            {group.units.map(unit => <UnitLeaf
              key={unit.id}
              unit={unit}
              exclusiveCountry={exclusiveCountryOf(unit)}
              selectedId={selectedId}
              onSelect={onSelect}
            />)}
          </div>}
        </section>
      })}
      {!groups.length && <div className="unitTreeEmpty">没有匹配的对象。</div>}
    </div>

    {hasReferenceChain && selectedRow && dockRect?.tableVisible && <div
      className="referenceChainDock"
      style={{ left: dockRect.left, width: dockRect.width, bottom: dockRect.bottom }}
      aria-label="引用链"
    >
      <span className="referenceChainLabel">引用链</span>
      <div className="referenceChainFlow">
        {referenceChain.incoming.map(edge => <React.Fragment key={`in:${edge.row.id}:${edge.key}`}>
          <ReferenceNode edge={edge} direction="incoming" onSelect={onSelect}/><span className="referenceChainArrow">→</span>
        </React.Fragment>)}
        <div className="referenceChainCurrent" title={`${selectedRow.label} · ${selectedRow.id}`}>
          <UnitIcon unit={selectedRow} compact/><span><b>{selectedRow.label}</b><small>{selectedRow.id}</small></span>
        </div>
        {referenceChain.outgoing.map(edge => <React.Fragment key={`out:${edge.row.id}:${edge.key}`}>
          <span className="referenceChainArrow">→</span><ReferenceNode edge={edge} direction="outgoing" onSelect={onSelect}/>
        </React.Fragment>)}
      </div>
    </div>}
  </div>
}
