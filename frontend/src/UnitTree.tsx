import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { SemanticIcon, SimpleIcon, type SemanticIconKind } from 'terry-react-ui-library'
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
type RelationGroup = { row: UnitTreeRow; keys: string[] }
type RelationshipModel = { outgoing: RelationGroup[]; incoming: RelationGroup[] }

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
const WEAPON_REFERENCE_KEYS = new Set([
  'primary', 'secondary', 'eliteprimary', 'elitesecondary', 'occupyweapon',
  'eliteoccupyweapon', 'deathweapon', 'weapon',
])

function normalizedType(category: string) {
  if (category === '战车') return '载具'
  if (/弹体|抛射/i.test(category)) return '弹体'
  return category
}

function jumpReferenceCategory(key: string): string | null {
  const normalized = key.trim().toLowerCase()
  if (WEAPON_REFERENCE_KEYS.has(normalized)) return '武器'
  if (normalized.includes('warhead')) return '弹头'
  if (normalized.includes('projectile')) return '弹体'
  if (normalized === 'deploysinto') return '建筑'
  if (normalized === 'undeploysinto') return '载具'
  if (normalized === 'enslaves') return '步兵'
  if (normalized === 'spawns') return '飞机'
  return null
}

function semanticKindForCategory(category: string): SemanticIconKind {
  const type = normalizedType(category)
  if (type === '步兵') return 'infantry'
  if (type === '载具') return 'vehicle'
  if (type === '飞机') return 'aircraft'
  if (type === '建筑') return 'building'
  if (type === '超级武器') return 'superweapon'
  if (type === '国家') return 'flag'
  if (type === '武器') return 'weapon'
  if (type === '弹头') return 'warhead'
  if (type === '弹体') return 'projectile'
  return 'generic'
}

export function FallbackTypeIcon({ category, size = 15 }: { category: string; size?: number }) {
  return <SemanticIcon kind={semanticKindForCategory(category)} size={size} surface={false}/>
}

export function UnitIcon({ unit, compact = false }: { unit: UnitTreeRow; compact?: boolean }) {
  const size = compact ? 24 : 28
  if (normalizedType(unit.category) === '国家') {
    const flag = countryIconStyle(unit.id, size)
    if (flag) return <span className={`unitTreeIcon ${compact ? 'compact' : ''}`} style={flag}/>
    return <SimpleIcon text={unit.label || unit.id} kind="flag" className={`unitTreeCountryTextIcon ${compact ? 'compact' : ''}`}/>
  }
  if (hasLegacyIcon(unit.id)) return <span className={`unitTreeIcon ${compact ? 'compact' : ''}`} style={{ ...legacyIconStyle(unit.id, size) }}/>
  return <span className={`unitTreeIcon fallback semantic ${compact ? 'compact' : ''}`}><FallbackTypeIcon category={unit.category} size={compact ? 13 : 15}/></span>
}

function CountryBadge({ id, className = '' }: { id: string; className?: string }) {
  const style = countryIconStyle(id, 16)
  return style ? <span className={`unitCountryBadge ${className}`} style={style} aria-label={`国家 ${id}`}/> : null
}

function UnitCompositeIcon({ unit, exclusiveCountry, className = '' }: { unit: UnitTreeRow; exclusiveCountry?: UnitTreeRow; className?: string }) {
  return <span className={`unitTreeIconWrap ${className}`}><UnitIcon unit={unit}/>{exclusiveCountry && <CountryBadge id={exclusiveCountry.id}/>}</span>
}

function UnitLeaf({ unit, exclusiveCountry, selectedId, onSelect }: { unit: UnitTreeRow; exclusiveCountry?: UnitTreeRow; selectedId?: string | null; onSelect: (row: UnitTreeRow) => void }) {
  return <button data-unit-id={unit.id.toLowerCase()} className={`unitTreeLeaf ${selectedId?.toLowerCase() === unit.id.toLowerCase() ? 'selected' : ''}`} onClick={() => onSelect(unit)} title={`${unit.label} · ${unit.id}${exclusiveCountry ? ` · 仅 ${exclusiveCountry.label}` : ''}`}>
    <UnitCompositeIcon unit={unit} exclusiveCountry={exclusiveCountry}/>
    <span className="unitTreeLeafText"><b>{unit.label}</b><small>{unit.id}</small></span><ChevronRight size={13}/>
  </button>
}

