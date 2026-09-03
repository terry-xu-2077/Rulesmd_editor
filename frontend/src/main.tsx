import React, { useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
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
  Box,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FilePlus2,
  FolderOpen,
  Gamepad2,
  History,
  MoreHorizontal,
  Plus,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { workspaceApi, type CatalogOption, type SectionData, type SectionOption, type WorkspaceSnapshot } from './backend'
import { hasLegacyIcon, legacyIconStyle } from './legacyIcons'
import { ParameterPicker } from './ParameterPicker'
import { UnitTree } from './UnitTree'
import './styles.css'

type Side = 'allied' | 'soviet' | 'yuri' | 'neutral'
type SectionRow = { id: string; label: string; type: string; category: string; side: Side }

const EMPTY_SECTION: SectionData = { section: '', description: '', options: [], raw: '', references: [] }

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
    side: sideForId(item.section),
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
      side: sideForId(first.section),
    }
  }
  const category = snapshot.categories.find(item => item.items.length)
  const first = category?.items[0]
  return category && first ? {
    id: first.section,
    label: first.label || first.section,
    type: category.name,
    category: category.name,
    side: sideForId(first.section),
  } : null
}

function numericRange(option: SectionOption) {
  const key = option.key.toLowerCase()
  if (key === 'speed' || key === 'sight') return { min: 0, max: 30, step: 1, suffix: '' }
  if (key === 'strength') return { min: 0, max: 5000, step: 25, suffix: '' }
  if (key === 'cost') return { min: 0, max: 10000, step: 50, suffix: '' }
  if (option.value.includes('%') || option.value_type === 'percent') return { min: 0, max: 500, step: 5, suffix: '%' }
  const numeric = Number.parseFloat(option.value)
  const decimal = option.value.includes('.')
  if (!Number.isFinite(numeric)) return { min: 0, max: 100, step: decimal ? 0.1 : 1, suffix: '' }
  const abs = Math.max(1, Math.abs(numeric))
  return {
    min: numeric < 0 ? -Math.max(100, Math.ceil(abs * 2)) : 0,
    max: Math.max(100, Math.ceil(abs * 2)),
    step: decimal ? 0.1 : 1,
    suffix: '',
  }
}

function IconButton({ title, children, primary = false, onClick, disabled = false }: {
  title: string; children: React.ReactNode; primary?: boolean; onClick?: () => void; disabled?: boolean
}) {
  return <button className={`iconButton ${primary ? 'primary' : ''}`} title={title} onClick={onClick} disabled={disabled}>{children}</button>
}

function LegacyUnitIcon({ id, size = 36, className = '' }: { id: string; size?: number; className?: string }) {
  if (hasLegacyIcon(id)) {
    return <div className={`legacyUnitIcon ${className}`} style={{ width: size, height: Math.round(size * .8), ...legacyIconStyle(id, size) }} />
  }
  return <div className={`legacyUnitIcon fallback ${className}`} style={{ width: size, height: size }}><Box size={Math.max(14, Math.round(size * .48))}/></div>
}

