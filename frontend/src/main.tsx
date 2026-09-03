import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Box,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  FilePlus2,
  FolderOpen,
  Gamepad2,
  GitCompareArrows,
  History,
  MoreHorizontal,
  Pin,
  Plus,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react'
import { workspaceApi, type CatalogOption, type SectionData, type SectionOption, type WorkspaceSnapshot } from './backend'
import { hasLegacyIcon, legacyIconStyle } from './legacyIcons'
import './styles.css'

type Side = 'allied' | 'soviet' | 'yuri' | 'neutral'

type SectionRow = {
  id: string
  label: string
  type: string
  category: string
  side: Side
}

const demoRows: SectionRow[] = [
  { id: 'GHOST', label: '海豹部队', type: '步兵', category: '步兵', side: 'allied' },
  { id: 'SNIPE', label: '狙击手', type: '步兵', category: '步兵', side: 'allied' },
  { id: 'E1', label: '美国大兵', type: '步兵', category: '步兵', side: 'allied' },
  { id: 'HTNK', label: '犀牛坦克', type: '载具', category: '战车', side: 'soviet' },
  { id: 'MTNK', label: '灰熊坦克', type: '载具', category: '战车', side: 'allied' },
  { id: 'YTNK', label: '盖特坦克', type: '载具', category: '战车', side: 'yuri' },
  { id: 'GAPOWR', label: '盟军发电厂', type: '建筑', category: '建筑', side: 'allied' },
  { id: 'NARADR', label: '苏军雷达', type: '建筑', category: '建筑', side: 'soviet' },
]

const demoOptions: SectionOption[] = [
  { line_id: -1, key: 'UIName', label: '显示名称', value: 'Name:GHOST', suffix: '', value_type: 'text', category: '基础', source: 'YR', description: '游戏内显示名称。', values: [], docs: '' },
  { line_id: -2, key: 'Primary', label: '主武器', value: 'MP5', suffix: '', value_type: 'weapon', category: '武器', source: 'YR', description: '单位的主武器。', values: [], docs: '' },
  { line_id: -3, key: 'Strength', label: '生命值', value: '125', suffix: '', value_type: 'integer', category: '属性', source: 'YR', description: '单位生命值。', values: [], docs: '' },
  { line_id: -4, key: 'Armor', label: '装甲类型', value: 'none', suffix: '', value_type: 'enum', category: '属性', source: 'YR', description: '决定弹头 Verses 对该对象的伤害倍率。', values: [{value:'none',label:'none'},{value:'flak',label:'flak'},{value:'plate',label:'plate'}], docs: '' },
  { line_id: -5, key: 'Sight', label: '视野', value: '8', suffix: '', value_type: 'integer', category: '属性', source: 'YR', description: '对象揭开战争迷雾的格数。', values: [], docs: '' },
  { line_id: -6, key: 'Speed', label: '移动速度', value: '5', suffix: '', value_type: 'integer', category: '移动', source: 'YR', description: '单位移动速度。', values: [], docs: '' },
  { line_id: -7, key: 'Owner', label: '所属阵营', value: 'British,French,Germans,Americans,Alliance', suffix: '', value_type: 'text', category: '阵营', source: 'YR', description: '允许建造该对象的国家。', values: [], docs: '' },
  { line_id: -8, key: 'Cost', label: '价格', value: '1000', suffix: '', value_type: 'integer', category: '经济', source: 'YR', description: '生产所需资金。', values: [], docs: '' },
  { line_id: -9, key: 'Cloakable', label: '可隐形', value: 'yes', suffix: '', value_type: 'boolean', category: '特殊', source: 'YR', description: '对象是否可以进入隐形状态。', values: [{value:'yes',label:'是'},{value:'no',label:'否'}], docs: '' },
  { line_id: -10, key: 'AttachEffect.Duration', label: '附加效果持续时间', value: '90', suffix: '', value_type: 'integer', category: 'Ares · AttachEffect', source: 'Ares', description: '效果持续帧数。-1 表示无限持续，0 表示不持续。', values: [], docs: 'new/attacheffect.html' },
  { line_id: -11, key: 'AttachEffect.Cloakable', label: '效果期间可隐形', value: 'no', suffix: '', value_type: 'boolean', category: 'Ares · AttachEffect', source: 'Ares', description: '启用后，目标在 AttachEffect 持续期间获得隐形能力。', values: [{value:'yes',label:'是'},{value:'no',label:'否'}], docs: 'new/attacheffect.html' },
]

