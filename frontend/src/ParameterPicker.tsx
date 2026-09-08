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

type ManualParameter = {
  active: boolean
  key: string
  hasEquals: boolean
  value: string
}

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

function parseManualParameter(raw: string): ManualParameter {
  const text = raw.trim()
  if (!text) return { active: false, key: '', hasEquals: false, value: '' }
  const equals = text.indexOf('=')
  const key = (equals >= 0 ? text.slice(0, equals) : text).trim()
  return {
    active: Boolean(key),
    key,
    hasEquals: equals >= 0,
    value: equals >= 0 ? text.slice(equals + 1).trim() : '',
  }
}

export function ParameterPicker({ open, options, objectLabel, onClose, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [manualEntry, setManualEntry] = useState('')
  const [filterEnabled, setFilterEnabled] = useState(true)
  const [expanded, setExpanded] = useState<Record<SourceName, boolean>>({ YR: true, Ares: true })
  const [activeSource, setActiveSource] = useState<SourceName | null>(null)
  const [activeCategory, setActiveCategory] = useState('')
  const [selectedKey, setSelectedKey] = useState('')

  const manual = useMemo(() => parseManualParameter(manualEntry), [manualEntry])
  const manualMatch = useMemo(() => {
    if (!manual.active) return null
    const normalized = manual.key.toLowerCase()
    return options.find(option => option.key.trim().toLowerCase() === normalized) ?? null
  }, [manual, options])

  const available = useMemo(() => filterEnabled ? options.filter(option => option.compatible !== false) : options, [filterEnabled, options])

  const filtered = useMemo(() => {
    if (manual.active) {
      if (!manualMatch) return []
      if (filterEnabled && manualMatch.compatible === false) return []
      return [manualMatch]
    }
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter(option => `${option.label} ${option.key} ${option.description} ${option.category}`.toLowerCase().includes(q))
  }, [available, filterEnabled, manual.active, manualMatch, query])

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
    if (query.trim() || manual.active) return filtered
    if (!activeSource) return []
    if (!activeCategory) return [...tree[activeSource].values()].flat()
    return tree[activeSource].get(activeCategory) ?? []
  }, [activeSource, activeCategory, filtered, manual.active, query, tree])

  const selected = useMemo(() => {
    if (manual.active) return list.find(option => option.key === selectedKey) ?? list[0] ?? null
    return available.find(option => option.key === selectedKey) ?? list[0] ?? null
  }, [available, list, manual.active, selectedKey])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setManualEntry('')
    setFilterEnabled(true)
  }, [open])

  useEffect(() => {
    if (!open || manual.active) return
    const firstSource: SourceName = available.some(option => sourceName(option) === 'YR') ? 'YR' : 'Ares'
    const firstCategory = [...new Set(available.filter(option => sourceName(option) === firstSource).map(categoryName))][0] ?? ''
    setActiveSource(firstSource)
    setActiveCategory(firstCategory)
    const first = available.find(option => sourceName(option) === firstSource && categoryName(option) === firstCategory) ?? available[0]
    setSelectedKey(first?.key ?? '')
  }, [available, manual.active, open])

  function chooseCategory(source: SourceName, category: string) {
    setQuery('')
    setManualEntry('')
    setActiveSource(source)
    setActiveCategory(category)
    setSelectedKey(tree[source].get(category)?.[0]?.key ?? '')
  }

  function changeSearch(value: string) {
    setManualEntry('')
    setQuery(value)
  }

  function changeManualEntry(value: string) {
    setManualEntry(value)
    setQuery('')
    const parsed = parseManualParameter(value)
    if (!parsed.active) return
    const match = options.find(option => option.key.trim().toLowerCase() === parsed.key.toLowerCase()) ?? null
    if (!match) {
      setSelectedKey('')
      return
    }
    if (match.compatible === false && filterEnabled) setFilterEnabled(false)
    const source = sourceName(match)
    setExpanded(current => ({ ...current, [source]: true }))
    setActiveSource(source)
    setActiveCategory(categoryName(match))
    setSelectedKey(match.key)
  }

  function chooseOption(option: CatalogOption) {
    setSelectedKey(option.key)
    setQuery('')
    setManualEntry(`${option.key}=${option.default || ''}`)
    const source = sourceName(option)
    setExpanded(current => ({ ...current, [source]: true }))
    setActiveSource(source)
    setActiveCategory(categoryName(option))
  }

  function addSelected() {
    if (!selected) return
    const manualTargetsSelected = manualMatch?.key.toLowerCase() === selected.key.toLowerCase()
    if (manualTargetsSelected && manual.hasEquals) {
      void onAdd({ ...selected, default: manual.value })
      return
    }
    void onAdd(selected)
  }

  const manualMissing = manual.active && !manualMatch
  const manualHint = manualMissing
    ? `未找到参数 Key：${manual.key}`
    : manual.active && manualMatch
      ? `${manualMatch.label || manualMatch.key} · ${manualMatch.key}`
      : `可直接粘贴 Key=Value${objectLabel ? ` 到 ${objectLabel}` : ''}`

  return <Dialog open={open} title="添加参数" icon={<ListPlus size={18}/>} size="wide" onClose={onClose}>
    <div className="parameterExplorer">
      <div className="parameterExplorerToolbar">
        <label className="parameterExplorerSearch"><Search size={17}/><input autoFocus value={query} onChange={event => changeSearch(event.target.value)} placeholder="搜索用途、中文名称或 Key"/></label>
        <div className="parameterFilterToggle"><span>只看能用</span><BoolSwitch value={filterEnabled ? 'yes' : 'no'} onChange={value => setFilterEnabled(value === 'yes')}/></div>
      </div>

      <div className="parameterExplorerGrid">
        <aside className="parameterTree" aria-label="参数分类">
          {(['YR', 'Ares'] as SourceName[]).map(source => {
            const categories = [...tree[source].entries()]
            const count = categories.reduce((sum, [, rows]) => sum + rows.length, 0)
            if (!count) return null
            return <div className="parameterTreeSource" key={source}>
              <button className={`parameterSourceRow ${activeSource === source && !activeCategory && !query && !manual.active ? 'active' : ''}`} onClick={() => { setManualEntry(''); setQuery(''); setExpanded(value => ({ ...value, [source]: !value[source] })); setActiveSource(source); setActiveCategory('') }}>
                {expanded[source] ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}<span>{sourceLabel(source)}</span>{source === 'Ares' && <Sparkles size={13}/>}<em>{count}</em>
              </button>
              {expanded[source] && <div className="parameterTreeChildren">
                {categories.map(([category, rows]) => <button key={category} className={activeSource === source && activeCategory === category && !query && !manual.active ? 'active' : ''} onClick={() => chooseCategory(source, category)}><span>{category}</span><em>{rows.length}</em></button>)}
              </div>}
            </div>
          })}
          {filtered.length === 0 && <div className="parameterTreeEmpty">无结果</div>}
        </aside>

        <section className="parameterListPane">
          <header><div><strong>{manual.active ? '参数匹配' : query ? '搜索结果' : activeCategory || (activeSource ? sourceLabel(activeSource) : '参数')}</strong><span>{list.length} 项</span></div></header>
          <div className="parameterList">
            {list.map(option => <button key={option.key} className={selected?.key === option.key ? 'active' : ''} onClick={() => chooseOption(option)}>
              <div><strong>{option.label || option.key}</strong>{sourceName(option) === 'Ares' && <span className="parameterAresBadge">ARES</span>}</div>
              <code>{option.key}</code>
            </button>)}
            {list.length === 0 && <div className="parameterEmpty">{manualMissing ? `没有名为 ${manual.key} 的参数。` : '没有符合当前条件的参数。'}</div>}
          </div>
        </section>

        <aside className="parameterDetail">
          {selected ? <div className="parameterDetailScroll">
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
          </div> : <div className="parameterEmpty detail">{manualMissing ? '手动输入的 Key 没有匹配项。' : '从中间列表选择一个参数查看详细说明。'}</div>}
        </aside>
      </div>

      <footer className="parameterExplorerFooter">
        <div className={`parameterManualEntry ${manualMissing ? 'invalid' : manual.active ? 'matched' : ''}`}>
          <label><span>手动填写</span><input value={manualEntry} onChange={event => changeManualEntry(event.target.value)} placeholder="Option=Value" spellCheck={false}/></label>
          <small>{manualHint}</small>
        </div>
        <Button variant="accent" disabled={!selected} onClick={addSelected}><ListPlus size={16}/>添加此参数</Button>
      </footer>
    </div>
  </Dialog>
}
