import React, { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ListPlus, Search, Sparkles } from 'lucide-react'
import { BoolSwitch, Button, Dialog } from 'terry-react-ui-library'
import type { CatalogOption } from './backend'
import './parameter-picker.css'

type Props = {
  open: boolean
  options: CatalogOption[]
  objectLabel: string
  onClose: () => void
  onAdd: (option: CatalogOption) => void | Promise<void>
}

type SourceName = 'YR' | 'Ares'

function sourceName(option: CatalogOption): SourceName {
  return option.source.toLowerCase() === 'ares' ? 'Ares' : 'YR'
}

function categoryName(option: CatalogOption) {
  const value = option.category.trim()
  if (sourceName(option) === 'Ares') return value.replace(/^Ares\s*·\s*/i, '').trim() || '其他'
  return value || '其他'
}

function sourceLabel(source: SourceName) {
  return source === 'Ares' ? 'Ares 扩展' : 'Yuri 原版'
}

function valueTypeLabel(type: string) {
  const labels: Record<string, string> = {
    boolean: '布尔', enum: '单选', 'multi-select': '多选', integer: '整数', float: '小数', percent: '百分比',
    weapon: '武器引用', warhead: '弹头引用', projectile: '抛射体引用', animation: '动画引用', text: '文本',
  }
  return labels[type] || type || '文本'
}

