import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  BoolSwitch,
  Button,
  Dialog,
  EntityHeader,
  MultiSelect,
  Select,
  Slider,
  TextField,
} from 'terry-react-ui-library'
import {
  ArrowLeft,
  ArrowRight,
  Bomb,
  Box,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Crosshair,
  FilePlus2,
  FolderOpen,
  Gamepad2,
  ListPlus,
  Plus,
  Rocket,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Volume2,
  WandSparkles,
} from 'lucide-react'
import { workspaceApi, type CatalogOption, type SectionData, type SectionOption, type WorkspaceSnapshot } from './backend'
import { countryIconStyle, hasLegacyIcon, legacyIconStyle } from './legacyIcons'
import { ParameterPicker } from './ParameterPicker'
import { sliderRangeFor } from './sliderRanges'
import { UnitTree } from './UnitTree'
import './styles.css'
import './polish.css'

type Side = 'allied' | 'soviet' | 'yuri' | 'neutral'
type SectionRow = { id: string; label: string; type: string; category: string; side: Side }
type NavigationState = { items: SectionRow[]; index: number }
type EditorViewMode = 'table' | 'raw'
type ReferenceKind = 'generic' | 'weapon' | 'audio' | 'warhead' | 'projectile' | 'debris'
type ObservedValueIndex = { byKey: Record<string, string[]>; audio: string[] }
type LocalEditorSettings = {
  gamePath: string
  appearance: 'dark' | 'light' | 'system'
}

const EMPTY_SECTION: SectionData = { section: '', description: '', options: [], raw: '', references: [] }
const EMPTY_OBSERVED_VALUES: ObservedValueIndex = { byKey: {}, audio: [] }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const WEAPON_REFERENCE_KEYS = new Set([
  'primary', 'secondary', 'eliteprimary', 'elitesecondary', 'occupyweapon',
  'eliteoccupyweapon', 'opentransportweapon', 'deathweapon',
])

function storedPaneWidth(key: string, fallback: number) {
  const value = Number.parseInt(localStorage.getItem(key) || '', 10)
  return Number.isFinite(value) ? value : fallback
}

function storedAppearance(): LocalEditorSettings['appearance'] {
  const value = localStorage.getItem('rulesmd.appearance')
  return value === 'light' || value === 'system' ? value : 'dark'
}

function sideForId(id: string): Side {
  const key = id.toUpperCase()
  if (key.startsWith('YA') || key.startsWith('YURI') || ['YTNK', 'DISK', 'BRUTE', 'VIRUS', 'INIT'].includes(key)) return 'yuri'
  if (key.startsWith('NA') || ['HTNK', 'E2', 'TESLA', 'SHK', 'APOC', 'V3', 'BORIS', 'FLAKT', 'DRED', 'SUB'].includes(key)) return 'soviet'
  if (key.startsWith('GA') || ['GHOST', 'SNIPE', 'E1', 'MTNK', 'FV', 'TANY', 'GGI', 'SPY', 'CLEG', 'SREF'].includes(key)) return 'allied'
  return 'neutral'
}

function toneForSide(side: Side): 'blue' | 'red' | 'purple' | 'neutral' {
  if (side === 'allied') return 'blue'
  if (side === 'soviet') return 'red'
  if (side === 'yuri') return 'purple'
  return 'neutral'
}

function displayGroup(category: string) {
  return category.replace(/^Ares\s*·\s*/i, '').trim() || '其他'
}

function sectionKind(category: string): string | undefined {
  if (/步兵/i.test(category)) return 'InfantryType'
  if (/载具|战车/i.test(category)) return 'VehicleType'
  if (/飞机/i.test(category)) return 'AircraftType'
  if (/建筑/i.test(category)) return 'BuildingType'
  if (/超级武器|超武/i.test(category)) return 'SuperWeapon'
  if (/武器/i.test(category)) return 'Weapon'
  if (/弹头/i.test(category)) return 'Warhead'
  if (/弹体|抛射/i.test(category)) return 'Projectile'
  return undefined
}

function rowsFromSnapshot(snapshot: WorkspaceSnapshot | null): SectionRow[] {
  if (!snapshot) return []
  return snapshot.categories.flatMap(category => category.items.map(item => ({
    id: item.section,
    label: item.label || item.section,
    type: category.name,
    category: category.name,
    side: item.side ?? sideForId(item.section),
  })))
}

function firstUsefulRow(snapshot: WorkspaceSnapshot): SectionRow | null {
  const preferred = ['步兵', '载具', '战车', '飞机', '建筑', '武器', '弹头', '弹体']
  for (const categoryName of preferred) {
    const category = snapshot.categories.find(item => item.name === categoryName && item.items.length)
    const first = category?.items[0]
    if (category && first) return {
      id: first.section,
      label: first.label || first.section,
      type: category.name,
      category: category.name,
      side: first.side ?? sideForId(first.section),
    }
  }
  const category = snapshot.categories.find(item => item.items.length)
  const first = category?.items[0]
  return category && first ? {
    id: first.section,
    label: first.label || first.section,
    type: category.name,
    category: category.name,
    side: first.side ?? sideForId(first.section),
  } : null
}

