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
type CountryGroup = { country: UnitTreeRow; units: UnitTreeRow[] }
type FactionGroup = { key: Side; label: string; types: TypeGroup[]; countries: CountryGroup[] }

const FACTION_LABELS: Record<Side, string> = {
  allied: '盟军',
  soviet: '苏军',
  yuri: '尤里',
  neutral: '其他',
}

const FACTION_ORDER: Side[] = ['allied', 'soviet', 'yuri', 'neutral']
const TYPE_ORDER = ['步兵', '载具', '飞机', '建筑', '超级武器', '武器', '弹头', '弹体']
const COUNTRY_OWNABLE_TYPES = new Set(['步兵', '载具', '飞机', '建筑'])

function normalizedType(category: string) {
  return category === '战车' ? '载具' : category
}

function sortTypes(a: TypeGroup, b: TypeGroup) {
  const ai = TYPE_ORDER.indexOf(a.name)
  const bi = TYPE_ORDER.indexOf(b.name)
  return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name, 'zh-CN')
}

function sortUnits(a: UnitTreeRow, b: UnitTreeRow) {
  const ai = TYPE_ORDER.indexOf(normalizedType(a.category))
  const bi = TYPE_ORDER.indexOf(normalizedType(b.category))
  return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
    || a.label.localeCompare(b.label, 'zh-CN')
    || a.id.localeCompare(b.id)
}

function UnitIcon({ id }: { id: string }) {
  if (hasLegacyIcon(id)) return <div className="unitTreeIcon" style={{ ...legacyIconStyle(id, 28) }}/>
  return <div className="unitTreeIcon fallback"><Box size={14}/></div>
}

function CountryFlag({ id }: { id: string }) {
  const style = countryIconStyle(id, 31)
  if (style) return <span className="unitCountryFlag" style={style}/>
  return <span className="unitCountryFlag fallback"><Box size={13}/></span>
}

function UnitLeaf({ unit, selectedId, onSelect }: { unit: UnitTreeRow; selectedId?: string | null; onSelect: (row: UnitTreeRow) => void }) {
  return <button key={unit.id} className={`unitTreeLeaf ${selectedId === unit.id ? 'selected' : ''}`} onClick={() => onSelect(unit)} title={`${unit.label} · ${unit.id}`}>
    <UnitIcon id={unit.id}/><span><b>{unit.label}</b><small>{unit.id}</small></span><ChevronRight size={13}/>
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

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const browsable = rows.filter(row => {
      const id = row.id.trim().toLowerCase()
      return id !== 'general' && !isLegacyGlobalSubsection(row.id)
    })
    if (!q) return browsable
    return browsable.filter(row => `${row.label} ${row.id} ${row.type} ${row.category}`.toLowerCase().includes(q))
  }, [query, rows])

  const groups = useMemo<FactionGroup[]>(() => {
    const effective = filteredRows.map(row => ({ ...row, side: rawRules ? navigation.sideOf(row.id) : row.side }))
    const countryRows = effective.filter(row => normalizedType(row.category) === '国家')
    const countryById = new Map(countryRows.map(row => [row.id.toLowerCase(), row]))
    const countryUnits = new Map<string, UnitTreeRow[]>()
    const commonRows: UnitTreeRow[] = []

    for (const row of effective) {
      const type = normalizedType(row.category)
      if (type === '国家') continue
      const exclusive = rawRules && COUNTRY_OWNABLE_TYPES.has(type) ? navigation.exclusiveCountryOf(row.id) : null
      const country = exclusive ? countryById.get(exclusive.toLowerCase()) : undefined
      if (country && country.side === row.side) {
        const key = country.id.toLowerCase()
        if (!countryUnits.has(key)) countryUnits.set(key, [])
        countryUnits.get(key)!.push(row)
      } else {
        commonRows.push(row)
      }
    }

    return FACTION_ORDER.flatMap(faction => {
      const factionCommon = commonRows.filter(row => row.side === faction)
      const types = new Map<string, UnitTreeRow[]>()
      for (const row of factionCommon) {
        const type = normalizedType(row.category)
        if (!types.has(type)) types.set(type, [])
        types.get(type)!.push(row)
      }
      const countryGroups = countryRows
        .filter(country => country.side === faction)
        .map(country => ({
          country,
          units: [...(countryUnits.get(country.id.toLowerCase()) ?? [])].sort(sortUnits),
        }))
        .sort((a, b) => a.country.label.localeCompare(b.country.label, 'zh-CN') || a.country.id.localeCompare(b.country.id))

      if (!types.size && !countryGroups.length) return []
      return [{
        key: faction,
        label: FACTION_LABELS[faction],
        types: [...types.entries()].map(([name, units]) => ({
          name,
          units: units.sort(sortUnits),
        })).sort(sortTypes),
        countries: countryGroups,
      }]
    })
  }, [filteredRows, navigation, rawRules])

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
      {groups.map(faction => {
        const factionKey = `f:${faction.key}`
        const factionCount = faction.types.reduce((sum, type) => sum + type.units.length, 0)
          + faction.countries.reduce((sum, country) => sum + 1 + country.units.length, 0)
        const factionHasSelected = faction.types.some(type => type.units.some(unit => unit.id === selectedId))
          || faction.countries.some(country => country.country.id === selectedId || country.units.some(unit => unit.id === selectedId))
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
                  {type.units.map(unit => <UnitLeaf key={unit.id} unit={unit} selectedId={selectedId} onSelect={onSelect}/>) }
                </div>}
              </div>
            })}

            {faction.countries.length > 0 && <div className="unitCountrySection">
              <div className="unitCountrySectionLabel">国家</div>
              {faction.countries.map(group => {
                const key = `${factionKey}|c:${group.country.id}`
                const hasSelected = group.country.id === selectedId || group.units.some(unit => unit.id === selectedId)
                const open = isOpen(key, hasSelected)
                return <div className="unitCountry" key={group.country.id}>
                  <div className={`unitCountryHeader ${group.country.id === selectedId ? 'selected' : ''}`}>
                    <button className="unitCountryToggle" onClick={() => toggle(key, open)} title={open ? '收起国家独有对象' : '展开国家独有对象'}>
                      {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>} 
                    </button>
                    <button className="unitCountryIdentity" onClick={() => onSelect(group.country)} title={`编辑国家 ${group.country.label} · ${group.country.id}`}>
                      <CountryFlag id={group.country.id}/><span><b>{group.country.label}</b><small>{group.country.id}</small></span>
                    </button>
                    <em>{group.units.length}</em>
                  </div>
                  {open && <div className="unitCountryLeaves">
                    {group.units.length
                      ? group.units.map(unit => <UnitLeaf key={unit.id} unit={unit} selectedId={selectedId} onSelect={onSelect}/>)
                      : <div className="unitCountryEmpty">没有仅属于此国家的对象</div>}
                  </div>}
                </div>
              })}
            </div>}
          </div>}
        </section>
      })}
      {!groups.length && <div className="unitTreeEmpty">没有匹配的对象。</div>}
    </div>
  </div>
}