function FieldControl({ option, onChange }: { option: SectionOption; onChange: (value: string) => void }) {
  const raw = option.raw_value ?? undefined
  if (option.widget === 'boolean') return <BoolSwitch value={option.value} rawValue={raw} onChange={onChange} trueValue="yes" falseValue="no" />
  if (option.widget === 'multi-select') {
    const values = option.value.split(',').map(value => value.trim()).filter(Boolean)
    const rawValues = option.raw_value == null ? undefined : option.raw_value.split(',').map(value => value.trim()).filter(Boolean)
    return <MultiSelect values={values} rawValues={rawValues} options={option.values.map(value => ({ value: value.value, label: value.label || value.value }))} onChange={next => onChange(next.join(','))} mode="menu" title={option.label || option.key}/>
  }
  if (option.widget === 'select') {
    const options = option.values.map(value => ({ value: value.value, label: value.label ? `${value.label} · ${value.value}` : value.value }))
    if (option.value && !options.some(value => value.value === option.value)) options.unshift({ value: option.value, label: option.value })
    return <Select value={option.value} rawValue={raw} options={options} onChange={onChange} tooltip={option.description || undefined}/>
  }
  if (option.widget === 'slider') {
    const range = numericRange(option)
    const numeric = Number.parseFloat(option.value.replace('%', ''))
    const rawNumeric = option.raw_value == null ? undefined : Number.parseFloat(option.raw_value.replace('%', ''))
    const value = Number.isFinite(numeric) ? Math.min(range.max, Math.max(range.min, numeric)) : range.min
    return <Slider value={value} rawValue={rawNumeric != null && Number.isFinite(rawNumeric) ? rawNumeric : undefined} min={range.min} max={range.max} step={range.step} onChange={next => onChange(`${next}${range.suffix}`)}/>
  }
  return <TextField value={option.value} rawValue={raw} onChange={onChange} placeholder={option.label || option.key} tooltip={option.description || undefined}/>
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
  const [showRaw, setShowRaw] = useState(false)
  const [status, setStatus] = useState('新建或打开 rulesmd.ini 开始编辑')
  const [busy, setBusy] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [catalog, setCatalog] = useState<CatalogOption[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [documentEpoch, setDocumentEpoch] = useState(0)
  const sectionCache = useRef(new Map<string, SectionData>())
  const sectionRequest = useRef(0)

  const rows = useMemo(() => rowsFromSnapshot(snapshot), [snapshot])
  const groups = useMemo(() => ['全部', ...Array.from(new Set(sectionData.options.map(option => displayGroup(option.category))))], [sectionData])
  const visibleFields = useMemo(() => sectionData.options.filter(option => {
    const groupOk = activeGroup === '全部' || displayGroup(option.category) === activeGroup
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

  async function showSection(row: SectionRow) {
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

  async function enterDocument(next: WorkspaceSnapshot, message: string) {
    sectionCache.current.clear()
    sectionRequest.current += 1
    setSnapshot(next)
    setUnitSearch('')
    setFieldSearch('')
    setDocumentEpoch(value => value + 1)
    const first = firstUsefulRow(next)
    if (first) {
      setSelected(first)
      const data = await workspaceApi.section(first.id)
      sectionCache.current.set(first.id, data)
      setSectionData(data)
      setSelectedOptionId(data.options[0]?.line_id ?? null)
    } else {
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
    } catch (error) {
      setStatus(`打开失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function newRules() {
    setBusy(true)
    try {
      const next = await workspaceApi.newDocument()
      await enterDocument(next, '已从清洗后的原版 rulesmd.ini 模板新建文档')
    } catch (error) {
      setStatus(`新建失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function saveRules() {
    if (!snapshot) return
    setBusy(true)
    try {
      let path = snapshot.document.path ?? undefined
      if (!path) path = (await workspaceApi.pickSaveFile('rulesmd.ini')) ?? undefined
      if (!path) return
      await workspaceApi.save(path)
      const next = await workspaceApi.snapshot()
      setSnapshot(next)
      sectionCache.current.clear()
      if (selected) {
        const data = await workspaceApi.section(selected.id)
        sectionCache.current.set(selected.id, data)
        setSectionData(data)
      }
      setStatus(`已保存 ${path}`)
    } catch (error) {
      setStatus(`保存失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function setValue(option: SectionOption, value: string) {
    if (!snapshot || option.line_id <= 0) return
    setSectionData(current => {
      const next = { ...current, options: current.options.map(item => item.line_id === option.line_id ? { ...item, value } : item) }
      if (selected) sectionCache.current.set(selected.id, next)
      return next
    })
    try {
      const result = await workspaceApi.setValue(option.line_id, value) as { dirty: boolean }
      setSnapshot(current => current ? { ...current, document: { ...current.document, dirty: result.dirty } } : current)
      setStatus(value === option.raw_value ? `已还原 ${selected?.id}.${option.key}` : `已修改 ${selected?.id}.${option.key}`)
    } catch (error) {
      setStatus(`写入失败：${String(error)}`)
      if (selected) {
        const data = await workspaceApi.section(selected.id)
        sectionCache.current.set(selected.id, data)
        setSectionData(data)
      }
    }
  }

  async function refreshRaw() {
    if (!selected || !snapshot) { setShowRaw(true); return }
    try {
      const data = await workspaceApi.section(selected.id)
      sectionCache.current.set(selected.id, data)
      setSectionData(data)
    } finally {
      setShowRaw(true)
    }
  }

  async function openOptionPicker() {
    if (!snapshot || !selected) return
    setCatalog([])
    setShowPicker(true)
    try {
      const result = await workspaceApi.optionCatalog('', selected.id, sectionKind(selected.category))
      setCatalog(result)
    } catch (error) {
      setStatus(`读取参数目录失败：${String(error)}`)
    }
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
      setCatalog(current => current.filter(item => item.key !== option.key))
      setStatus(`已添加 ${option.label || option.key} (${option.key})`)
    } catch (error) {
      setStatus(`添加参数失败：${String(error)}`)
    }
  }

  async function toggleAres(enabled: boolean) {
    try {
      await workspaceApi.setSettings(enabled)
      setSnapshot(current => current ? { ...current, settings: { ares_enabled: enabled } } : current)
      setStatus(enabled ? '已开启 Ares 智能辅助' : '已关闭 Ares 智能辅助；现有 Ares 标签仍会保留')
    } catch (error) {
      setStatus(`设置失败：${String(error)}`)
    }
  }

  return <div className={`app tc-theme ${selected ? `side-${selected.side}` : ''} ${busy ? 'busy' : ''}`} data-mode="dark">
    <header className="titlebar">
      <div className="brand"><div className="brandMark">R</div><div><strong>Rulesmd Editor</strong><span>Yuri's Revenge · Ares</span></div></div>
      <nav className="toolbar">
        <IconButton title="新建" onClick={() => void newRules()}><FilePlus2 size={19}/></IconButton>
        <IconButton title="打开" onClick={() => void openRules()}><FolderOpen size={19}/></IconButton>
        <IconButton title="保存" primary disabled={!snapshot} onClick={() => void saveRules()}><Save size={19}/></IconButton>
        <span className="divider"/>
        <IconButton title="启动游戏" disabled><Gamepad2 size={19}/></IconButton>
        <IconButton title="设置" onClick={() => setShowSettings(true)}><Settings size={19}/></IconButton>
      </nav>
      <div className="titleMeta"><span className={`statusDot ${snapshot?.document.dirty ? 'dirty' : ''}`}/>{snapshot?.document.dirty ? '有未保存修改' : snapshot ? '已保存' : '未打开文档'}</div>
    </header>

    <div className="workspace">
      <aside className="sidebar">
        <div className="panelTitle"><span>对象</span></div>
        <label className="searchBox"><Search size={16}/><input value={unitSearch} onChange={event => setUnitSearch(event.target.value)} placeholder="搜索中文名、Section、类型"/></label>
        <div className="treeList">
          {!snapshot ? <div className="emptyPane"><strong>还没有 Rules 文档</strong><span>点击顶部“新建”使用完整原版模板，或打开已有 rulesmd.ini。</span></div> : <UnitTree rows={rows} selectedId={selected?.id} query={unitSearch} documentEpoch={documentEpoch} onSelect={row => void showSection(row)}/>} 
        </div>
        <div className="sideFooter"><button disabled={!snapshot}><Plus size={16}/> 添加 Section</button><button title="删除" disabled={!selected}><Trash2 size={16}/></button></div>
      </aside>

      <main className="editor">
        {selected ? <>
          <div className="entityHeaderHost">
            <EntityHeader tone={toneForSide(selected.side)} icon={<LegacyUnitIcon id={selected.id} size={52}/>} title={sectionData.description || selected.label} subtitle={`${selected.type} · ${selected.id}`} watermark={selected.id} pinned={pinned} onPin={() => setPinned(value => !value)}/>
            <div className="entityHeaderActions"><button className="chip"><History size={15}/> 引用</button><button className="chip"><MoreHorizontal size={15}/></button></div>
          </div>
          <section className="editorControls">
            <label className="searchBox editorSearch"><Search size={16}/><input value={fieldSearch} onChange={event => setFieldSearch(event.target.value)} placeholder="搜索参数、中文说明或值"/></label>
            <div className="segmented">{groups.map(group => <button key={group} className={activeGroup === group ? 'active' : ''} onClick={() => setActiveGroup(group)}>{group}</button>)}</div>
            <Button onClick={() => void openOptionPicker()}><Plus size={16}/> 参数</Button>
          </section>
          <section className="fieldsPane parameterTablePane">
            <div className="parameterTableHeader"><span>Key</span><span>中文说明</span><span>值</span></div>
            {groupedFields.length === 0 && <div className="emptyPane"><strong>当前 Section 没有可显示参数</strong><span>可点击“+ 参数”添加已确认兼容的参数。</span></div>}
            {groupedFields.map(([group, list]) => <div className="fieldGroup parameterTableGroup" key={group}>
              <button className="fieldGroupHeader" onClick={() => setCollapsed(value => ({ ...value, [group]: !value[group] }))}>{collapsed[group] ? <ChevronRight size={16}/> : <ChevronDown size={16}/>}<span>{group}</span><em>{list.length}</em></button>
              {!collapsed[group] && list.map(option => {
                const changed = option.raw_value == null ? true : option.value !== option.raw_value
                const focused = selectedOption?.line_id === option.line_id
                return <div className={`parameterTableRow ${focused ? 'focused' : ''} ${changed ? 'changed' : ''}`} key={option.line_id} onClick={() => setSelectedOptionId(option.line_id)}>
                  <div className="parameterKeyCell"><code>{option.key}</code>{option.source.toLowerCase() === 'ares' && <span className="aresBadge">ARES</span>}</div>
                  <div className="parameterLabelCell" title={option.description || option.label || option.key}><strong>{option.label || option.key}</strong>{option.description && <small>{option.description}</small>}</div>
                  <div className="parameterValueCell" onClick={event => event.stopPropagation()}><div className="rulesControlHost"><FieldControl option={option} onChange={value => void setValue(option, value)}/></div></div>
                </div>
              })}
            </div>)}
          </section>
        </> : <div className="emptyPane"><strong>Rulesmd Editor</strong><span>使用“新建”创建完整原版 rulesmd.ini，或打开已有文件。</span></div>}
      </main>

      <aside className="inspector">
        <div className="inspectorTabs"><button className={!showRaw ? 'active' : ''} onClick={() => setShowRaw(false)}><CircleHelp size={16}/> 帮助</button><button className={showRaw ? 'active' : ''} onClick={() => void refreshRaw()}>{'{ }'} 原文</button></div>
        {!showRaw ? <div className="helpContent">
          {selectedOption ? <><div className="helpHeader"><WandSparkles size={19}/><div><small>当前参数</small><strong>{selectedOption.key}</strong></div></div><span className={`docBadge ${selectedOption.source === 'Ares' ? 'ares' : ''}`}>{selectedOption.source === 'Ares' && <Sparkles size={13}/>} {selectedOption.source === 'Ares' ? 'Ares 扩展' : 'Yuri 原版'}</span><h3>{selectedOption.label || selectedOption.key}</h3><p>{selectedOption.description || '暂无内置中文说明；该参数仍会被无损读取、编辑和保存。'}</p><div className="infoCard"><span>控件</span><b>{selectedOption.widget}</b><span>当前值</span><b className="valueText">{selectedOption.value || '—'}</b><span>来源</span><b>{selectedOption.source}</b></div>{selectedOption.values.length > 0 && <><div className="helpDivider"/><h4>可选值</h4><div className="valueChoices">{selectedOption.values.slice(0, 30).map(item => <span key={item.value}>{item.label || item.value}<small>{item.value}</small></span>)}</div></>}</> : <div className="emptyHelp">选择一个参数查看来自旧版资料库和 Ares 元数据的中文帮助。</div>}
          {selected && <><div className="helpDivider"/><h4>引用关系</h4><div className="relation"><div className="relationIcon">S</div><div><strong>{selected.id}</strong><span>{sectionData.description || selected.type}</span></div></div>{sectionData.references.slice(0, 8).map(reference => <React.Fragment key={`${reference.section}.${reference.key}`}><div className="relationLine"/><div className="relation"><div className="relationIcon weapon">R</div><div><strong>{reference.section}</strong><span>{reference.key}</span></div></div></React.Fragment>)}</>}
        </div> : <pre className="rawView">{sectionData.raw}</pre>}
      </aside>
    </div>

    <footer className="statusbar"><span>{status}</span><div><span>{snapshot?.document.encoding ?? '—'}</span><span>{snapshot?.document.newline ?? '—'}</span><span>{sectionData.options.length} 参数</span><span className="aresStatus"><Sparkles size={13}/> {snapshot?.settings.ares_enabled === false ? 'Ares 辅助关闭' : 'Ares'}</span></div></footer>

    <ParameterPicker open={showPicker} options={catalog} objectLabel={selected ? `${selected.label} [${selected.id}]` : ''} onClose={() => setShowPicker(false)} onAdd={addOption}/>

    <Dialog open={showSettings} title="设置" onClose={() => setShowSettings(false)}><div className="settingsDialogBody"><div className="settingRow"><div><strong>Ares 支持</strong><span>关闭后不再推荐 Ares 参数，但已有或手写 Ares 标签仍会正常读取、编辑和保存。</span></div><BoolSwitch value={(snapshot?.settings.ares_enabled ?? true) ? 'yes' : 'no'} onChange={value => void toggleAres(value === 'yes')}/></div></div></Dialog>
  </div>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)