function isAudioKey(key: string) {
  const normalized = key.trim().toLowerCase()
  return normalized === 'report' || /(?:sound|voice|audio)/i.test(normalized)
}

function isAudioOption(option: SectionOption) {
  return displayGroup(option.category) === '声音' || isAudioKey(option.key)
}

function referenceKindForOption(option: SectionOption): ReferenceKind {
  const type = option.value_type.toLowerCase()
  const key = option.key.toLowerCase()
  if (isAudioOption(option)) return 'audio'
  if (type === 'weapon' || WEAPON_REFERENCE_KEYS.has(key)) return 'weapon'
  if (type === 'warhead' || key.includes('warhead')) return 'warhead'
  if (type === 'projectile' || key.includes('projectile')) return 'projectile'
  if (key === 'debristypes') return 'debris'
  return 'generic'
}

function referenceCategoryForOption(option: SectionOption): string | undefined {
  const type = option.value_type.toLowerCase()
  const key = option.key.toLowerCase()
  if (type === 'weapon' || WEAPON_REFERENCE_KEYS.has(key)) return '武器'
  if (type === 'warhead' || key.includes('warhead')) return '弹头'
  if (type === 'projectile' || key.includes('projectile')) return '弹体'
  if (key === 'deploysinto') return '建筑'
  if (key === 'undeploysinto') return '载具'
  if (key === 'enslaves') return '步兵'
  if (key === 'spawns') return '飞机'
  return undefined
}

function valueWithoutInlineComment(raw: string) {
  let quote = ''
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    if ((char === '"' || char === "'") && (!quote || quote === char)) quote = quote === char ? '' : char
    if (char === ';' && !quote) return raw.slice(0, index).trim()
  }
  return raw.trim()
}