function stripInlineComment(raw: string) {
  let quote = ''
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    if ((char === '"' || char === "'") && (!quote || quote === char)) quote = quote === char ? '' : char
    if (char === ';' && !quote) return raw.slice(0, index).trim()
  }
  return raw.trim()
}

function pushRelation(target: Map<string, { row: UnitTreeRow; keys: Set<string> }>, row: UnitTreeRow, key: string) {
  const folded = row.id.toLowerCase()
  const existing = target.get(folded) ?? { row, keys: new Set<string>() }
  existing.keys.add(key)
  target.set(folded, existing)
}

function relationLabel(key: string) {
  const labels: Record<string, string> = {
    primary: '主武器', secondary: '副武器', eliteprimary: '精英主武器', elitesecondary: '精英副武器',
    occupyweapon: '驻军武器', eliteoccupyweapon: '精英驻军武器', deathweapon: '死亡武器',
    weapon: '武器', warhead: '弹头', projectile: '弹体',
    deploysinto: '部署建筑', undeploysinto: '反部署', spawns: '生成单位', enslaves: '奴隶单位',
  }
  return labels[key.toLowerCase()] ?? key
}

/**
 * Relationship panel intentionally follows the same narrow semantic references that
 * receive the jump arrow in the parameter table. Generic INI references such as Owner,
 * ForbiddenHouses, Image, Prerequisite and General registry keys are not relationships
 * here. Multi-value references are also ignored because the table jump action is a
 * single-target action.
 */
