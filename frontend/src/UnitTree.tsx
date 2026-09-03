import React, { useMemo, useState } from 'react'
import { Box, ChevronDown, ChevronRight } from 'lucide-react'
import { hasLegacyIcon, legacyIconStyle } from './legacyIcons'
import './unit-tree.css'

type Side = 'allied' | 'soviet' | 'yuri' | 'neutral'

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
type FactionGroup = { key: Side; label: string; types: TypeGroup[] }

const FACTION_LABELS: Record<Side, string> = {
  allied: '盟军',
  soviet: '苏军',
  yuri: '尤里',
  neutral: '其他',
}

const FACTION_ORDER: Side[] = ['allied', 'soviet', 'yuri', 'neutral']
const TYPE_ORDER = ['步兵', '载具', '飞机', '建筑', '超级武器', '武器', '弹头', '弹体']

function normalizedType(category: string) {
  return category === '战车' ? '载具' : category
}

function sortTypes(a: TypeGroup, b: TypeGroup) {
  const ai = TYPE_ORDER.indexOf(a.name)
  const bi = TYPE_ORDER.indexOf(b.name)
  return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name, 'zh-CN')
}

function UnitIcon({ id }: { id: string }) {
  if (hasLegacyIcon(id)) return <div className="unitTreeIcon" style={{ ...legacyIconStyle(id, 28) }}/>
  return <div className="unitTreeIcon fallback"><Box size={14}/></div>
}

export function UnitTree({ rows, selectedId, query, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(row => `${row.label} ${row.id} ${row.type} ${row.category}`.toLowerCase().includes(q))
  }, [query, rows])

  const groups = useMemo<FactionGroup[]>(() => {
    const factions = new Map<Side, Map<string, UnitTreeRow[]>>()
    for (const row of filteredRows) {
      const faction: Side = row.side || 'neutral'
      if (!factions.has(faction)) factions.set(faction, new Map())
      const types = factions.get(faction)!
      const type = normalizedType(row.category)
      if (!types.has(type)) types.set(type, [])
      types.get(type)!.push(row)
    }

    return FACTION_ORDER.flatMap(faction => {
      const types = factions.get(faction)
      if (!types) return []
      return [{
        key: faction,
        label: FACTION_LABELS[faction],
        types: [...types.entries()].map(([name, units]) => ({
          name,
          units: units.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN') || a.id.localeCompare(b.id)),
        })).sort(sortTypes),
      }]
    })
  }, [filteredRows])

  const searching = Boolean(query.trim())
  const isOpen = (key: string, defaultOpen: boolean) => searching || (key in expanded ? expanded[key] : defaultOpen)
  const toggle = (key: string, open: boolean) => setExpanded(value => ({ ...value, [key]: !open }))

  if (!rows.length) return <div className="unitTreeEmpty">还没有可浏览的对象。</div>

  return <div className="unitHierarchy">
    {groups.map(faction => {
      const factionKey = `f:${faction.key}`
      const factionCount = faction.types.reduce((sum, type) => sum + type.units.length, 0)
      const factionHasSelected = faction.types.some(type => type.units.some(unit => unit.id === selectedId))
      const factionOpen = isOpen(factionKey, factionHasSelected || faction.key !== 'neutral')
      return <section className="unitFaction" key={faction.key}>
        <button className="unitTreeLevel faction" onClick={() => toggle(factionKey, factionOpen)}>
          {factionOpen ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}<strong>{faction.label}</strong><em>{factionCount}</em>
        </button>
        {factionOpen && <div className="unitTreeBranch factionBranch">
          {faction.types.map(type => {
            const typeKey = `${factionKey}|t:${type.name}`
            const typeHasSelected = type.units.some(unit => unit.id === selectedId)
            const typeOpen = isOpen(typeKey, typeHasSelected)
            return <div className="unitType" key={type.name}>
              <button className="unitTreeLevel type" onClick={() => toggle(typeKey, typeOpen)}>
                {typeOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<span>{type.name}</span><em>{type.units.length}</em>
              </button>
              {typeOpen && <div className="unitLeaves">
                {type.units.map(unit => <button key={unit.id} className={`unitTreeLeaf ${selectedId === unit.id ? 'selected' : ''}`} onClick={() => onSelect(unit)} title={`${unit.label} · ${unit.id}`}>
                  <UnitIcon id={unit.id}/><span><b>{unit.label}</b><small>{unit.id}</small></span><ChevronRight size={13}/>
                </button>)}
              </div>}
            </div>
          })}
        </div>}
      </section>
    })}
    {!groups.length && <div className="unitTreeEmpty">没有匹配的对象。</div>}
  </div>
}
