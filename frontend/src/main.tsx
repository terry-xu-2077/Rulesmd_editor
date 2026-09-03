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
  Redo2,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  WandSparkles,
} from 'lucide-react'
import './styles.css'

type FieldKind = 'number' | 'boolean' | 'text' | 'reference' | 'ares'

type Field = {
  key: string
  label: string
  value: string
  kind: FieldKind
  group: string
  changed?: boolean
  source?: 'YR' | 'Ares'
}

type Unit = {
  id: string
  label: string
  type: string
  side: 'allied' | 'soviet' | 'yuri' | 'neutral'
}

const units: Unit[] = [
  { id: 'GHOST', label: '海豹部队', type: '步兵', side: 'allied' },
  { id: 'SNIPE', label: '狙击手', type: '步兵', side: 'allied' },
  { id: 'E1', label: '美国大兵', type: '步兵', side: 'allied' },
  { id: 'HTNK', label: '犀牛坦克', type: '载具', side: 'soviet' },
  { id: 'MTNK', label: '灰熊坦克', type: '载具', side: 'allied' },
  { id: 'YTNK', label: '盖特坦克', type: '载具', side: 'yuri' },
  { id: 'GAPOWR', label: '盟军发电厂', type: '建筑', side: 'allied' },
  { id: 'NARADR', label: '苏军雷达', type: '建筑', side: 'soviet' },
]

const initialFields: Field[] = [
  { key: 'UIName', label: '显示名称', value: 'Name:GHOST', kind: 'text', group: '基础', source: 'YR' },
  { key: 'Name', label: '内部名称', value: 'SEAL', kind: 'text', group: '基础', source: 'YR' },
  { key: 'Category', label: '单位类别', value: 'Soldier', kind: 'text', group: '基础', source: 'YR' },
  { key: 'Primary', label: '主武器', value: 'MP5', kind: 'reference', group: '武器', source: 'YR' },
  { key: 'ElitePrimary', label: '精英主武器', value: 'MP5E', kind: 'reference', group: '武器', source: 'YR' },
  { key: 'Strength', label: '生命值', value: '125', kind: 'number', group: '属性', source: 'YR' },
  { key: 'Armor', label: '装甲类型', value: 'none', kind: 'text', group: '属性', source: 'YR' },
  { key: 'Speed', label: '移动速度', value: '5', kind: 'number', group: '移动', source: 'YR' },
  { key: 'Sight', label: '视野', value: '8', kind: 'number', group: '属性', source: 'YR' },
  { key: 'Owner', label: '所属阵营', value: 'British,French,Germans,Americans,Alliance', kind: 'text', group: '阵营', source: 'YR' },
  { key: 'Cost', label: '价格', value: '1000', kind: 'number', group: '经济', source: 'YR' },
  { key: 'Trainable', label: '可升级', value: 'yes', kind: 'boolean', group: '基础', source: 'YR' },
  { key: 'Cloakable', label: '可隐形', value: 'yes', kind: 'boolean', group: '特殊', source: 'YR' },
  { key: 'AttachEffect.Duration', label: '附加效果持续时间', value: '90', kind: 'ares', group: 'Ares', source: 'Ares' },
  { key: 'AttachEffect.Animation', label: '附加效果动画', value: 'AE_GLOW', kind: 'ares', group: 'Ares', source: 'Ares' },
]

const groups = ['全部', '基础', '阵营', '武器', '属性', '移动', '经济', '特殊', 'Ares']

function IconButton({ title, children, primary = false }: { title: string; children: React.ReactNode; primary?: boolean }) {
  return <button className={`iconButton ${primary ? 'primary' : ''}`} title={title}>{children}</button>
}