function buildRelationships(raw: string, selected: UnitTreeRow | null, rows: UnitTreeRow[]): RelationshipModel {
  if (!raw || !selected) return { outgoing: [], incoming: [] }
  const selectedId = selected.id.toLowerCase()
  const rowById = new Map(rows.map(row => [row.id.toLowerCase(), row]))
  const outgoing = new Map<string, { row: UnitTreeRow; keys: Set<string> }>()
  const incoming = new Map<string, { row: UnitTreeRow; keys: Set<string> }>()
  let sourceId = ''

  for (const rawLine of raw.split(/\r?\n/)) {
    const sectionMatch = rawLine.match(/^\s*\[([^\]]+)]/)
    if (sectionMatch) {
      sourceId = sectionMatch[1].trim().toLowerCase()
      continue
    }
    if (!sourceId || /^\s*[;#]/.test(rawLine)) continue
    const match = rawLine.match(/^\s*([^=;#]+?)\s*=\s*(.*)$/)
    if (!match) continue

    const key = match[1].trim()
    const expectedCategory = jumpReferenceCategory(key)
    if (!expectedCategory) continue

    const value = stripInlineComment(match[2])
    if (!value || value.includes(',')) continue

    const source = rowById.get(sourceId)
    const target = rowById.get(value.toLowerCase())
    if (!source || !target || target.id.toLowerCase() === sourceId) continue
    if (normalizedType(target.category) !== expectedCategory) continue

    if (sourceId === selectedId) pushRelation(outgoing, target, key)
    if (target.id.toLowerCase() === selectedId) pushRelation(incoming, source, key)
  }

  const normalize = (source: Map<string, { row: UnitTreeRow; keys: Set<string> }>) => [...source.values()]
    .map(item => ({ row: item.row, keys: [...item.keys].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })) }))
    .sort((a, b) => a.row.category.localeCompare(b.row.category, 'zh-CN') || a.row.label.localeCompare(b.row.label, 'zh-CN'))

  return { outgoing: normalize(outgoing), incoming: normalize(incoming) }
}

function RelationshipRow({ relation, onSelect }: { relation: RelationGroup; onSelect: (row: UnitTreeRow) => void }) {
  return <button className="relationshipRow" onClick={() => onSelect(relation.row)} title={`跳转到 ${relation.row.label} [${relation.row.id}]`}>
    <UnitIcon unit={relation.row} compact/>
    <span className="relationshipIdentity"><b>{relation.row.label}</b><small>{relation.row.id} · {normalizedType(relation.row.category)}</small></span>
    <span className="relationshipKeys">{relation.keys.slice(0, 4).map(key => <em key={key} title={key}>{relationLabel(key)}</em>)}{relation.keys.length > 4 && <em>+{relation.keys.length - 4}</em>}</span>
    <ChevronRight size={13}/>
  </button>
}

function RelationshipPanel({ selected, model, open, onToggle, onSelect }: { selected: UnitTreeRow; model: RelationshipModel; open: boolean; onToggle: () => void; onSelect: (row: UnitTreeRow) => void }) {
  const total = model.outgoing.length + model.incoming.length
  return <section className={`relationshipPanel ${open ? 'open' : ''}`}>
    <button className="relationshipPanelToggle" onClick={onToggle} aria-expanded={open}>
      {open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}<strong>引用与被引用关系</strong><em>{total}</em>
    </button>
    {open && <div className="relationshipPanelBody">
      <div className="relationshipSection">
        <div className="relationshipSectionTitle"><span>引用</span><em>{model.outgoing.length}</em></div>
        {model.outgoing.length ? model.outgoing.map(relation => <RelationshipRow key={`out:${relation.row.id}`} relation={relation} onSelect={onSelect}/>) : <div className="relationshipEmpty">[{selected.id}] 没有可跳转的对象引用。</div>}
      </div>
      <div className="relationshipSection">
        <div className="relationshipSectionTitle"><span>被引用</span><em>{model.incoming.length}</em></div>
        {model.incoming.length ? model.incoming.map(relation => <RelationshipRow key={`in:${relation.row.id}`} relation={relation} onSelect={onSelect}/>) : <div className="relationshipEmpty">没有其他对象通过可跳转参数引用 [{selected.id}]。</div>}
      </div>
    </div>}
  </section>
}

export function UnitTree({ rows, selectedId, query, documentEpoch, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [rawRules, setRawRules] = useState('')
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null)
  const [inspectorHost, setInspectorHost] = useState<HTMLElement | null>(null)
  const [navigationHost, setNavigationHost] = useState<HTMLElement | null>(null)
  const [relationshipsOpen, setRelationshipsOpen] = useState(false)
  const navigationHistory = useRef<UnitTreeRow[]>([])
  const navigationIndex = useRef(-1)
  const navigationTarget = useRef<number | null>(null)
  const [navigationRevision, setNavigationRevision] = useState(0)

  useEffect(() => {
    setExpanded({})
    navigationHistory.current = []
    navigationIndex.current = -1
    navigationTarget.current = null
    setNavigationRevision(value => value + 1)
  }, [documentEpoch])
  useEffect(() => {
    let cancelled = false
    if (!rows.length) { setRawRules(''); return () => { cancelled = true } }
    void workspaceApi.rawText().then(raw => { if (!cancelled) setRawRules(raw) }).catch(() => { if (!cancelled) setRawRules('') })
    return () => { cancelled = true }
  }, [documentEpoch, rows.length, selectedId])

  useEffect(() => {
    setHeaderHost(document.querySelector<HTMLElement>('.entityHeaderHost'))
    setInspectorHost(document.querySelector<HTMLElement>('.inspector .helpContent'))
    setNavigationHost(document.querySelector<HTMLElement>('.entityNavigation'))
  }, [documentEpoch, selectedId])

  const navigation = useMemo(() => buildRulesNavigation(rawRules), [rawRules])
  const generalRow = useMemo(() => rows.find(row => row.id.toLowerCase() === 'general') ?? null, [rows])
  const selectedRow = useMemo(() => rows.find(row => row.id.toLowerCase() === selectedId?.toLowerCase()) ?? null, [rows, selectedId])
  const countryById = useMemo(() => new Map(rows.filter(row => normalizedType(row.category) === '国家').map(row => [row.id.toLowerCase(), row])), [rows])
  const selectedExclusiveCountry = useMemo(() => {
    if (!selectedRow || !COUNTRY_OWNABLE_TYPES.has(normalizedType(selectedRow.category))) return undefined
    const id = navigation.exclusiveCountryOf(selectedRow.id)
    return id ? countryById.get(id.toLowerCase()) : undefined
  }, [countryById, navigation, selectedRow])
  const relationships = useMemo(() => buildRelationships(rawRules, selectedRow, rows), [rawRules, rows, selectedRow])

  useEffect(() => {
    if (!selectedRow) return
    const targetIndex = navigationTarget.current
    if (targetIndex != null && navigationHistory.current[targetIndex]?.id.toLowerCase() === selectedRow.id.toLowerCase()) {
      navigationIndex.current = targetIndex
      navigationTarget.current = null
      setNavigationRevision(value => value + 1)
      return
    }
    if (navigationHistory.current[navigationIndex.current]?.id.toLowerCase() === selectedRow.id.toLowerCase()) return
    const base = navigationHistory.current.slice(0, navigationIndex.current + 1)
    if (base[base.length - 1]?.id.toLowerCase() !== selectedRow.id.toLowerCase()) base.push(selectedRow)
    navigationHistory.current = base
    navigationIndex.current = base.length - 1
    navigationTarget.current = null
    setNavigationRevision(value => value + 1)
  }, [selectedRow?.id])
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
  const selectRelated = (row: UnitTreeRow) => { expandFor(row); onSelect(row) }
  const navigateObjectHistory = (delta: -1 | 1) => {
    const targetIndex = navigationIndex.current + delta
    const row = navigationHistory.current[targetIndex]
    if (!row) return
    navigationTarget.current = targetIndex
    expandFor(row)
    onSelect(row)
  }
  const previousObject = navigationRevision >= 0 ? navigationHistory.current[navigationIndex.current - 1] ?? null : null
  const nextObject = navigationHistory.current[navigationIndex.current + 1] ?? null

  useEffect(() => {
    if (!selectedId || selectedId.toLowerCase() === 'general') return
    const row = rows.find(item => item.id.toLowerCase() === selectedId.toLowerCase())
    if (row) expandFor(row)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`.unitTreeLeaf[data-unit-id="${selectedId.toLowerCase()}"]`)?.scrollIntoView({ block: 'nearest' }))
  }, [selectedId])

  if (!rows.length) return <div className="unitTreeEmpty">还没有可浏览的对象。</div>

  return <div className="unitHierarchy">
    {headerHost && selectedRow && createPortal(<span className="headerUnitComposite"><UnitCompositeIcon unit={selectedRow} exclusiveCountry={selectedExclusiveCountry}/></span>, headerHost)}
    {inspectorHost && selectedRow && createPortal(<RelationshipPanel selected={selectedRow} model={relationships} open={relationshipsOpen} onToggle={() => setRelationshipsOpen(value => !value)} onSelect={selectRelated}/>, inspectorHost)}
    {navigationHost && createPortal(<><button className="objectNavButton" disabled={!previousObject} title={previousObject ? `后退到 ${previousObject.label} [${previousObject.id}]` : '没有上一项'} onClick={() => navigateObjectHistory(-1)}><ArrowLeft size={15}/><span>{previousObject?.label || '上一项'}</span></button><button className="objectNavButton" disabled={!nextObject} title={nextObject ? `前进到 ${nextObject.label} [${nextObject.id}]` : '没有下一项'} onClick={() => navigateObjectHistory(1)}><span>{nextObject?.label || '下一项'}</span><ArrowRight size={15}/></button></>, navigationHost)}
    {generalRow && <div className="unitGlobalBlock"><button className={`unitGlobalRule ${selectedId?.toLowerCase() === 'general' ? 'selected' : ''}`} onClick={() => onSelect(generalRow)}><span className="unitGlobalIcon"><SlidersHorizontal size={15}/></span><span className="unitGlobalText"><b>{generalRow.label || '全局规则'}</b><small>General</small></span></button></div>}
    <div className="unitTreeScroller">
      {sideGroups.map(group => {
        const sideKey = `side:${group.side}`
        const sideOpen = isOpen(sideKey)
        return <section className="unitSideGroup" key={group.side}>
          <button className={`unitTreeLevel sideLevel side-${group.side}`} onClick={() => toggle(sideKey, sideOpen)}>{sideOpen ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}<SemanticIcon kind="flag" size={14} surface={false}/><strong>{group.label}</strong><em>{group.types.reduce((count, item) => count + item.units.length, 0)}</em></button>
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
          <button className="unitTreeLevel sideLevel weaponLevel" onClick={() => toggle(key, open)}>{open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}<SemanticIcon kind="weapon" size={15} surface={false}/><strong>武器类</strong><em>{weaponGroups.reduce((count, item) => count + item.units.length, 0)}</em></button>
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
  </div>
}