function sideForId(id: string): Side {
  const key = id.toUpperCase()
  if (key.startsWith('YA') || key.startsWith('YURI') || ['YTNK','DISK','BRUTE','VIRUS','INIT'].includes(key)) return 'yuri'
  if (key.startsWith('NA') || ['HTNK','E2','TESLA','SHK','APOC','V3','BORIS','FLAKT','DRED','SUB'].includes(key)) return 'soviet'
  if (key.startsWith('GA') || ['GHOST','SNIPE','E1','MTNK','FV','TANY','GGI','SPY','CLEG','SREF'].includes(key)) return 'allied'
  return 'neutral'
}

function displayGroup(category: string) {
  return category.replace(/^Ares\s*·\s*/i, '').trim() || '其他'
}

function sectionKind(category: string): string | undefined {
  if (/步兵|战车|飞机|建筑|单位/i.test(category)) return 'TechnoType'
  if (/武器/i.test(category)) return 'Weapon'
  if (/弹头/i.test(category)) return 'Warhead'
  if (/弹体|抛射/i.test(category)) return 'Projectile'
  return undefined
}

function rangeFor(option: SectionOption): { min: number; max: number; step: number; suffix?: string } | null {
  const key = option.key.toLowerCase()
  if (key === 'speed') return { min: 0, max: 30, step: 1 }
  if (key === 'sight') return { min: 0, max: 30, step: 1 }
  if (key === 'strength') return { min: 0, max: 5000, step: 25 }
  if (key === 'cost') return { min: 0, max: 10000, step: 50 }
  if (option.value_type === 'percent') return { min: 0, max: 500, step: 5, suffix: '%' }
  return null
}

function IconButton({ title, children, primary = false, onClick }: { title: string; children: React.ReactNode; primary?: boolean; onClick?: () => void }) {
  return <button className={`iconButton ${primary ? 'primary' : ''}`} title={title} onClick={onClick}>{children}</button>
}

function LegacyUnitIcon({ id, size = 36, className = '' }: { id: string; size?: number; className?: string }) {
  if (hasLegacyIcon(id)) return <div className={`legacyUnitIcon ${className}`} style={{ width: size, height: Math.round(size * .8), ...legacyIconStyle(id, size) }} />
  return <div className={`legacyUnitIcon fallback ${className}`} style={{ width: size, height: size }}><Box size={Math.max(14, Math.round(size * .48))}/></div>
}

function FieldControl({ option, onChange }: { option: SectionOption; onChange: (value: string) => void }) {
  const isBoolean = option.value_type === 'boolean' || /^(yes|no)$/i.test(option.value) && option.values.some(v => /^(yes|no)$/i.test(v.value))
  if (isBoolean) {
    const on = option.value.toLowerCase() === 'yes'
    return <button className={`legacySwitch ${on ? 'on' : 'off'}`} onClick={() => onChange(on ? 'no' : 'yes')}>
      <span className="switchKnob">{on ? 'ON 开' : 'OFF 关'}</span>
    </button>
  }

  if (option.values.length > 0 && option.value_type !== 'enum-or-integer') {
    const hasCurrent = option.values.some(v => v.value === option.value)
    return <div className="selectWrap">
      <select value={option.value} onChange={e => onChange(e.target.value)}>
        {!hasCurrent && <option value={option.value}>{option.value}</option>}
        {option.values.map(v => <option key={v.value} value={v.value}>{v.label ? `${v.label} · ${v.value}` : v.value}</option>)}
      </select>
      <ChevronDown size={15}/>
    </div>
  }

  const range = rangeFor(option)
  if (range) {
    const raw = option.value.replace('%','')
    const numeric = Number.parseFloat(raw)
    const value = Number.isFinite(numeric) ? numeric : range.min
    return <div className="sliderEditor">
      <input type="range" min={range.min} max={range.max} step={range.step} value={Math.min(range.max, Math.max(range.min, value))} onChange={e => onChange(`${e.target.value}${range.suffix ?? ''}`)}/>
      <input className="numericBox" value={option.value} onChange={e => onChange(e.target.value)}/>
    </div>
  }

  const numeric = ['integer','float'].includes(option.value_type)
  return <input className="legacyTextInput" type={numeric ? 'number' : 'text'} value={option.value} onChange={e => onChange(e.target.value)}/>
}

