import React, { useEffect, useMemo, useState } from 'react'
import { Box, ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react'
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

function UnitIcon({ id }: { id: string }) {
  if (hasLegacyIcon(id)) return <span className="unitTreeIcon" style={{ ...legacyIconStyle(id, 28) }}/>
  return <span className="unitTreeIcon fallback"><Box size={14}/></span>
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
    className={`unitTreeLeaf ${selectedId === unit.id ? 'selected' : ''}`}
    onClick={() => onSelect(unit)}
    title={`${unit.label} · ${unit.id}${countryLabel}`}
  >
    <span className="unitTreeIconWrap">
      <UnitIcon id={unit.id}/>
      {exclusiveCountry && <CountryBadge id={exclusiveCountry.id}/>} 
    </span>
    <span className="unitTreeLeafText"><b>{unit.label}</b><small>{unit.id}</small></span>
    <ChevronRight size={13}/>
  </button>
}

export function UnitTree({ rows, selectedId, query, documentEpoch, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [rawRules, setRawRules] = useState('')

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

  const navigation = useMemo(() => buildRulesNavigation(rawRules), [rawRules])

  const generalRow = useMemo(
    () => rows.find(row => row.id.trim().toLowerCase() === 'general') ?? null,
    [rows],
  )

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
        const open = isOpen(key, true)
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
  </div>
}
