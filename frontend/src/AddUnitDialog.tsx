import React, { useEffect, useMemo, useState } from 'react'
import { PackagePlus, Search } from 'lucide-react'
import { Button, Checkbox, Dialog, Select, TextField } from 'terry-react-ui-library'
import { workspaceApi, type CreateUnitResult, type SectionData, type SectionOption } from './backend'
import { localizedReferenceLabel } from './referenceLabels'

export type UnitTemplateRow = {
  id: string
  label: string
  category: string
}

type Props = {
  open: boolean
  rows: UnitTemplateRow[]
  initialCategory?: string
  onClose: () => void
  onCreated: (result: CreateUnitResult) => void | Promise<void>
}

const UNIT_CATEGORIES = ['步兵', '载具', '飞机', '建筑', '超级武器'] as const
const CATEGORY_ROOT: Record<string, string> = {
  步兵: 'InfantryTypes',
  载具: 'VehicleTypes',
  飞机: 'AircraftTypes',
  建筑: 'BuildingTypes',
  超级武器: 'SuperWeaponTypes',
}

function normalizedCategory(value: string) {
  return value === '战车' ? '载具' : value
}

function validSectionName(value: string) {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(value.trim())
}

function valueKind(option: SectionOption) {
  const key = option.key.toLowerCase()
  const type = option.value_type.toLowerCase()
  if (/(?:sound|voice|audio)/i.test(key) || option.category.includes('声音')) return 'audio'
  if (type === 'weapon' || ['primary', 'secondary', 'eliteprimary', 'elitesecondary', 'occupyweapon', 'eliteoccupyweapon', 'deathweapon'].includes(key)) return 'weapon'
  if (type === 'warhead' || key.includes('warhead')) return 'warhead'
  if (type === 'projectile' || key.includes('projectile')) return 'projectile'
  if (key === 'debristypes') return 'debris'
  return 'generic'
}

function displayTemplateValue(option: SectionOption, rowsById: Map<string, UnitTemplateRow>) {
  const raw = option.value.trim()
  if (!raw) return '空值'

  const explicit = new Map(option.values.map(item => [item.value.toLowerCase(), item.label.trim() || item.value]))
  return raw.split(',').map(part => {
    const token = part.trim()
    if (!token) return token

    const enumLabel = explicit.get(token.toLowerCase())
    if (enumLabel && enumLabel.toLowerCase() !== token.toLowerCase()) return enumLabel

    const row = rowsById.get(token.toLowerCase())
    if (row?.label && row.label.toLowerCase() !== token.toLowerCase()) return row.label

    return localizedReferenceLabel(token, valueKind(option)) || token
  }).join('、')
}