function App() {
  const [selected, setSelected] = useState(units[0])
  const [fields, setFields] = useState(initialFields)
  const [unitSearch, setUnitSearch] = useState('')
  const [fieldSearch, setFieldSearch] = useState('')
  const [activeGroup, setActiveGroup] = useState('全部')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showRaw, setShowRaw] = useState(false)
  const [status, setStatus] = useState('rulesmd.ini · 已连接到工作区')

  const visibleUnits = useMemo(() => units.filter(u => `${u.label} ${u.id} ${u.type}`.toLowerCase().includes(unitSearch.toLowerCase())), [unitSearch])
  const visibleFields = useMemo(() => fields.filter(f => {
    const groupOk = activeGroup === '全部' || f.group === activeGroup
    const searchOk = `${f.key} ${f.label} ${f.value}`.toLowerCase().includes(fieldSearch.toLowerCase())
    return groupOk && searchOk
  }), [fields, activeGroup, fieldSearch])

  const groupedFields = useMemo(() => {
    const result = new Map<string, Field[]>()
    for (const field of visibleFields) {
      if (!result.has(field.group)) result.set(field.group, [])
      result.get(field.group)!.push(field)
    }
    return [...result.entries()]
  }, [visibleFields])

  const setValue = (key: string, value: string) => {
    setFields(current => current.map(field => field.key === key ? { ...field, value, changed: true } : field))
    setStatus(`已修改 ${selected.id}.${key}`)
  }

  return (
    <div className={`app side-${selected.side}`}>
      <header className="titlebar">
        <div className="brand"><div className="brandMark">R</div><div><strong>Rulesmd Editor</strong><span>Yuri's Revenge · Ares</span></div></div>
        <nav className="toolbar">
          <IconButton title="新建"><FilePlus2 size={18}/></IconButton>
          <IconButton title="打开"><FolderOpen size={18}/></IconButton>
          <IconButton title="保存" primary><Save size={18}/></IconButton>
          <span className="divider"/>
          <IconButton title="撤销"><Undo2 size={18}/></IconButton>
          <IconButton title="重做"><Redo2 size={18}/></IconButton>
          <span className="divider"/>
          <IconButton title="检查原版 INI"><ShieldCheck size={18}/></IconButton>
          <IconButton title="启动游戏"><Gamepad2 size={18}/></IconButton>
          <IconButton title="设置"><Settings size={18}/></IconButton>
        </nav>
        <div className="titleMeta"><span className="statusDot"/>Ares 3.x schema</div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="panelTitle"><span>对象</span><button><Plus size={16}/></button></div>
          <label className="searchBox"><Search size={15}/><input value={unitSearch} onChange={e => setUnitSearch(e.target.value)} placeholder="搜索单位、ID、类型"/></label>
          <div className="typeTabs"><button className="active">全部</button><button>单位</button><button>武器</button><button>弹头</button></div>
          <div className="treeList">
            {['步兵','载具','建筑'].map(type => {
              const list = visibleUnits.filter(u => u.type === type)
              if (!list.length) return null
              return <section className="treeGroup" key={type}>
                <div className="treeGroupTitle"><ChevronDown size={14}/>{type}<span>{list.length}</span></div>
                {list.map(unit => <button key={unit.id} className={`treeItem ${selected.id === unit.id ? 'selected' : ''}`} onClick={() => setSelected(unit)}>
                  <div className={`unitIcon side-${unit.side}`}><Box size={15}/></div>
                  <span className="unitText"><b>{unit.label}</b><small>{unit.id}</small></span>
                  <ChevronRight className="treeChevron" size={14}/>
                </button>)}
              </section>
            })}
          </div>
          <div className="sideFooter"><button><Plus size={15}/> 添加 Section</button><button><Trash2 size={15}/></button></div>
        </aside>

        <main className="editor">
          <section className="hero">
            <div className="heroGhost">{selected.id}</div>
            <div className="heroIcon"><Box size={28}/></div>
            <div className="heroInfo"><div className="eyebrow">{selected.type} · {selected.id}</div><h1>{selected.label}</h1><p>编辑 Rules / Ares 参数，修改只作用于当前 Section。</p></div>
            <div className="heroActions"><button className="chip"><Pin size={14}/> 固定</button><button className="chip"><History size={14}/> 引用</button><button className="chip"><MoreHorizontal size={14}/></button></div>
          </section>

          <section className="editorControls">
            <label className="searchBox grow"><Search size={15}/><input value={fieldSearch} onChange={e => setFieldSearch(e.target.value)} placeholder="搜索参数、中文说明或值"/></label>
            <div className="segmented">{groups.map(g => <button key={g} className={activeGroup === g ? 'active' : ''} onClick={() => setActiveGroup(g)}>{g}{g === 'Ares' && <Sparkles size={12}/>}</button>)}</div>
            <button className="textButton"><Plus size={15}/> 参数</button>
          </section>

          <section className="fieldsPane">
            {groupedFields.map(([group, list]) => <div className="fieldGroup" key={group}>
              <button className="fieldGroupHeader" onClick={() => setCollapsed(v => ({...v,[group]:!v[group]}))}>
                {collapsed[group] ? <ChevronRight size={15}/> : <ChevronDown size={15}/>}<span>{group}</span><em>{list.length}</em>
              </button>
              {!collapsed[group] && list.map(field => <div className={`fieldRow kind-${field.kind}`} key={field.key}>
                <div className="fieldLabel"><div><strong>{field.label}</strong>{field.source === 'Ares' && <span className="aresBadge">ARES</span>}</div><small>{field.key}</small></div>
                <div className="fieldValueWrap">
                  <input className="fieldValue" value={field.value} onChange={e => setValue(field.key, e.target.value)}/>
                  {field.kind === 'reference' && <button className="jumpButton"><GitCompareArrows size={15}/></button>}
                  <button className="copyButton"><Copy size={14}/></button>
                </div>
                <div className="fieldState">{field.changed ? <span className="changed">已修改</span> : <span>继承值</span>}</div>
              </div>)}
            </div>)}
          </section>
        </main>

        <aside className="inspector">
          <div className="inspectorTabs"><button className={!showRaw ? 'active' : ''} onClick={() => setShowRaw(false)}><CircleHelp size={15}/> 帮助</button><button className={showRaw ? 'active' : ''} onClick={() => setShowRaw(true)}>{'{ }'} 原文</button></div>
          {!showRaw ? <div className="helpContent">
            <div className="helpHeader"><WandSparkles size={18}/><div><small>当前参数</small><strong>AttachEffect.Duration</strong></div></div>
            <span className="docBadge"><Sparkles size={12}/> Ares 扩展</span>
            <h3>附加效果持续时间</h3>
            <p>控制 AttachEffect 在目标对象上保持的时长。Ares 参数会在编辑器中明确标注，并与原版 Yuri's Revenge 参数区分。</p>
            <div className="infoCard"><span>类型</span><b>整数 / 帧</b><span>当前值</span><b className="numberText">90</b><span>来源</span><b>Ares Docs</b></div>
            <button className="docLink">打开完整文档 <ChevronRight size={15}/></button>
            <div className="helpDivider"/>
            <h4>引用关系</h4>
            <div className="relation"><div className="relationIcon">U</div><div><strong>{selected.id}</strong><span>{selected.label}</span></div></div>
            <div className="relationLine"/>
            <div className="relation"><div className="relationIcon weapon">W</div><div><strong>MP5</strong><span>主武器</span></div></div>
          </div> : <pre className="rawView">{`[${selected.id}]\nUIName=Name:${selected.id}\nName=${selected.label}\nPrimary=MP5\nStrength=125\nArmor=none\nSpeed=5\nOwner=British,French,Germans,Americans,Alliance\n\n; Ares\nAttachEffect.Duration=90\nAttachEffect.Animation=AE_GLOW`}</pre>}
        </aside>
      </div>

      <footer className="statusbar"><span>{status}</span><div><span>UTF-8</span><span>CRLF</span><span>15 参数</span><span className="aresStatus"><Sparkles size={12}/> Ares</span></div></footer>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
