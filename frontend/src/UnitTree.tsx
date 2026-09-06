import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bomb, Box, Building2, ChevronDown, ChevronRight, Crosshair, Flag, Plane, Rocket, SlidersHorizontal, Sparkles, Truck, Users } from 'lucide-react'
import { workspaceApi } from './backend'
import { isLegacyGlobalSubsection } from './generalGroups'
import { countryIconStyle, hasLegacyIcon, legacyIconStyle } from './legacyIcons'
import { buildRulesNavigation, type NavigationSide } from './rulesNavigation'
import './unit-tree.css'

type Side = NavigationSide
export type UnitTreeRow = { id: string; label: string; type: string; category: string; side: Side }
type Props = { rows: UnitTreeRow[]; selectedId?: string | null; query: string; documentEpoch: number; onSelect: (row: UnitTreeRow) => void }
type TypeGroup = { name: string; units: UnitTreeRow[] }
type SideGroup = { side: Side; label: string; types: TypeGroup[] }
type ReferenceEdge = { row: UnitTreeRow; key: string }
type DockRect = { left: number; width: number; bottom: number; tableVisible: boolean }

const SIDE_ORDER: Array<{ side: Side; label: string }> = [
  { side: 'allied', label: '盟军' },
  { side: 'soviet', label: '苏军' },
  { side: 'yuri', label: '尤里' },
  { side: 'neutral', label: '其他' },
]
const UNIT_TYPE_ORDER = ['步兵', '载具', '飞机', '建筑', '超级武器', '国家']
const WEAPON_TYPE_ORDER = ['武器', '弹头', '弹体']
const WEAPON_TYPES = new Set(WEAPON_TYPE_ORDER)
const COUNTRY_OWNABLE_TYPES = new Set(['步兵', '载具', '飞机', '建筑'])
const BUILDABLE_TYPES = new Set(['步兵', '载具', '飞机', '建筑'])
const DIRECT_REFERENCE_KEYS = new Set(['primary', 'secondary', 'eliteprimary', 'elitesecondary', 'occupyweapon', 'eliteoccupyweapon', 'deathweapon', 'deploysinto', 'undeploysinto', 'spawns', 'enslaves'])

function normalizedType(category: string) {
  if (category === '战车') return '载具'
  if (/弹体|抛射/i.test(category)) return '弹体'
  return category
}