export function AddUnitDialog({ open, rows, initialCategory, onClose, onCreated }: Props) {
  const eligibleRows = useMemo(() => rows
    .map(row => ({ ...row, category: normalizedCategory(row.category) }))
    .filter(row => UNIT_CATEGORIES.includes(row.category as typeof UNIT_CATEGORIES[number])), [rows])

  const rowsById = useMemo(() => new Map(rows.map(row => [row.id.toLowerCase(), row])), [rows])
  const categories = useMemo(() => UNIT_CATEGORIES.filter(category => eligibleRows.some(row => row.category === category)), [eligibleRows])
  const [category, setCategory] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [templateData, setTemplateData] = useState<SectionData | null>(null)
  const [sectionName, setSectionName] = useState('')
  const [comment, setComment] = useState('')
  const [parameterQuery, setParameterQuery] = useState('')
  const [selectedLines, setSelectedLines] = useState<Record<number, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const categoryRows = useMemo(() => eligibleRows.filter(row => row.category === category), [category, eligibleRows])
  const selectableOptions = useMemo(() => (templateData?.options ?? []).filter(option => !['name', 'uiname'].includes(option.key.toLowerCase())), [templateData])
  const displayedValues = useMemo(() => new Map(selectableOptions.map(option => [option.line_id, displayTemplateValue(option, rowsById)])), [rowsById, selectableOptions])
  const visibleOptions = useMemo(() => {
    const q = parameterQuery.trim().toLowerCase()
    if (!q) return selectableOptions
    return selectableOptions.filter(option => {
      const display = displayedValues.get(option.line_id) ?? option.value
      return `${option.key} ${option.label} ${option.value} ${display}`.toLowerCase().includes(q)
    })
  }, [displayedValues, parameterQuery, selectableOptions])
  const selectedCount = useMemo(() => selectableOptions.reduce((count, option) => count + (selectedLines[option.line_id] ? 1 : 0), 0), [selectableOptions, selectedLines])

  useEffect(() => {
    if (!open) return
    const preferred = normalizedCategory(initialCategory || '')
    const nextCategory = categories.includes(preferred as typeof UNIT_CATEGORIES[number]) ? preferred : (categories[0] ?? '')
    setCategory(nextCategory)
    setSectionName('')
    setComment('')
    setParameterQuery('')
    setError('')
  }, [categories, initialCategory, open])

  useEffect(() => {
    if (!open) return
    const first = categoryRows[0]?.id ?? ''
    setTemplateId(current => categoryRows.some(row => row.id === current) ? current : first)
  }, [categoryRows, open])

  useEffect(() => {
    if (!open || !templateId) {
      setTemplateData(null)
      setSelectedLines({})
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    void workspaceApi.section(templateId).then(data => {
      if (cancelled) return
      setTemplateData(data)
      setSelectedLines(Object.fromEntries(
        data.options
          .filter(option => !['name', 'uiname'].includes(option.key.toLowerCase()))
          .map(option => [option.line_id, true]),
      ))
    }).catch(err => {
      if (!cancelled) setError(`读取模板失败：${String(err)}`)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [open, templateId])

  function selectAll() {
    setSelectedLines(Object.fromEntries(selectableOptions.map(option => [option.line_id, true])))
  }

  function invertSelection() {
    setSelectedLines(current => Object.fromEntries(selectableOptions.map(option => [option.line_id, !current[option.line_id]])))
  }

  function toggleLine(lineId: number) {
    setSelectedLines(current => ({ ...current, [lineId]: !current[lineId] }))
  }

  async function createUnit() {
    const cleanSection = sectionName.trim()
    const cleanComment = comment.trim()
    if (!validSectionName(cleanSection)) {
      setError('注册名只能使用英文字母、数字和下划线，并且必须以字母开头。')
      return
    }
    if (!cleanComment) {
      setError('必须填写注释（Name）。它也是自定义单位没有内置名称资料时的显示名称。')
      return
    }
    if (!templateData || !templateId) {
      setError('请先选择一个有效模板。')
      return
    }

    setCreating(true)
    setError('')
    try {
      const result = await workspaceApi.createUnit({
        template: templateId,
        section: cleanSection,
        comment: cleanComment,
        included_line_ids: selectableOptions.filter(option => selectedLines[option.line_id]).map(option => option.line_id),
      })
      await onCreated(result)
    } catch (err) {
      setError(`添加单位失败：${String(err)}`)
    } finally {
      setCreating(false)
    }
  }

  const categoryOptions = categories.map(value => ({ value, label: value }))
  const templateOptions = categoryRows.map(row => ({ value: row.id, label: `${row.label} · ${row.id}` }))
  const selectedTemplate = categoryRows.find(row => row.id === templateId)

  return <Dialog open={open} title="添加新单位" icon={<PackagePlus size={18}/>} size="wide" onClose={onClose}>
    <div className="addUnitDialog">
      <div className="addUnitSetup">
        <label><span>单位类型</span><Select value={category} options={categoryOptions} onChange={setCategory}/></label>
        <label><span>现有单位模板</span><Select value={templateId} options={templateOptions} onChange={setTemplateId} searchable searchPlaceholder="搜索中文名或 Section"/></label>
        <label><span>新单位 Section</span><TextField value={sectionName} onChange={setSectionName} placeholder="例如 MYTANK"/></label>
        <label><span>注释 / Name <b>必填</b></span><TextField value={comment} onChange={setComment} placeholder="例如 我的测试坦克"/></label>
      </div>

      <div className="addUnitRegistrationHint">
        <strong>注册 ID 自动分配</strong>
        <span>创建时会自动写入 [{CATEGORY_ROOT[category] || 'Types'}] 的下一个数字 ID；Name 使用上方必填注释，UIName 自动指向新 Section。下方参数只决定是否从模板继承，不在此窗口修改参数值。</span>
      </div>

      <div className="addUnitParameterToolbar">
        <div className="addUnitTemplateMeta"><strong>继承模板参数</strong><span>{selectedTemplate ? `${selectedTemplate.label} [${selectedTemplate.id}]` : '未选择模板'}</span><em>已选 {selectedCount}/{selectableOptions.length}</em></div>
        <div className="addUnitParameterTools">
          <button type="button" onClick={selectAll} disabled={!selectableOptions.length}>全选</button>
          <button type="button" onClick={invertSelection} disabled={!selectableOptions.length}>反选</button>
          <label><Search size={15}/><input value={parameterQuery} onChange={event => setParameterQuery(event.target.value)} placeholder="搜索参数"/></label>
        </div>
      </div>

      <div className="addUnitParameterTable parameterTablePane">
        <div className="addUnitParameterHeader parameterTableHeader"><span>Key</span><span>参数名</span><span>值</span><span>使用</span></div>
        <div className="addUnitParameterRows">
          {loading && <div className="addUnitEmpty">正在读取模板参数…</div>}
          {!loading && visibleOptions.map(option => {
            const display = displayedValues.get(option.line_id) ?? option.value || '空值'
            const checked = Boolean(selectedLines[option.line_id])
            return <div className={`addUnitParameterRow parameterTableRow ${checked ? 'selected' : 'excluded'}`} key={option.line_id}>
              <div className="parameterKeyCell"><code title={option.key}>{option.key}</code>{option.source.toLowerCase() === 'ares' && <span className="aresBadge">ARES</span>}</div>
              <div className="parameterLabelCell"><strong title={option.label || option.key}>{option.label || option.key}</strong></div>
              <div className="parameterValueCell addUnitReadOnlyValue"><div className="rulesControlHost"><TextField value={display} onChange={() => {}} disabled/></div></div>
              <div className="addUnitParameterUse">
                <Checkbox checked={checked} onChange={() => toggleLine(option.line_id)} title={checked ? '创建时继承此参数' : '创建时不写入此参数'} ariaLabel={`${checked ? '取消继承' : '继承'} ${option.key}`}/>
              </div>
            </div>
          })}
          {!loading && !visibleOptions.length && <div className="addUnitEmpty">没有匹配的模板参数。</div>}
        </div>
      </div>

      {error && <div className="addUnitError">{error}</div>}
      <footer className="addUnitActions">
        <span>未勾选的模板参数不会写入新单位；创建后可在主编辑器继续添加或修改参数。</span>
        <div><Button onClick={onClose}>取消</Button><Button variant="accent" disabled={creating || loading || !templateId || !validSectionName(sectionName) || !comment.trim()} onClick={() => void createUnit()}><PackagePlus size={16}/>{creating ? '正在创建…' : '创建单位'}</Button></div>
      </footer>
    </div>
  </Dialog>
}
