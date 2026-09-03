import React, { useEffect, useMemo, useState } from 'react'
import { Box, ChevronDown, ChevronRight, Users } from 'lucide-react'
import { workspaceApi } from './backend'
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

type Ownership = {
  owner: string[]
  required: string[]
  forbidden: string[]
}

type UnitLeaf = UnitTreeRow & {
  countryHint?: string
}

type TypeGroup = { name: string; units: UnitLeaf[] }
type CountryGroup = { key: string; label: string; types: TypeGroup[] }
type FactionGroup = { key: string; label: string; countries: CountryGroup[] }

const COUNTRY_INFO: Record<string, { label: string; faction: 'allied' | 'soviet' | 'yuri' }> = {
  Americans: { label: '美国', faction: 'allied' },
  British: { label: '英国', faction: 'allied' },
  French: { label: '法国', faction: 'allied' },
  Germans: { label: '德国', faction: 'allied' },
  Alliance: { label: '韩国', faction: 'allied' },
  Russians: { label: '苏俄', faction: 'soviet' },
  Confederation: { label: '古巴', faction: 'soviet' },
  Africans: { label: '利比亚', faction: 'soviet' },
  Arabs: { label: '伊拉克', faction: 'soviet' },
  YuriCountry: { label: '尤里', faction: 'yuri' },
}

const FACTION_COUNTRIES = {
  allied: ['Americans', 'British', 'French', 'Germans', 'Alliance'],
  soviet: ['Russians', 'Confederation', 'Africans', 'Arabs'],
  yuri: ['YuriCountry'],
}

const FACTION_LABELS: Record<string, string> = {
  allied: '盟军',
  soviet: '苏军',
  yuri: '尤里',
  neutral: '其他',
}

const FACTION_ORDER = ['allied', 'soviet', 'yuri', 'neutral']
const TYPE_ORDER = ['步兵', '载具', '飞机', '建筑', '超级武器', '武器', '弹头', '弹体']
const TECHNO_CATEGORIES = new Set(['步兵', '载具', '战车', '飞机', '建筑'])

function splitList(value: string | undefined) {
  return (value || '').split(',').map(item => item.trim()).filter(Boolean)
}

function parseOwnership(raw: string): Map<string, Ownership> {
  const result = new Map<string, Ownership>()
  let section = ''
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    if (line.startsWith('[') && line.includes(']')) {
      section = line.slice(1, line.indexOf(']')).trim()
      if (!result.has(section.toLowerCase())) result.set(section.toLowerCase(), { owner: [], required: [], forbidden: [] })
      continue
    }
    if (!section || !line.includes('=')) continue
    const eq = line.indexOf('=')
    const key = line.slice(0, eq).trim().toLowerCase()
    const value = line.slice(eq + 1).split(';', 1)[0].trim()
    const row = result.get(section.toLowerCase())!
    if (key === 'owner') row.owner = splitList(value)
    else if (key === 'requiredhouses') row.required = splitList(value)
    else if (key === 'forbiddenhouses') row.forbidden = splitList(value)
  }
  return result
}

function intersection(left: string[], right: string[]) {
  const wanted = new Set(right.map(value => value.toLowerCase()))
  return left.filter(value => wanted.has(value.toLowerCase()))
}

function effectiveCountries(ownership?: Ownership) {
  if (!ownership) return []
  let countries = [...ownership.owner]
  if (ownership.required.length) countries = countries.length ? intersection(countries, ownership.required) : [...ownership.required]
  if (ownership.forbidden.length) {
    const forbidden = new Set(ownership.forbidden.map(value => value.toLowerCase()))
    countries = countries.filter(value => !forbidden.has(value.toLowerCase()))
  }
  return [...new Map(countries.map(value => [value.toLowerCase(), value])).values()]
}

function resolveFaction(countries: string[], fallback: Side) {
  const factions = new Set(countries.map(country => COUNTRY_INFO[country]?.faction).filter(Boolean))
  if (factions.size === 1) return [...factions][0] as 'allied' | 'soviet' | 'yuri'
  if (factions.size > 1) return 'neutral'
  return fallback === 'allied' || fallback === 'soviet' || fallback === 'yuri' ? fallback : 'neutral'
}

function countryBucket(countries: string[], faction: string) {
  if (!countries.length) return { key: 'unassigned', label: '未归属' }
  const canonical = FACTION_COUNTRIES[faction as keyof typeof FACTION_COUNTRIES] ?? []
  const lower = new Set(countries.map(value => value.toLowerCase()))
  const isCommon = canonical.length > 0 && canonical.every(value => lower.has(value.toLowerCase())) && countries.every(value => canonical.some(item => item.toLowerCase() === value.toLowerCase()))
  if (isCommon) return { key: 'common', label: '通用' }
  if (countries.length === 1) {
    const country = countries[0]
    return { key: `country:${country.toLowerCase()}`, label: COUNTRY_INFO[country]?.label || country }
  }
  const labels = countries.map(country => COUNTRY_INFO[country]?.label || country)
  return { key: `shared:${countries.map(value => value.toLowerCase()).sort().join('+')}`, label: `部分国家共享 · ${labels.join(' / ')}` }
}

function sortTypes(a: TypeGroup, b: TypeGroup) {
  const ai = TYPE_ORDER.indexOf(a.name)
  const bi = TYPE_ORDER.indexOf(b.name)
  return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name, 'zh-CN')
}