function parseObservedValueIndex(raw: string): ObservedValueIndex {
  const byKey = new Map<string, Map<string, string>>()
  const audio = new Map<string, string>()
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([^;#][^=]*?)\s*=\s*(.*)$/)
    if (!match) continue
    const key = match[1].trim().toLowerCase()
    const value = valueWithoutInlineComment(match[2])
    if (!key || !value) continue
    const bucket = byKey.get(key) ?? new Map<string, string>()
    for (const token of value.split(',').map(item => item.trim()).filter(Boolean)) {
      bucket.set(token.toLowerCase(), token)
      if (isAudioKey(key)) audio.set(token.toLowerCase(), token)
    }
    byKey.set(key, bucket)
  }
  return {
    byKey: Object.fromEntries([...byKey.entries()].map(([key, values]) => [key, [...values.values()]])),
    audio: [...audio.values()].sort((a, b) => {
      if (a.toLowerCase() === 'none') return -1
      if (b.toLowerCase() === 'none') return 1
      return a.localeCompare(b, undefined, { sensitivity: 'base' })
    }),
  }
}

function withCurrentValues(values: string[], current: string) {
  const result = new Map(values.map(value => [value.toLowerCase(), value]))
  for (const token of current.split(',').map(value => value.trim()).filter(Boolean)) result.set(token.toLowerCase(), token)
  return [...result.values()]
}

function mergeObservedValue(index: ObservedValueIndex, option: SectionOption, value: string): ObservedValueIndex {
  const key = option.key.toLowerCase()
  const tokens = value.split(',').map(item => item.trim()).filter(Boolean)
  if (!tokens.length) return index
  const byKey = { ...index.byKey }
  byKey[key] = withCurrentValues(byKey[key] ?? [], value)
  const audio = isAudioOption(option) ? withCurrentValues(index.audio, value) : index.audio
  return { byKey, audio }
}

function IconButton({ title, children, primary = false, onClick, disabled = false, dirty = false }: {
  title: string; children: React.ReactNode; primary?: boolean; onClick?: () => void; disabled?: boolean; dirty?: boolean
}) {
  return <button className={`iconButton ${primary ? 'primary' : ''}`} title={title} onClick={onClick} disabled={disabled}>{children}<span className="iconButtonLabel">{title}{dirty && <i className="saveDirtyDot" aria-label="有未保存修改"/>}</span></button>
}

function LegacyUnitIcon({ id, size = 36, className = '' }: { id: string; size?: number; className?: string }) {
  if (hasLegacyIcon(id)) return <div className={`legacyUnitIcon ${className}`} style={{ width: size, height: Math.round(size * .8), ...legacyIconStyle(id, size) }} />
  return <div className={`legacyUnitIcon fallback ${className}`} style={{ width: size, height: size }}><Box size={Math.max(14, Math.round(size * .48))}/></div>
}

function optionVisualIcon(value: string) {
  const country = countryIconStyle(value, 32)
  if (country) return <span className="rulesCountryOptionIcon" style={country}/>
  if (hasLegacyIcon(value)) return <span className="rulesUnitOptionIcon" style={legacyIconStyle(value, 32)}/>
  return undefined
}

function referenceOptionIcon(value: string, kind: ReferenceKind = 'generic') {
  const visual = optionVisualIcon(value)
  if (visual) return visual
  const Icon = kind === 'weapon' ? Crosshair : kind === 'audio' ? Volume2 : kind === 'warhead' ? Bomb : kind === 'projectile' ? Rocket : kind === 'debris' ? Sparkles : Box
  return <span className={`legacyUnitIcon fallback referenceOptionFallback referenceTypeIcon referenceTypeIcon-${kind}`} style={{ width: 28, height: 24 }}><Icon size={15}/></span>
}

function FieldControl({
  option,
  onChange,
  referenceRows = [],
  observedKeyValues = [],
  audioValues = [],
}: {
  option: SectionOption
  onChange: (value: string) => void
  referenceRows?: SectionRow[]
  observedKeyValues?: string[]
  audioValues?: string[]
}) {
  const raw = option.raw_value ?? undefined
  const referenceKind = referenceKindForOption(option)

  if (option.widget === 'boolean') return <BoolSwitch width={180} value={option.value} rawValue={raw} onChange={onChange} trueValue="yes" falseValue="no" />

  if (referenceKind === 'audio') {
    const values = withCurrentValues(audioValues, option.value)
    const options = values.map(value => ({ value, label: value, icon: referenceOptionIcon(value, 'audio') }))
    return <Select value={option.value} rawValue={raw} options={options} onChange={onChange} searchable searchPlaceholder="搜索音频名称"/>
  }

  if (referenceKind === 'debris') {
    const values = option.value.split(',').map(value => value.trim()).filter(Boolean)
    const rawValues = option.raw_value == null ? undefined : option.raw_value.split(',').map(value => value.trim()).filter(Boolean)
    const options = withCurrentValues(observedKeyValues, option.value).map(value => ({ value, label: value, icon: referenceOptionIcon(value, 'debris') }))
    return <MultiSelect values={values} rawValues={rawValues} options={options} onChange={next => onChange(next.join(','))} mode="menu" title={option.label || option.key}/>
  }

  if (option.widget === 'multi-select') {
    const values = option.value.split(',').map(value => value.trim()).filter(Boolean)
    const rawValues = option.raw_value == null ? undefined : option.raw_value.split(',').map(value => value.trim()).filter(Boolean)
    return <MultiSelect values={values} rawValues={rawValues} options={option.values.map(value => ({ value: value.value, label: value.label || value.value, icon: optionVisualIcon(value.value) }))} onChange={next => onChange(next.join(','))} mode="menu" title={option.label || option.key}/>
  }

  if (option.widget === 'select') {
    const semanticIcon = referenceKind !== 'generic'
    const options = option.values.map(value => ({
      value: value.value,
      label: value.label ? `${value.label} · ${value.value}` : value.value,
      icon: semanticIcon ? referenceOptionIcon(value.value, referenceKind) : optionVisualIcon(value.value),
    }))
    if (option.value && !options.some(value => value.value === option.value)) options.unshift({ value: option.value, label: option.value, icon: semanticIcon ? referenceOptionIcon(option.value, referenceKind) : optionVisualIcon(option.value) })
    return <Select value={option.value} rawValue={raw} options={options} onChange={onChange} searchable={options.length > 10}/>
  }

  if (referenceRows.length) {
    const options = referenceRows.map(row => ({ value: row.id, label: row.label || row.id, group: row.id, icon: referenceOptionIcon(row.id, referenceKind) }))
    if (option.value && !options.some(item => item.value.toLowerCase() === option.value.toLowerCase())) options.unshift({ value: option.value, label: option.value, group: '', icon: referenceOptionIcon(option.value, referenceKind) })
    return <Select value={option.value} rawValue={raw} options={options} onChange={onChange} searchable searchPlaceholder="搜索名称或 Section"/>
  }

  if (option.widget === 'slider') {
    const range = sliderRangeFor(option.key, option.value, option.value_type)
    const numeric = Number.parseFloat(option.value.replace('%', ''))
    const rawNumeric = option.raw_value == null ? undefined : Number.parseFloat(option.raw_value.replace('%', ''))
    const value = Number.isFinite(numeric) ? numeric : range.min
    return <Slider value={value} rawValue={rawNumeric != null && Number.isFinite(rawNumeric) ? rawNumeric : undefined} min={range.min} max={range.max} step={range.step} allowOutOfRangeInput onChange={next => onChange(`${next}${range.suffix}`)}/>
  }

  return <TextField value={option.value} rawValue={raw} onChange={onChange} placeholder={option.label || option.key}/>
}

function App() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [selected, setSelected] = useState<SectionRow | null>(null)
  const [sectionData, setSectionData] = useState<SectionData>(EMPTY_SECTION)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [unitSearch, setUnitSearch] = useState('')
  const [fieldSearch, setFieldSearch] = useState('')
  const [activeGroup, setActiveGroup] = useState('全部')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState('新建或打开 rulesmd.ini 开始编辑')
  const [busy, setBusy] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [catalog, setCatalog] = useState<CatalogOption[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showClosePrompt, setShowClosePrompt] = useState(false)
  const [documentEpoch, setDocumentEpoch] = useState(0)
  const [navigation, setNavigation] = useState<NavigationState>({ items: [], index: -1 })
  const [viewMode, setViewMode] = useState<EditorViewMode>('table')
  const [leftPane, setLeftPane] = useState(() => storedPaneWidth('rulesmd.leftPane', 230))
  const [rightPane, setRightPane] = useState(() => storedPaneWidth('rulesmd.rightPane', 390))
  const [localSettings, setLocalSettings] = useState<LocalEditorSettings>(() => ({
    gamePath: localStorage.getItem('rulesmd.gamePath') || '',
    appearance: storedAppearance(),
  }))
  const [observedValues, setObservedValues] = useState<ObservedValueIndex>(EMPTY_OBSERVED_VALUES)
  const sectionCache = useRef(new Map<string, SectionData>())
  const sectionRequest = useRef(0)
  const allowWindowClose = useRef(false)

  const rows = useMemo(() => rowsFromSnapshot(snapshot), [snapshot])
  const rowById = useMemo(() => new Map(rows.map(row => [row.id.toLowerCase(), row])), [rows])
  const groups = useMemo(() => {
    const categories = Array.from(new Set(sectionData.options.map(option => displayGroup(option.category))))
    const hasAres = sectionData.options.some(option => option.source.toLowerCase() === 'ares')
    return ['全部', ...(hasAres ? ['Ares'] : []), ...categories.filter(group => group !== 'Ares')]
  }, [sectionData])
  const visibleFields = useMemo(() => sectionData.options.filter(option => {
    const groupOk = activeGroup === '全部'
      || (activeGroup === 'Ares' ? option.source.toLowerCase() === 'ares' : displayGroup(option.category) === activeGroup)
    const searchOk = `${option.key} ${option.label} ${option.value} ${option.description}`.toLowerCase().includes(fieldSearch.toLowerCase())
    return groupOk && searchOk
  }), [sectionData, activeGroup, fieldSearch])
  const groupedFields = useMemo(() => {
    const result = new Map<string, SectionOption[]>()
    for (const option of visibleFields) {
      const group = displayGroup(option.category)
      if (!result.has(group)) result.set(group, [])
      result.get(group)!.push(option)
    }
    return [...result.entries()]
  }, [visibleFields])
  const selectedOption = sectionData.options.find(option => option.line_id === selectedOptionId) ?? sectionData.options[0]
  const previousSection = navigation.index > 0 ? navigation.items[navigation.index - 1] : null
  const nextSection = navigation.index >= 0 && navigation.index < navigation.items.length - 1 ? navigation.items[navigation.index + 1] : null
  const headerSectionReady = Boolean(selected && sectionData.section && sectionData.section.toLowerCase() === selected.id.toLowerCase())
  const effectiveAppearance: 'dark' | 'light' = localSettings.appearance === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : localSettings.appearance

  useEffect(() => {
    const appWindow = getCurrentWindow()
    let unlisten: (() => void) | undefined
    void appWindow.onCloseRequested(event => {
      if (allowWindowClose.current || !snapshot?.document.dirty) return
      event.preventDefault()
      setShowClosePrompt(true)
    }).then(fn => { unlisten = fn })
    return () => unlisten?.()
  }, [snapshot?.document.dirty])

  function referenceRows(option: SectionOption) {
    const category = referenceCategoryForOption(option)
    if (!category) return []
    const normalized = category.replace('战车', '载具')
    return rows.filter(row => row.category.replace('战车', '载具') === normalized)
  }

  function referenceTarget(option: SectionOption) {
    const category = referenceCategoryForOption(option)
    const value = option.value.trim()
    if (!category || !value || value.includes(',')) return null
    const target = rowById.get(value.toLowerCase()) ?? null
    if (!target) return null
    return target.category.replace('战车', '载具') === category.replace('战车', '载具') ? target : null
  }

  function updateLocalSetting<K extends keyof LocalEditorSettings>(key: K, value: LocalEditorSettings[K]) {
    setLocalSettings(current => ({ ...current, [key]: value }))
    localStorage.setItem(`rulesmd.${key}`, String(value))
  }

  async function refreshObservedValues() {
    try {
      const raw = await workspaceApi.rawText()
      setObservedValues(parseObservedValueIndex(raw))
    } catch {
      setObservedValues(EMPTY_OBSERVED_VALUES)
    }
  }

  async function chooseGameExecutable() {
    try {
      const path = await workspaceApi.pickGameExecutable()
      if (!path) return
      updateLocalSetting('gamePath', path)
      setStatus(`已选择游戏启动程序：${path}`)
    } catch (error) {
      setStatus(`选择游戏程序失败：${String(error)}`)
    }
  }

  async function launchGame() {
    if (!localSettings.gamePath.trim()) {
      setShowSettings(true)
      setStatus('请先在设置中选择游戏启动程序。')
      return
    }
    try {
      await workspaceApi.launchGame(localSettings.gamePath)
      setStatus('已启动游戏。')
    } catch (error) {
      setStatus(`启动游戏失败：${String(error)}`)
      setShowSettings(true)
    }
  }

  async function loadSection(row: SectionRow) {
    const requestId = ++sectionRequest.current
    setSelected(row)
    setActiveGroup('全部')
    const cached = sectionCache.current.get(row.id)
    if (cached) {
      setSectionData(cached)
      setSelectedOptionId(cached.options[0]?.line_id ?? null)
      setStatus(`已载入 [${row.id}] · ${cached.options.length} 个参数`)
      return
    }
    try {
      const data = await workspaceApi.section(row.id)
      if (requestId !== sectionRequest.current) return
      sectionCache.current.set(row.id, data)
      setSectionData(data)
      setSelectedOptionId(data.options[0]?.line_id ?? null)
      setStatus(`已载入 [${row.id}] · ${data.options.length} 个参数`)
    } catch (error) {
      if (requestId === sectionRequest.current) setStatus(`读取 Section 失败：${String(error)}`)
    }
  }

  async function manualSelect(row: SectionRow) {
    setNavigation({ items: [row], index: 0 })
    await loadSection(row)
  }

  async function navigateTo(row: SectionRow) {
    setNavigation(current => {
      if (current.index >= 0 && current.items[current.index]?.id === row.id) return current
      const base = current.items.slice(0, current.index + 1)
      return { items: [...base, row], index: base.length }
    })
    await loadSection(row)
  }

  async function navigateHistory(delta: -1 | 1) {
    const targetIndex = navigation.index + delta
    const row = navigation.items[targetIndex]
    if (!row) return
    setNavigation(current => ({ ...current, index: targetIndex }))
    setUnitSearch('')
    await loadSection(row)
    setStatus(`${delta < 0 ? '后退' : '前进'}到 [${row.id}]`)
  }

  function beginResize(side: 'left' | 'right', event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    const onMove = (move: PointerEvent) => {
      if (side === 'left') setLeftPane(clamp(move.clientX, 180, 420))
      else setRightPane(clamp(window.innerWidth - move.clientX, 300, 620))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.classList.remove('resizingPanes')
      setLeftPane(value => { localStorage.setItem('rulesmd.leftPane', String(value)); return value })
      setRightPane(value => { localStorage.setItem('rulesmd.rightPane', String(value)); return value })
    }
    document.body.classList.add('resizingPanes')
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  async function jumpToReference(row: SectionRow) {
    setUnitSearch('')
    await navigateTo(row)
    setStatus(`已跳转到 [${row.id}]`)
  }

  async function enterDocument(next: WorkspaceSnapshot, message: string) {
    sectionCache.current.clear()
    sectionRequest.current += 1
    setSnapshot(next)
    setUnitSearch('')
    setFieldSearch('')
    setDocumentEpoch(value => value + 1)
    await refreshObservedValues()
    const first = firstUsefulRow(next)
    if (first) {
      setNavigation({ items: [first], index: 0 })
      setSelected(first)
      const data = await workspaceApi.section(first.id)
      sectionCache.current.set(first.id, data)
      setSectionData(data)
      setSelectedOptionId(data.options[0]?.line_id ?? null)
    } else {
      setNavigation({ items: [], index: -1 })
      setSelected(null)
      setSectionData(EMPTY_SECTION)
      setSelectedOptionId(null)
    }
    setStatus(message)
  }

  async function openRules() {
    const path = await workspaceApi.pickFile()
    if (!path) return
    setBusy(true)
    try {
      const next = await workspaceApi.openFile(path)
      await enterDocument(next, `已打开 ${path}`)
      localStorage.setItem('rulesmd.lastFile', path)
    } catch (error) {
      setStatus(`打开失败：${String(error)}`)
    } finally { setBusy(false) }
  }

  async function newRules() {
    setBusy(true)
    try {
      const next = await workspaceApi.newDocument()
      await enterDocument(next, '已从清洗后的原版 rulesmd.ini 模板新建文档')
    } catch (error) {
      setStatus(`新建失败：${String(error)}`)
    } finally { setBusy(false) }
  }

  async function saveRules(): Promise<boolean> {
    if (!snapshot) return false
    setBusy(true)
    try {
      let path = snapshot.document.path ?? undefined
      if (!path) path = (await workspaceApi.pickSaveFile('rulesmd.ini')) ?? undefined
      if (!path) return false
      await workspaceApi.save(path)
      localStorage.setItem('rulesmd.lastFile', path)
      const next = await workspaceApi.snapshot()
      setSnapshot(next)
      sectionCache.current.clear()
      if (selected) {
        const data = await workspaceApi.section(selected.id)
        sectionCache.current.set(selected.id, data)
        setSectionData(data)
      }
      setStatus(`已保存 ${path}`)
      return true
    } catch (error) {
      setStatus(`保存失败：${String(error)}`)
      return false
    } finally { setBusy(false) }
  }

  async function closeWithoutSaving() {
    allowWindowClose.current = true
    await getCurrentWindow().destroy()
  }

  async function saveAndClose() {
    const saved = await saveRules()
    if (!saved) return
    allowWindowClose.current = true
    await getCurrentWindow().destroy()
  }

  async function setValue(option: SectionOption, value: string) {
    if (!snapshot || option.line_id <= 0) return
    setSelectedOptionId(option.line_id)
    setObservedValues(current => mergeObservedValue(current, option, value))
    setSectionData(current => {
      const next = { ...current, options: current.options.map(item => item.line_id === option.line_id ? { ...item, value } : item) }
      if (selected) sectionCache.current.set(selected.id, next)
      return next
    })
    try {
      const result = await workspaceApi.setValue(option.line_id, value)
      setSectionData(current => {
        if (current.section.toLowerCase() !== result.section.toLowerCase()) return current
        const next = {
          ...current,
          raw: result.raw,
          options: current.options.map(item => item.line_id === result.line_id ? { ...item, value: result.value } : item),
        }
        sectionCache.current.set(result.section, next)
        return next
      })
      setSnapshot(current => current ? { ...current, document: { ...current.document, dirty: result.dirty } } : current)
      setStatus(value === option.raw_value ? `已还原 ${selected?.id}.${option.key}` : `已修改 ${selected?.id}.${option.key}`)
    } catch (error) {
      setStatus(`写入失败：${String(error)}`)
      await refreshObservedValues()
      if (selected) {
        const data = await workspaceApi.section(selected.id)
        sectionCache.current.set(selected.id, data)
        setSectionData(data)
      }
    }
  }

  async function openOptionPicker() {
    if (!snapshot || !selected) return
    setCatalog([])
    setShowPicker(true)
    try {
      const result = await workspaceApi.optionCatalog('', selected.id, sectionKind(selected.category))
      setCatalog(result)
    } catch (error) { setStatus(`读取参数目录失败：${String(error)}`) }
  }

  async function addOption(option: CatalogOption) {
    if (!selected) return
    try {
      await workspaceApi.addOption(selected.id, option.key, option.default || undefined)
      const data = await workspaceApi.section(selected.id)
      sectionCache.current.set(selected.id, data)
      setSectionData(data)
      const added = [...data.options].reverse().find(item => item.key === option.key)
      setSelectedOptionId(added?.line_id ?? data.options[0]?.line_id ?? null)
      const next = await workspaceApi.snapshot()
      setSnapshot(next)
      await refreshObservedValues()
      setCatalog(current => current.filter(item => item.key !== option.key))
      setStatus(`已添加 ${option.label || option.key} (${option.key})`)
    } catch (error) { setStatus(`添加参数失败：${String(error)}`) }
  }

  async function toggleAres(enabled: boolean) {
    try {
      await workspaceApi.setSettings(enabled)
      setSnapshot(current => current ? { ...current, settings: { ares_enabled: enabled } } : current)
      setStatus(enabled ? '已开启 Ares 智能辅助' : '已关闭 Ares 智能辅助；现有 Ares 标签仍会保留')
    } catch (error) { setStatus(`设置失败：${String(error)}`) }
  }

  const workspaceStyle = {
    '--left-pane': `${leftPane}px`,
    '--right-pane': `${rightPane}px`,
  } as React.CSSProperties

  return <div className={`app tc-theme ${selected ? `side-${selected.side}` : ''} ${busy ? 'busy' : ''}`} data-mode={effectiveAppearance}>
    <header className="titlebar">
      <div className="brand"><div className="brandMark"><img src="/legacy/app-logo.png" alt=""/></div><div><strong>Rulesmd Editor</strong><span>Yuri's Revenge · Ares</span></div></div>
      <nav className="toolbar">
        <IconButton title="新建" onClick={() => void newRules()}><FilePlus2 size={18}/></IconButton>
        <IconButton title="打开" onClick={() => void openRules()}><FolderOpen size={18}/></IconButton>
        <IconButton title="保存" disabled={!snapshot} dirty={Boolean(snapshot?.document.dirty)} onClick={() => void saveRules()}><Save size={18}/></IconButton>
        <span className="divider"/>
        <IconButton title="启动游戏" disabled={busy} onClick={() => void launchGame()}><Gamepad2 size={18}/></IconButton>
        <IconButton title="设置" onClick={() => setShowSettings(true)}><Settings size={18}/></IconButton>
      </nav>
      <div className="titleViewSwitch viewSwitch" role="group" aria-label="编辑视图"><button disabled={!selected} className={viewMode === 'table' ? 'active' : ''} onClick={() => setViewMode('table')}>表格</button><button disabled={!selected} className={viewMode === 'raw' ? 'active' : ''} onClick={() => setViewMode('raw')}>原文</button></div>
    </header>

    <div className="workspace" style={workspaceStyle}>
      <aside className="sidebar">
        <div className="panelTitle"><span>对象</span></div>
        <label className="searchBox"><Search size={16}/><input value={unitSearch} onChange={event => setUnitSearch(event.target.value)} placeholder="搜索中文名、Section、类型"/></label>
        <div className="treeList">
          {!snapshot ? <div className="emptyPane"><strong>还没有 Rules 文档</strong><span>点击顶部“新建”使用完整原版模板，或打开已有 rulesmd.ini。</span></div> : <UnitTree rows={rows} selectedId={selected?.id} query={unitSearch} documentEpoch={documentEpoch} onSelect={row => void manualSelect(row)}/>} 
        </div>
        <div className="sideFooter"><button disabled={!snapshot}><Plus size={16}/> 添加 Section</button><button title="删除" disabled={!selected}><Trash2 size={16}/></button></div>
      </aside>
      <div className="paneSplitter" role="separator" aria-label="调整对象栏宽度" onPointerDown={event => beginResize('left', event)}/>

      <main className="editor">
        {selected ? <>
          <div className="entityHeaderHost">
            <EntityHeader tone={toneForSide(selected.side)} icon={<LegacyUnitIcon id={selected.id} size={52}/>} title={headerSectionReady ? (sectionData.description || selected.label) : selected.label} subtitle={`${selected.type} · ${selected.id}`} watermark={selected.id}/>
            <div className="entityNavigation">
              <button disabled={!previousSection} title={previousSection ? `后退到 ${previousSection.label} [${previousSection.id}]` : '没有上一项'} onClick={() => void navigateHistory(-1)}><ArrowLeft size={14}/><span>{previousSection?.label || '后退'}</span></button>
              <button disabled={!nextSection} title={nextSection ? `前进到 ${nextSection.label} [${nextSection.id}]` : '没有下一项'} onClick={() => void navigateHistory(1)}><span>{nextSection?.label || '前进'}</span><ArrowRight size={14}/></button>
            </div>
          </div>
          <section className="editorControls">
            <label className="searchBox editorSearch"><Search size={16}/><input value={fieldSearch} onChange={event => setFieldSearch(event.target.value)} placeholder="搜索 Key、参数名或值"/></label>
            <div className="segmented">{groups.map(group => <button key={group} className={activeGroup === group ? 'active' : ''} onClick={() => setActiveGroup(group)}>{group}</button>)}</div>
            <Button variant="accent" onClick={() => void openOptionPicker()}><ListPlus size={16}/> 参数</Button>
          </section>
          {viewMode === 'table' ? <section className="fieldsPane parameterTablePane">
            <div className="parameterTableHeader"><span>Key</span><span>参数名</span><span>值</span></div>
            {groupedFields.length === 0 && <div className="emptyPane"><strong>当前 Section 没有可显示参数</strong><span>可点击“参数”添加参数。</span></div>}
            {groupedFields.map(([group, list]) => <div className="fieldGroup parameterTableGroup" key={group}>
              <button className="fieldGroupHeader" onClick={() => { if (activeGroup === '全部') setCollapsed(value => ({ ...value, [group]: !value[group] })) }}>{activeGroup === '全部' && collapsed[group] ? <ChevronRight size={16}/> : <ChevronDown size={16}/>}<span>{group}</span><em>{list.length}</em></button>
              {(activeGroup !== '全部' || !collapsed[group]) && list.map(option => {
                const changed = option.raw_value == null ? true : option.value !== option.raw_value
                const focused = selectedOption?.line_id === option.line_id
                const target = referenceTarget(option)
                const candidates = referenceRows(option)
                return <div className={`parameterTableRow ${focused ? 'focused' : ''} ${changed ? 'changed' : ''}`} key={option.line_id} onClick={() => setSelectedOptionId(option.line_id)}>
                  <div className="parameterKeyCell"><code>{option.key}</code>{option.source.toLowerCase() === 'ares' && <span className="aresBadge">ARES</span>}</div>
                  <div className="parameterLabelCell"><strong>{option.label || option.key}</strong></div>
                  <div className="parameterValueCell" onPointerDown={() => setSelectedOptionId(option.line_id)} onClick={event => event.stopPropagation()}><div className="rulesControlHost"><FieldControl option={option} referenceRows={candidates} observedKeyValues={observedValues.byKey[option.key.toLowerCase()] ?? []} audioValues={observedValues.audio} onChange={value => void setValue(option, value)}/>{target && target.id !== selected?.id && option.widget !== 'multi-select' && <button className="referenceJump" title={`跳转到 ${target.label} [${target.id}]`} onClick={() => void jumpToReference(target)}><ArrowRight size={15}/></button>}</div></div>
                </div>
              })}
            </div>)}
          </section> : <section className="rawEditorPane"><pre>{sectionData.raw}</pre></section>}
        </> : <div className="emptyPane"><strong>Rulesmd Editor</strong><span>使用“新建”创建完整原版 rulesmd.ini，或打开已有文件。</span></div>}
      </main>

      <div className="paneSplitter" role="separator" aria-label="调整帮助栏宽度" onPointerDown={event => beginResize('right', event)}/>
      <aside className="inspector inspectorCombined">
        <div className="inspectorHeading"><CircleHelp size={16}/><strong>参数帮助</strong></div>
        <div className="inspectorScroll">
          <div className="helpContent">
            {selectedOption ? <>
              <div className="helpHeader"><WandSparkles size={19}/><div><small>当前参数</small><strong>{selectedOption.key}</strong></div></div>
              <span className={`docBadge ${selectedOption.source === 'Ares' ? 'ares' : ''}`}>{selectedOption.source === 'Ares' && <Sparkles size={13}/>} {selectedOption.source === 'Ares' ? 'Ares 扩展' : 'Yuri 原版'}</span>
              <div className="helpDescriptionCard"><h3>{selectedOption.label || selectedOption.key}</h3><p>{selectedOption.description || '暂无内置中文说明；该参数仍会被无损读取、编辑和保存。'}</p></div>
              <div className="helpMeta"><span>Key</span><b>{selectedOption.key}</b><span>控件</span><b>{selectedOption.widget}</b><span>当前值</span><b>{selectedOption.value || '—'}</b><span>类型</span><b>{selectedOption.value_type || '—'}</b><span>来源</span><b>{selectedOption.source}</b></div>
              {selectedOption.docs && <><div className="helpDivider"/><h4>资料来源</h4><p className="docSource">{selectedOption.docs}</p></>}
              {selectedOption.values.length > 0 && <><div className="helpDivider"/><h4>可选值</h4><div className="valueChoices">{selectedOption.values.slice(0, 30).map(item => <span key={item.value}>{item.label || item.value}<small>{item.value}</small></span>)}</div></>}
            </> : <div className="emptyHelp">选择一个参数查看来自旧版资料库和 Ares 元数据的中文帮助。</div>}
          </div>
        </div>
      </aside>
    </div>

    <ParameterPicker open={showPicker} options={catalog} objectLabel={selected ? `${selected.label} [${selected.id}]` : ''} onClose={() => setShowPicker(false)} onAdd={addOption}/>

    <Dialog open={showSettings} title="设置" icon={<Settings size={18}/>} onClose={() => setShowSettings(false)}>
      <div className="settingsDialogBody settingsGrid">
        <div className="settingsSectionTitle">编辑器</div>
        <div className="settingRow settingPathRow"><div><strong>游戏路径</strong><span>选择游戏启动程序；顶部“启动游戏”会从该程序所在目录启动。</span></div><div className="settingPathControl"><TextField value={localSettings.gamePath} onChange={value => updateLocalSetting('gamePath', value)} placeholder="Yuri's Revenge.exe"/><Button onClick={() => void chooseGameExecutable()}><FolderOpen size={15}/>选择</Button></div></div>
        <div className="settingRow"><div><strong>外观</strong><span>切换编辑器的深色、浅色或系统外观。</span></div><Select value={localSettings.appearance} options={[{value:'dark',label:'深色'},{value:'light',label:'浅色'},{value:'system',label:'跟随系统'}]} onChange={value => updateLocalSetting('appearance', value as LocalEditorSettings['appearance'])}/></div>
        <div className="settingsSectionTitle">规则兼容</div>
        <div className="settingRow"><div><strong>Ares 支持</strong><span>关闭后不再推荐 Ares 参数，但已有或手写 Ares 标签仍会正常读取、编辑和保存。</span></div><BoolSwitch value={(snapshot?.settings.ares_enabled ?? true) ? 'yes' : 'no'} onChange={value => void toggleAres(value === 'yes')}/></div>
      </div>
    </Dialog>

    <Dialog open={showClosePrompt} title="保存修改" icon={<Save size={18}/>} onClose={() => setShowClosePrompt(false)}>
      <div className="closePrompt"><p>当前文件还有未保存修改。关闭前是否保存？</p><div className="closePromptActions"><Button onClick={() => void saveAndClose()}>保存并退出</Button><Button className="quietDanger" onClick={() => void closeWithoutSaving()}>不保存</Button><Button className="quietButton" onClick={() => setShowClosePrompt(false)}>取消</Button></div></div>
    </Dialog>
  </div>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)