export function FallbackTypeIcon({ category, size = 15 }: { category: string; size?: number }) {
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

export function UnitIcon({ unit, compact = false }: { unit: UnitTreeRow; compact?: boolean }) {
  const size = compact ? 24 : 28
  if (normalizedType(unit.category) === '国家') {
    const flag = countryIconStyle(unit.id, size)
    if (flag) return <span className={`unitTreeIcon ${compact ? 'compact' : ''}`} style={flag}/>
  }
  if (hasLegacyIcon(unit.id)) return <span className={`unitTreeIcon ${compact ? 'compact' : ''}`} style={{ ...legacyIconStyle(unit.id, size) }}/>
  return <span className={`unitTreeIcon fallback semantic ${compact ? 'compact' : ''}`}><FallbackTypeIcon category={unit.category} size={compact ? 13 : 15}/></span>
}

function CountryBadge({ id, className = '' }: { id: string; className?: string }) {
  const style = countryIconStyle(id, 16)
  return style ? <span className={`unitCountryBadge ${className}`} style={style} aria-label={`国家 ${id}`}/> : null
}

function UnitLeaf({ unit, exclusiveCountry, selectedId, onSelect }: { unit: UnitTreeRow; exclusiveCountry?: UnitTreeRow; selectedId?: string | null; onSelect: (row: UnitTreeRow) => void }) {
  return <button data-unit-id={unit.id.toLowerCase()} className={`unitTreeLeaf ${selectedId?.toLowerCase() === unit.id.toLowerCase() ? 'selected' : ''}`} onClick={() => onSelect(unit)} title={`${unit.label} · ${unit.id}${exclusiveCountry ? ` · 仅 ${exclusiveCountry.label}` : ''}`}>
    <span className="unitTreeIconWrap"><UnitIcon unit={unit}/>{exclusiveCountry && <CountryBadge id={exclusiveCountry.id}/>}</span>
    <span className="unitTreeLeafText"><b>{unit.label}</b><small>{unit.id}</small></span><ChevronRight size={13}/>
  </button>
}

function parseDirectReferencesFor(raw: string, selected: UnitTreeRow | null, rows: UnitTreeRow[]): ReferenceEdge[] {
  if (!selected || !BUILDABLE_TYPES.has(normalizedType(selected.category)) || !raw) return []
  const selectedId = selected.id.toLowerCase()
  const rowById = new Map(rows.map(row => [row.id.toLowerCase(), row]))
  const result: ReferenceEdge[] = []
  let inSelectedSection = false

  for (const rawLine of raw.split(/\r?\n/)) {
    const header = rawLine.match(/^\s*\[([^\]]+)]/)
    if (header) {
      inSelectedSection = header[1].trim().toLowerCase() === selectedId
      continue
    }
    if (!inSelectedSection || /^\s*[;#]/.test(rawLine)) continue
    const match = rawLine.match(/^\s*([^=;#]+?)\s*=\s*(.*)$/)
    if (!match) continue
    const key = match[1].trim()
    if (!DIRECT_REFERENCE_KEYS.has(key.toLowerCase())) continue
    for (const token of match[2].split(';', 1)[0].split(',').map(value => value.trim()).filter(Boolean)) {
      const target = rowById.get(token.toLowerCase())
      if (!target || target.id.toLowerCase() === selectedId) continue
      if (!result.some(edge => edge.row.id.toLowerCase() === target.id.toLowerCase() && edge.key.toLowerCase() === key.toLowerCase())) result.push({ row: target, key })
    }
  }
  return result
}

function relationLabel(key: string) {
  const labels: Record<string, string> = {
    primary: '主武器', secondary: '副武器', eliteprimary: '精英主武器', elitesecondary: '精英副武器',
    occupyweapon: '驻军武器', eliteoccupyweapon: '精英驻军武器', deathweapon: '死亡武器',
    deploysinto: '部署建筑', undeploysinto: '反部署', spawns: '生成单位', enslaves: '奴隶单位',
  }
  return labels[key.toLowerCase()] ?? key
}

function ReferenceNode({ edge, onSelect }: { edge: ReferenceEdge; onSelect: (row: UnitTreeRow) => void }) {
  return <button className="referenceChainNode" onClick={() => onSelect(edge.row)} title={`${edge.key} → ${edge.row.id}`}><UnitIcon unit={edge.row} compact/><span><b>{edge.row.label}</b><small>{edge.row.id}</small></span><em>{relationLabel(edge.key)}</em></button>
}

function sameDockRect(a: DockRect | null, b: DockRect | null) {
  return a?.left === b?.left && a?.width === b?.width && a?.bottom === b?.bottom && a?.tableVisible === b?.tableVisible
}

export function UnitTree({ rows, selectedId, query, documentEpoch, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [rawRules, setRawRules] = useState('')
  const [dockRect, setDockRect] = useState<DockRect | null>(null)
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null)

  useEffect(() => setExpanded({}), [documentEpoch])
  useEffect(() => {
    let cancelled = false
    if (!rows.length) { setRawRules(''); return () => { cancelled = true } }
    void workspaceApi.rawText().then(raw => { if (!cancelled) setRawRules(raw) }).catch(() => { if (!cancelled) setRawRules('') })
    return () => { cancelled = true }
  }, [documentEpoch, rows.length])

  useEffect(() => {
    setHeaderHost(document.querySelector<HTMLElement>('.entityHeaderHost'))
  }, [documentEpoch, selectedId])

  useEffect(() => {
    const update = () => {
      const editor = document.querySelector<HTMLElement>('.editor')
      const workspace = document.querySelector<HTMLElement>('.workspace')
      if (!editor || !workspace) {
        setDockRect(current => current === null ? current : null)
        return
      }
      const editorRect = editor.getBoundingClientRect()
      const workspaceRect = workspace.getBoundingClientRect()
      const next: DockRect = {
        left: editorRect.left,
        width: Math.max(0, workspaceRect.right - editorRect.left),
        bottom: Math.max(0, innerHeight - workspaceRect.bottom),
        tableVisible: Boolean(editor.querySelector('.parameterTablePane')),
      }
      setDockRect(current => sameDockRect(current, next) ? current : next)
    }
    update()
    const workspace = document.querySelector<HTMLElement>('.workspace')
    const observer = typeof ResizeObserver !== 'undefined' && workspace ? new ResizeObserver(update) : null
    observer?.observe(workspace!)
    addEventListener('resize', update)
    return () => { observer?.disconnect(); removeEventListener('resize', update) }
  }, [documentEpoch])

  const navigation = useMemo(() => buildRulesNavigation(rawRules), [rawRules])
  const generalRow = useMemo(() => rows.find(row => row.id.toLowerCase() === 'general') ?? null, [rows])
  const selectedRow = useMemo(() => rows.find(row => row.id.toLowerCase() === selectedId?.toLowerCase()) ?? null, [rows, selectedId])
  const branches = useMemo(() => parseDirectReferencesFor(rawRules, selectedRow, rows), [rawRules, rows, selectedRow])
  const hasReferenceChain = branches.length > 0

  useEffect(() => {
    document.body.classList.toggle('has-reference-chain', hasReferenceChain && Boolean(dockRect?.tableVisible))
    return () => document.body.classList.remove('has-reference-chain')
  }, [dockRect?.tableVisible, hasReferenceChain])

  const countryById = useMemo(() => new Map(rows.filter(row => normalizedType(row.category) === '国家').map(row => [row.id.toLowerCase(), row])), [rows])
  const selectedExclusiveCountry = useMemo(() => {
    if (!selectedRow || !COUNTRY_OWNABLE_TYPES.has(normalizedType(selectedRow.category))) return undefined
    const id = navigation.exclusiveCountryOf(selectedRow.id)
    return id ? countryById.get(id.toLowerCase()) : undefined
  }, [countryById, navigation, selectedRow])
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = rows.filter(row => row.id.toLowerCase() !== 'general' && !isLegacyGlobalSubsection(row.id))
    return q ? base.filter(row => `${row.label} ${row.id} ${row.type} ${row.category}`.toLowerCase().includes(q)) : base
  }, [query, rows])

  const sideGroups = useMemo<SideGroup[]>(() => SIDE_ORDER.map(meta => ({
    ...meta,
    types: UNIT_TYPE_ORDER.map(name => ({
      name,
      units: filteredRows.filter(row => !WEAPON_TYPES.has(normalizedType(row.category)) && normalizedType(row.category) === name && navigation.sideOf(row.id) === meta.side),
    })).filter(group => group.units.length),
  })).filter(group => group.types.length), [filteredRows, navigation])

  const weaponGroups = useMemo<TypeGroup[]>(() => WEAPON_TYPE_ORDER.map(name => ({ name, units: filteredRows.filter(row => normalizedType(row.category) === name) })).filter(group => group.units.length), [filteredRows])

  const searching = Boolean(query.trim())
  const isOpen = (key: string) => searching || expanded[key] === true
  const toggle = (key: string, open: boolean) => setExpanded(value => ({ ...value, [key]: !open }))
  const exclusiveCountryOf = (unit: UnitTreeRow) => {
    const type = normalizedType(unit.category)
    if (!COUNTRY_OWNABLE_TYPES.has(type)) return undefined
    const id = navigation.exclusiveCountryOf(unit.id)
    return id ? countryById.get(id.toLowerCase()) : undefined
  }
  const expandFor = (row: UnitTreeRow) => {
    const type = normalizedType(row.category)
    if (WEAPON_TYPES.has(type)) {
      setExpanded(value => ({ ...value, weapons: true, [`weapon:${type}`]: true }))
      return
    }
    const side = navigation.sideOf(row.id)
    setExpanded(value => ({ ...value, [`side:${side}`]: true, [`side:${side}:${type}`]: true }))
  }
  const selectReference = (row: UnitTreeRow) => { expandFor(row); onSelect(row) }

  useEffect(() => {
    if (!selectedId || selectedId.toLowerCase() === 'general') return
    const row = rows.find(item => item.id.toLowerCase() === selectedId.toLowerCase())
    if (row) expandFor(row)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`.unitTreeLeaf[data-unit-id="${selectedId.toLowerCase()}"]`)?.scrollIntoView({ block: 'nearest' }))
  }, [selectedId])

  if (!rows.length) return <div className="unitTreeEmpty">还没有可浏览的对象。</div>

  return <div className="unitHierarchy">
    {headerHost && selectedExclusiveCountry && createPortal(<CountryBadge id={selectedExclusiveCountry.id} className="entityHeaderCountryBadge"/>, headerHost)}
    {generalRow && <div className="unitGlobalBlock"><button className={`unitGlobalRule ${selectedId?.toLowerCase() === 'general' ? 'selected' : ''}`} onClick={() => onSelect(generalRow)}><span className="unitGlobalIcon"><SlidersHorizontal size={15}/></span><span className="unitGlobalText"><b>{generalRow.label || '全局规则'}</b><small>General</small></span></button></div>}
    <div className="unitTreeScroller">
      {sideGroups.map(group => {
        const sideKey = `side:${group.side}`
        const sideOpen = isOpen(sideKey)
        return <section className="unitSideGroup" key={group.side}>
          <button className={`unitTreeLevel sideLevel side-${group.side}`} onClick={() => toggle(sideKey, sideOpen)}>{sideOpen ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}<strong>{group.label}</strong><em>{group.types.reduce((count, item) => count + item.units.length, 0)}</em></button>
          {sideOpen && <div className="unitSideChildren">{group.types.map(type => {
            const typeKey = `${sideKey}:${type.name}`
            const open = isOpen(typeKey)
            return <section className="unitTypeGroup" key={type.name}>
              <button className="unitTreeLevel legacyType" onClick={() => toggle(typeKey, open)}>{open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<FallbackTypeIcon category={type.name} size={14}/><strong>{type.name}</strong><em>{type.units.length}</em></button>
              {open && <div className="unitLeaves legacyLeaves">{type.units.map(unit => <UnitLeaf key={unit.id} unit={unit} exclusiveCountry={exclusiveCountryOf(unit)} selectedId={selectedId} onSelect={onSelect}/>)}</div>}
            </section>
          })}</div>}
        </section>
      })}
      {weaponGroups.length > 0 && (() => {
        const key = 'weapons'
        const open = isOpen(key)
        return <section className="unitSideGroup weaponRoot">
          <button className="unitTreeLevel sideLevel weaponLevel" onClick={() => toggle(key, open)}>{open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}<Crosshair size={15}/><strong>武器类</strong><em>{weaponGroups.reduce((count, item) => count + item.units.length, 0)}</em></button>
          {open && <div className="unitSideChildren">{weaponGroups.map(type => {
            const typeKey = `weapon:${type.name}`
            const typeOpen = isOpen(typeKey)
            return <section className="unitTypeGroup" key={type.name}>
              <button className="unitTreeLevel legacyType" onClick={() => toggle(typeKey, typeOpen)}>{typeOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<FallbackTypeIcon category={type.name} size={14}/><strong>{type.name}</strong><em>{type.units.length}</em></button>
              {typeOpen && <div className="unitLeaves legacyLeaves">{type.units.map(unit => <UnitLeaf key={unit.id} unit={unit} selectedId={selectedId} onSelect={onSelect}/>)}</div>}
            </section>
          })}</div>}
        </section>
      })()}
    </div>

    {hasReferenceChain && selectedRow && dockRect?.tableVisible && <div className="referenceChainDock referenceBranchDock" style={{ left: dockRect.left, width: dockRect.width, bottom: dockRect.bottom }}>
      <span className="referenceChainLabel">引用链</span>
      <div className="referenceBranchRoot"><div className="referenceChainCurrent"><UnitIcon unit={selectedRow} compact/><span><b>{selectedRow.label}</b><small>{selectedRow.id}</small></span></div><div className="referenceBranchStem"/></div>
      <div className={`referenceBranchList ${branches.length > 1 ? 'branched' : ''}`}>{branches.map(edge => <div className="referenceBranch" key={`${edge.key}:${edge.row.id}`}><span className="referenceBranchLine"/><ReferenceNode edge={edge} onSelect={selectReference}/></div>)}</div>
    </div>}
  </div>
}