function UnitIcon({ id }: { id: string }) {
  if (hasLegacyIcon(id)) return <div className="unitTreeIcon" style={{ ...legacyIconStyle(id, 31) }}/>
  return <div className="unitTreeIcon fallback"><Box size={15}/></div>
}

export function UnitTree({ rows, selectedId, query, documentEpoch, onSelect }: Props) {
  const [ownership, setOwnership] = useState<Map<string, Ownership>>(new Map())
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    void workspaceApi.rawText().then(raw => {
      if (!cancelled) setOwnership(parseOwnership(raw))
    }).catch(() => {
      if (!cancelled) setOwnership(new Map())
    })
    return () => { cancelled = true }
  }, [documentEpoch])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(row => `${row.label} ${row.id} ${row.type} ${row.category}`.toLowerCase().includes(q))
  }, [query, rows])

  const groups = useMemo<FactionGroup[]>(() => {
    const factionMap = new Map<string, Map<string, { label: string; types: Map<string, UnitLeaf[]> }>>()

    for (const row of filteredRows) {
      const isTechno = TECHNO_CATEGORIES.has(row.category)
      const ownershipRow = ownership.get(row.id.toLowerCase())
      const countries = isTechno ? effectiveCountries(ownershipRow) : []
      const faction = isTechno ? resolveFaction(countries, row.side) : 'neutral'
      const bucket = isTechno ? countryBucket(countries, faction) : { key: 'unassigned', label: '未归属' }
      const typeName = row.category === '战车' ? '载具' : row.category

      if (!factionMap.has(faction)) factionMap.set(faction, new Map())
      const countriesMap = factionMap.get(faction)!
      if (!countriesMap.has(bucket.key)) countriesMap.set(bucket.key, { label: bucket.label, types: new Map() })
      const typeMap = countriesMap.get(bucket.key)!.types
      if (!typeMap.has(typeName)) typeMap.set(typeName, [])
      typeMap.get(typeName)!.push({ ...row, countryHint: countries.map(country => COUNTRY_INFO[country]?.label || country).join(' / ') })
    }

    return FACTION_ORDER.flatMap(faction => {
      const countryMap = factionMap.get(faction)
      if (!countryMap) return []
      const countries: CountryGroup[] = [...countryMap.entries()].map(([key, data]) => ({
        key,
        label: data.label,
        types: [...data.types.entries()].map(([name, units]) => ({
          name,
          units: units.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN') || a.id.localeCompare(b.id)),
        })).sort(sortTypes),
      }))
      countries.sort((a, b) => {
        const rank = (key: string) => key === 'common' ? 0 : key.startsWith('country:') ? 1 : key.startsWith('shared:') ? 2 : 3
        return rank(a.key) - rank(b.key) || a.label.localeCompare(b.label, 'zh-CN')
      })
      return [{ key: faction, label: FACTION_LABELS[faction] || faction, countries }]
    })
  }, [filteredRows, ownership])

  const searching = Boolean(query.trim())
  const isOpen = (key: string) => searching || !collapsed[key]
  const toggle = (key: string) => setCollapsed(value => ({ ...value, [key]: !value[key] }))

  if (!rows.length) return <div className="unitTreeEmpty">还没有可浏览的对象。</div>

  return <div className="unitHierarchy">
    {groups.map(faction => {
      const factionKey = `f:${faction.key}`
      const factionCount = faction.countries.reduce((sum, country) => sum + country.types.reduce((inner, type) => inner + type.units.length, 0), 0)
      return <section className="unitFaction" key={faction.key}>
        <button className="unitTreeLevel faction" onClick={() => toggle(factionKey)}>
          {isOpen(factionKey) ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<strong>{faction.label}</strong><em>{factionCount}</em>
        </button>
        {isOpen(factionKey) && <div className="unitTreeBranch factionBranch">
          {faction.countries.map(country => {
            const countryKey = `${factionKey}|c:${country.key}`
            const countryCount = country.types.reduce((sum, type) => sum + type.units.length, 0)
            return <div className="unitCountry" key={country.key}>
              <button className="unitTreeLevel country" onClick={() => toggle(countryKey)}>
                {isOpen(countryKey) ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}<Users size={14}/><span>{country.label}</span><em>{countryCount}</em>
              </button>
              {isOpen(countryKey) && <div className="unitTreeBranch countryBranch">
                {country.types.map(type => {
                  const typeKey = `${countryKey}|t:${type.name}`
                  return <div className="unitType" key={type.name}>
                    <button className="unitTreeLevel type" onClick={() => toggle(typeKey)}>
                      {isOpen(typeKey) ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<span>{type.name}</span><em>{type.units.length}</em>
                    </button>
                    {isOpen(typeKey) && <div className="unitLeaves">
                      {type.units.map(unit => <button key={unit.id} className={`unitTreeLeaf ${selectedId === unit.id ? 'selected' : ''}`} onClick={() => onSelect(unit)} title={unit.countryHint || unit.id}>
                        <UnitIcon id={unit.id}/><span><b>{unit.label}</b><small>{unit.id}</small></span><ChevronRight size={14}/>
                      </button>)}
                    </div>}
                  </div>
                })}
              </div>}
            </div>
          })}
        </div>}
      </section>
    })}
    {!groups.length && <div className="unitTreeEmpty">没有匹配的对象。</div>}
  </div>
}