export function ParameterPicker({ open, options, objectLabel, onClose, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [filterEnabled, setFilterEnabled] = useState(true)
  const [expanded, setExpanded] = useState<Record<SourceName, boolean>>({ YR: true, Ares: true })
  const [activeSource, setActiveSource] = useState<SourceName | null>(null)
  const [activeCategory, setActiveCategory] = useState('')
  const [selectedKey, setSelectedKey] = useState('')

  const available = useMemo(() => filterEnabled ? options.filter(option => option.compatible !== false) : options, [filterEnabled, options])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter(option => `${option.label} ${option.key} ${option.description} ${option.category}`.toLowerCase().includes(q))
  }, [available, query])

  const tree = useMemo(() => {
    const result: Record<SourceName, Map<string, CatalogOption[]>> = { YR: new Map(), Ares: new Map() }
    for (const option of filtered) {
      const source = sourceName(option)
      const category = categoryName(option)
      if (!result[source].has(category)) result[source].set(category, [])
      result[source].get(category)!.push(option)
    }
    return result
  }, [filtered])

  const list = useMemo(() => {
    if (query.trim()) return filtered
    if (!activeSource) return []
    if (!activeCategory) return [...tree[activeSource].values()].flat()
    return tree[activeSource].get(activeCategory) ?? []
  }, [activeSource, activeCategory, filtered, query, tree])

  const selected = useMemo(() => {
    return available.find(option => option.key === selectedKey) ?? list[0] ?? null
  }, [available, list, selectedKey])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setFilterEnabled(true)
  }, [open])

  useEffect(() => {
    if (!open) return
    const firstSource: SourceName = available.some(option => sourceName(option) === 'YR') ? 'YR' : 'Ares'
    const firstCategory = [...new Set(available.filter(option => sourceName(option) === firstSource).map(categoryName))][0] ?? ''
    setActiveSource(firstSource)
    setActiveCategory(firstCategory)
    const first = available.find(option => sourceName(option) === firstSource && categoryName(option) === firstCategory) ?? available[0]
    setSelectedKey(first?.key ?? '')
  }, [available, open])

  function chooseCategory(source: SourceName, category: string) {
    setQuery('')
    setActiveSource(source)
    setActiveCategory(category)
    setSelectedKey(tree[source].get(category)?.[0]?.key ?? '')
  }

  return <Dialog open={open} title="添加参数" icon={<ListPlus size={18}/>} size="wide" onClose={onClose}>
    <div className="parameterExplorer">
      <div className="parameterExplorerToolbar">
        <label className="parameterExplorerSearch"><Search size={17}/><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索用途、中文名称或 Key"/></label>
        <div className="parameterFilterToggle"><span>只看能用</span><BoolSwitch value={filterEnabled ? 'yes' : 'no'} onChange={value => setFilterEnabled(value === 'yes')}/></div>
      </div>

      <div className="parameterExplorerGrid">
        <aside className="parameterTree" aria-label="参数分类">
          {(['YR', 'Ares'] as SourceName[]).map(source => {
            const categories = [...tree[source].entries()]
            const count = categories.reduce((sum, [, rows]) => sum + rows.length, 0)
            if (!count) return null
            return <div className="parameterTreeSource" key={source}>
              <button className={`parameterSourceRow ${activeSource === source && !activeCategory && !query ? 'active' : ''}`} onClick={() => { setExpanded(value => ({ ...value, [source]: !value[source] })); setActiveSource(source); setActiveCategory('') }}>
                {expanded[source] ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>{sourceLabel(source)}</span>{source === 'Ares' && <Sparkles size={13}/>}<em>{count}</em>
              </button>
              {expanded[source] && <div className="parameterTreeChildren">
                {categories.map(([category, rows]) => <button key={category} className={activeSource === source && activeCategory === category && !query ? 'active' : ''} onClick={() => chooseCategory(source, category)}><span>{category}</span><em>{rows.length}</em></button>)}
              </div>}
            </div>
          })}
        </aside>

        <section className="parameterListPane">
          <header><div><strong>{query ? '搜索结果' : activeCategory || (activeSource ? sourceLabel(activeSource) : '参数')}</strong><span>{list.length} 项</span></div></header>
          <div className="parameterList">
            {list.map(option => <button key={option.key} className={selected?.key === option.key ? 'active' : ''} onClick={() => setSelectedKey(option.key)}>
              <div><strong>{option.label || option.key}</strong>{sourceName(option) === 'Ares' && <span className="parameterAresBadge">ARES</span>}</div>
              <code>{option.key}</code>
            </button>)}
            {list.length === 0 && <div className="parameterEmpty">没有符合当前条件的参数。</div>}
          </div>
        </section>

        <aside className="parameterDetail">
          {selected ? <>
            <div className="parameterDetailScroll">
              <div className="parameterDetailSource">{sourceName(selected) === 'Ares' && <Sparkles size={14}/>} {sourceLabel(sourceName(selected))}</div>
              <h2>{selected.label || selected.key}</h2>
              <code className="parameterDetailKey">{selected.key}</code>
              <p className="parameterDetailDescription">{selected.description || '暂无中文详细说明。'}</p>

              <dl className="parameterMeta">
                <div><dt>分类</dt><dd>{categoryName(selected)}</dd></div>
                <div><dt>值类型</dt><dd>{valueTypeLabel(selected.value_type)}</dd></div>
                <div><dt>默认值</dt><dd>{selected.default || '—'}</dd></div>
                <div><dt>适用对象</dt><dd>{selected.applies_to.length ? selected.applies_to.join('、') : '—'}</dd></div>
              </dl>

              {selected.values.length > 0 && <section className="parameterDetailSection"><h3>可选值</h3><div className="parameterChoiceList">{selected.values.map(item => <span key={item.value}><b>{item.label || item.value}</b><code>{item.value}</code></span>)}</div></section>}

              {selected.docs && <section className="parameterDetailSection"><h3>{sourceName(selected) === 'Ares' ? 'Ares 官方文档' : '资料来源'}</h3><code className="parameterDocs">{selected.docs}</code></section>}
            </div>
            <footer className="parameterDetailFooter"><Button variant="accent" onClick={() => void onAdd(selected)}><ListPlus size={16}/>添加此参数</Button></footer>
          </> : <div className="parameterEmpty detail">从中间列表选择一个参数查看详细说明。</div>}
        </aside>
      </div>
    </div>
  </Dialog>
}