function App() {
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null)
  const [selected, setSelected] = useState<SectionRow>(demoRows[0])
  const [sectionData, setSectionData] = useState<SectionData>({ section: 'GHOST', description: '海豹部队', options: demoOptions, raw: '[GHOST]\nStrength=125\nSpeed=5', references: [] })
  const [selectedOptionId, setSelectedOptionId] = useState<number>(demoOptions[0].line_id)
  const [changed, setChanged] = useState<Set<number>>(new Set())
  const [unitSearch, setUnitSearch] = useState('')
  const [fieldSearch, setFieldSearch] = useState('')
  const [activeGroup, setActiveGroup] = useState('全部')
  const [activeObjectCategory, setActiveObjectCategory] = useState('全部')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showRaw, setShowRaw] = useState(false)
  const [status, setStatus] = useState('示例界面 · 点击“打开”载入 rulesmd.ini')
  const [busy, setBusy] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [catalog, setCatalog] = useState<CatalogOption[]>([])
  const [catalogSearch, setCatalogSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  const rows = useMemo<SectionRow[]>(() => {
    if (!snapshot) return demoRows
    return snapshot.categories.flatMap(category => category.items.map(item => ({
      id: item.section,
      label: item.section,
      type: category.name,
      category: category.name,
      side: sideForId(item.section),
    })))
  }, [snapshot])

  const objectCategories = useMemo(() => ['全部', ...Array.from(new Set(rows.map(r => r.category)))], [rows])
  const visibleUnits = useMemo(() => rows.filter(u => {
    const categoryOk = activeObjectCategory === '全部' || u.category === activeObjectCategory
    return categoryOk && `${u.label} ${u.id} ${u.type}`.toLowerCase().includes(unitSearch.toLowerCase())
  }), [rows, unitSearch, activeObjectCategory])

  const groups = useMemo(() => ['全部', ...Array.from(new Set(sectionData.options.map(o => displayGroup(o.category))))], [sectionData])
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

  const selectedOption = sectionData.options.find(o => o.line_id === selectedOptionId) ?? sectionData.options[0]

  async function loadSection(row: SectionRow) {
    setSelected(row)
    setActiveGroup('全部')
    if (!snapshot) {
      const data = row.id === 'GHOST' ? { ...sectionData, section: row.id, description: row.label } : { section: row.id, description: row.label, options: demoOptions, raw: `[${row.id}]`, references: [] }
      setSectionData(data)
      setSelectedOptionId(data.options[0]?.line_id ?? 0)
      return
    }
    try {
      setBusy(true)
      const data = await workspaceApi.section(row.id)
      setSectionData(data)
      setSelectedOptionId(data.options[0]?.line_id ?? 0)
      setStatus(`已载入 [${row.id}] · ${data.options.length} 个参数`)
    } catch (error) {
      setStatus(`读取 Section 失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function openRules() {
    try {
      const path = await workspaceApi.pickFile()
      if (!path) return
      setBusy(true)
      const next = await workspaceApi.openFile(path)
      setSnapshot(next)
      setChanged(new Set())
      const firstCategory = next.categories.find(c => c.items.length)
      const first = firstCategory?.items[0]
      if (first && firstCategory) {
        const row: SectionRow = { id: first.section, label: first.section, type: firstCategory.name, category: firstCategory.name, side: sideForId(first.section) }
        setSelected(row)
        const data = await workspaceApi.section(first.section)
        setSectionData(data)
        setSelectedOptionId(data.options[0]?.line_id ?? 0)
      }
      setStatus(`已打开 ${path}`)
    } catch (error) {
      setStatus(`打开失败：${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  async function newRules() {
    try {
      const next = await workspaceApi.newDocument()
      setSnapshot(next)
      setSectionData({section:'',description:'',options:[],raw:'',references:[]})
      setChanged(new Set())
      setStatus('已新建空白 Rules 文档')
    } catch (error) { setStatus(`新建失败：${String(error)}`) }
  }

  async function saveRules() {
    if (!snapshot) { setStatus('当前仍是示例界面，请先打开 rulesmd.ini'); return }
    try {
      setBusy(true)
      let path = snapshot.document.path ?? undefined
      if (!path) path = (await workspaceApi.pickSaveFile()) ?? undefined
      if (!path) return
      await workspaceApi.save(path)
      const next = await workspaceApi.snapshot()
      setSnapshot(next)
      setChanged(new Set())
      setStatus(`已保存 ${path}`)
    } catch (error) { setStatus(`保存失败：${String(error)}`) }
    finally { setBusy(false) }
  }

  function setValue(option: SectionOption, value: string) {
    setSectionData(current => ({ ...current, options: current.options.map(item => item.line_id === option.line_id ? { ...item, value } : item) }))
    setChanged(current => new Set(current).add(option.line_id))
    setStatus(`已修改 ${selected.id}.${option.key}`)
    if (snapshot && option.line_id > 0) {
      void workspaceApi.setValue(option.line_id, value).then(() => {
        setSnapshot(current => current ? { ...current, document: { ...current.document, dirty: true } } : current)
      }).catch(error => setStatus(`写入失败：${String(error)}`))
    }
  }

  async function openOptionPicker() {
    if (!snapshot) { setStatus('参数插入需要先打开或新建 Rules 文档'); return }
    try {
      setBusy(true)
      const result = await workspaceApi.optionCatalog('', sectionKind(selected.category))
      setCatalog(result)
      setCatalogSearch('')
      setShowPicker(true)
    } catch (error) { setStatus(`读取参数目录失败：${String(error)}`) }
    finally { setBusy(false) }
  }

  async function addOption(option: CatalogOption) {
    try {
      await workspaceApi.addOption(selected.id, option.key, option.default || undefined)
      const data = await workspaceApi.section(selected.id)
      setSectionData(data)
      const added = [...data.options].reverse().find(o => o.key === option.key)
      if (added) setSelectedOptionId(added.line_id)
      setSnapshot(current => current ? { ...current, document: { ...current.document, dirty: true } } : current)
      setShowPicker(false)
      setStatus(`已添加 ${option.label} (${option.key})`)
    } catch (error) { setStatus(`添加参数失败：${String(error)}`) }
  }

  async function toggleAres(enabled: boolean) {
    try {
      await workspaceApi.setSettings(enabled)
      setSnapshot(current => current ? { ...current, settings: { ares_enabled: enabled } } : current)
      setStatus(enabled ? '已开启 Ares 智能辅助' : '已关闭 Ares 智能辅助；已有/手写 Ares 标签仍可编辑')
    } catch (error) { setStatus(`设置失败：${String(error)}`) }
  }

  const filteredCatalog = useMemo(() => catalog.filter(option => `${option.label} ${option.key} ${option.description}`.toLowerCase().includes(catalogSearch.toLowerCase())), [catalog, catalogSearch])

  return (
    <div className={`app side-${selected.side} ${busy ? 'busy' : ''}`}>
      <header className="titlebar">
        <div className="brand"><div className="brandMark">R</div><div><strong>Rulesmd Editor</strong><span>Yuri's Revenge · Ares</span></div></div>
        <nav className="toolbar">
          <IconButton title="新建" onClick={newRules}><FilePlus2 size={19}/></IconButton>
          <IconButton title="打开" onClick={openRules}><FolderOpen size={19}/></IconButton>
          <IconButton title="保存" primary onClick={saveRules}><Save size={19}/></IconButton>
          <span className="divider"/>
          <IconButton title="启动游戏"><Gamepad2 size={19}/></IconButton>
          <IconButton title="设置" onClick={() => setShowSettings(true)}><Settings size={19}/></IconButton>
        </nav>
        <div className="titleMeta"><span className="statusDot"/>{snapshot?.settings.ares_enabled === false ? 'YR schema' : 'YR + Ares schema'}</div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="panelTitle"><span>对象</span><button title="添加 Section"><Plus size={17}/></button></div>
          <label className="searchBox"><Search size={16}/><input value={unitSearch} onChange={e => setUnitSearch(e.target.value)} placeholder="搜索 Section、ID、类型"/></label>
          <div className="typeTabs scrollTabs">{objectCategories.map(category => <button key={category} className={activeObjectCategory === category ? 'active' : ''} onClick={() => setActiveObjectCategory(category)}>{category}</button>)}</div>
          <div className="treeList">
            {Array.from(new Set(visibleUnits.map(u => u.category))).map(category => {
              const list = visibleUnits.filter(u => u.category === category)
              return <section className="treeGroup" key={category}>
                <div className="treeGroupTitle"><ChevronDown size={15}/>{category}<span>{list.length}</span></div>
                {list.map(unit => <button key={unit.id} className={`treeItem ${selected.id === unit.id ? 'selected' : ''}`} onClick={() => void loadSection(unit)}>
                  <LegacyUnitIcon id={unit.id} size={38}/>
                  <span className="unitText"><b>{unit.label}</b><small>{unit.id}</small></span>
                  <ChevronRight className="treeChevron" size={15}/>
                </button>)}
              </section>
            })}
          </div>
          <div className="sideFooter"><button><Plus size={16}/> 添加 Section</button><button title="删除"><Trash2 size={16}/></button></div>
        </aside>

        <main className="editor">
          <section className="hero">
            <div className="heroGhost">{selected.id}</div>
            <div className="heroIcon"><LegacyUnitIcon id={selected.id} size={58}/></div>
            <div className="heroInfo"><div className="eyebrow">{selected.type} · {selected.id}</div><h1>{sectionData.description || selected.label || selected.id}</h1><p>{snapshot ? '正在编辑真实 Rules / Ares 参数；所有未知标签也会无损保留。' : '示例界面。点击顶部“打开”载入真实 rulesmd.ini。'}</p></div>
            <div className="heroActions"><button className="chip"><Pin size={15}/> 固定</button><button className="chip"><History size={15}/> 引用</button><button className="chip"><MoreHorizontal size={15}/></button></div>
          </section>

          <section className="editorControls">
            <label className="searchBox editorSearch"><Search size={16}/><input value={fieldSearch} onChange={e => setFieldSearch(e.target.value)} placeholder="搜索参数、中文说明或值"/></label>
            <div className="segmented">{groups.map(group => <button key={group} className={activeGroup === group ? 'active' : ''} onClick={() => setActiveGroup(group)}>{group}</button>)}</div>
            <button className="textButton" onClick={() => void openOptionPicker()}><Plus size={16}/> 参数</button>
          </section>

          <section className="fieldsPane">
            {groupedFields.length === 0 && <div className="emptyPane"><strong>当前 Section 没有可显示参数</strong><span>可点击“+ 参数”从内置 YR + Ares 参数库中添加。</span></div>}
            {groupedFields.map(([group, list]) => <div className="fieldGroup" key={group}>
              <button className="fieldGroupHeader" onClick={() => setCollapsed(v => ({...v,[group]:!v[group]}))}>
                {collapsed[group] ? <ChevronRight size={16}/> : <ChevronDown size={16}/>}<span>{group}</span><em>{list.length}</em>
              </button>
              {!collapsed[group] && list.map(option => <div className={`fieldRow ${selectedOption?.line_id === option.line_id ? 'focused' : ''}`} key={option.line_id} onClick={() => setSelectedOptionId(option.line_id)}>
                <div className="fieldLabel"><div><strong>{option.label || option.key}</strong>{option.source.toLowerCase() === 'ares' && <span className="aresBadge">ARES</span>}</div><small>{option.key}</small></div>
                <div className="fieldValueWrap" onClick={e => e.stopPropagation()}>
                  <FieldControl option={option} onChange={value => setValue(option, value)}/>
                  {/weapon|warhead|projectile|animation|reference/i.test(option.value_type) && <button className="jumpButton" title="跳转引用"><GitCompareArrows size={16}/></button>}
                  <button className="copyButton" title="复制值" onClick={() => void navigator.clipboard?.writeText(option.value)}><Copy size={15}/></button>
                </div>
                <div className="fieldState">{changed.has(option.line_id) ? <span className="changed">已修改</span> : <span>{option.source === 'Ares' ? '扩展' : '当前值'}</span>}</div>
              </div>)}
            </div>)}
          </section>
        </main>

        <aside className="inspector">
          <div className="inspectorTabs"><button className={!showRaw ? 'active' : ''} onClick={() => setShowRaw(false)}><CircleHelp size={16}/> 帮助</button><button className={showRaw ? 'active' : ''} onClick={() => setShowRaw(true)}>{'{ }'} 原文</button></div>
          {!showRaw ? <div className="helpContent">
            {selectedOption ? <>
              <div className="helpHeader"><WandSparkles size={19}/><div><small>当前参数</small><strong>{selectedOption.key}</strong></div></div>
              <span className={`docBadge ${selectedOption.source === 'Ares' ? 'ares' : ''}`}>{selectedOption.source === 'Ares' && <Sparkles size={13}/>} {selectedOption.source === 'Ares' ? 'Ares 扩展' : 'Yuri 原版'}</span>
              <h3>{selectedOption.label || selectedOption.key}</h3>
              <p>{selectedOption.description || '此参数暂时没有内置中文说明；编辑器仍会无损保留它。'}</p>
              <div className="infoCard"><span>类型</span><b>{selectedOption.value_type || 'text'}</b><span>当前值</span><b className="valueText">{selectedOption.value || '—'}</b><span>来源</span><b>{selectedOption.source}</b></div>
              {selectedOption.docs && <button className="docLink">查看内置文档索引 <ChevronRight size={16}/></button>}
            </> : <div className="emptyHelp">选择一个参数查看中文说明。</div>}
            <div className="helpDivider"/>
            <h4>引用关系</h4>
            <div className="relation"><div className="relationIcon">S</div><div><strong>{selected.id}</strong><span>{sectionData.description || selected.type}</span></div></div>
            {sectionData.references.slice(0,5).map(reference => <React.Fragment key={`${reference.section}.${reference.key}`}><div className="relationLine"/><div className="relation"><div className="relationIcon weapon">R</div><div><strong>{reference.section}</strong><span>{reference.key}</span></div></div></React.Fragment>)}
          </div> : <pre className="rawView">{sectionData.raw}</pre>}
        </aside>
      </div>

      <footer className="statusbar"><span>{status}</span><div><span>{snapshot?.document.encoding ?? 'UTF-8'}</span><span>{snapshot?.document.newline ?? 'CRLF'}</span><span>{sectionData.options.length} 参数</span><span className="aresStatus"><Sparkles size={13}/> {snapshot?.settings.ares_enabled === false ? 'Ares 辅助关闭' : 'Ares'}</span></div></footer>

      {showPicker && <div className="modalBackdrop" onMouseDown={() => setShowPicker(false)}><div className="modal parameterPicker" onMouseDown={e => e.stopPropagation()}>
        <div className="modalHeader"><div><strong>添加参数</strong><span>YR 与 Ares 作为同一参数库提供；Ares 仅以来源徽标区分。</span></div><button onClick={() => setShowPicker(false)}><X size={18}/></button></div>
        <label className="searchBox modalSearch"><Search size={16}/><input autoFocus value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)} placeholder="搜索中文名、标签或说明"/></label>
        <div className="catalogList">{filteredCatalog.slice(0,250).map(option => <button key={option.key} className="catalogItem" onClick={() => void addOption(option)}>
          <div><strong>{option.label || option.key}</strong>{option.source === 'Ares' && <span className="aresBadge">ARES</span>}<small>{option.key}</small></div>
          <p>{option.description || '暂无中文说明'}</p><span className="catalogCategory">{displayGroup(option.category)}</span>
        </button>)}</div>
      </div></div>}

      {showSettings && <div className="modalBackdrop" onMouseDown={() => setShowSettings(false)}><div className="modal settingsModal" onMouseDown={e => e.stopPropagation()}>
        <div className="modalHeader"><div><strong>设置</strong><span>编辑器辅助功能，不影响 INI 的宽容解析。</span></div><button onClick={() => setShowSettings(false)}><X size={18}/></button></div>
        <div className="settingRow"><div><strong>Ares 支持</strong><span>开启后在同一个参数库中提供 Ares 中文说明和可插入标签。关闭后不再推荐，但手写/已有 Ares 标签仍可正常编辑保存。</span></div><button className={`legacySwitch ${(snapshot?.settings.ares_enabled ?? true) ? 'on' : 'off'}`} onClick={() => void toggleAres(!(snapshot?.settings.ares_enabled ?? true))}><span className="switchKnob">{(snapshot?.settings.ares_enabled ?? true) ? 'ON 开' : 'OFF 关'}</span></button></div>
      </div></div>}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
