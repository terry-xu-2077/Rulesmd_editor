import React, { useEffect, useMemo, useState } from 'react'
import { PackagePlus, Search, Sparkles } from 'lucide-react'
import { Button, Checkbox, Dialog, Select, TextField } from 'terry-react-ui-library'
import { workspaceApi, type CreateUnitResult, type MapRuleCatalogItem, type SectionData, type SectionOption } from './backend'
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

const ARES_SUPERWEAPON_TYPES = new Set([
  'GenericWarhead', 'UnitDelivery', 'Firestorm', 'HunterSeeker', 'DropPod', 'EMPulse', 'Battery',
])

const SUPERWEAPON_TYPES = [
  { value: 'LightningStorm', label: '闪电风暴 · LightningStorm' },
  { value: 'MultiMissile', label: '核弹 / 多重导弹 · MultiMissile' },
  { value: 'PsychicDominator', label: '心灵支配仪 · PsychicDominator' },
  { value: 'ChronoSphere', label: '超时空传送 · ChronoSphere' },
  { value: 'ChronoWarp', label: '超时空传送后继 · ChronoWarp' },
  { value: 'IronCurtain', label: '铁幕 · IronCurtain' },
  { value: 'ForceShield', label: '力场护盾 · ForceShield' },
  { value: 'GeneticConverter', label: '基因突变 · GeneticConverter' },
  { value: 'ParaDrop', label: '伞兵 · ParaDrop' },
  { value: 'AmerParaDrop', label: '美国伞兵 · AmerParaDrop' },
  { value: 'SpyPlane', label: '侦察机 · SpyPlane' },
  { value: 'PsychicReveal', label: '心灵探测 · PsychicReveal' },
  { value: 'SonarPulse', label: '声呐脉冲 · SonarPulse' },
  { value: 'GenericWarhead', label: '🔓 通用弹头 · GenericWarhead · Ares' },
  { value: 'UnitDelivery', label: '🔓 单位投送 · UnitDelivery · Ares' },
  { value: 'Firestorm', label: '🔓 火风暴 · Firestorm · Ares' },
  { value: 'HunterSeeker', label: '🔓 猎杀搜寻 · HunterSeeker · Ares' },
  { value: 'DropPod', label: '🔓 空降舱 · DropPod · Ares' },
  { value: 'EMPulse', label: '🔓 EMP 脉冲 · EMPulse · Ares' },
  { value: 'Battery', label: '🔓 电池 / 充能 · Battery · Ares' },
]

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

function optionByKey(data: SectionData, key: string) {
  const folded = key.toLowerCase()
  return data.options.find(option => !option.disabled && option.key.toLowerCase() === folded)
}

function slotIsFree(option: SectionOption | undefined) {
  if (!option) return true
  const value = option.value.trim().toLowerCase()
  return !value || value === 'none'
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
  const [mapMode, setMapMode] = useState(false)
  const [mapCatalog, setMapCatalog] = useState<MapRuleCatalogItem[]>([])
  const [mapCategory, setMapCategory] = useState('')
  const [mapSection, setMapSection] = useState('')
  const [mapQuery, setMapQuery] = useState('')
  const [aresEnabled, setAresEnabled] = useState(true)
  const [superweaponType, setSuperweaponType] = useState('')
  const [providerBuilding, setProviderBuilding] = useState('')

  const isSuperweapon = category === '超级武器'
  const categoryRows = useMemo(() => eligibleRows.filter(row => row.category === category), [category, eligibleRows])
  const buildingRows = useMemo(() => rows.filter(row => normalizedCategory(row.category) === '建筑'), [rows])
  const selectableOptions = useMemo(() => (templateData?.options ?? []).filter(option => {
    const key = option.key.toLowerCase()
    if (['name', 'uiname'].includes(key)) return false
    if (isSuperweapon && key === 'type') return false
    return true
  }), [isSuperweapon, templateData])
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

  const mapCategories = useMemo(() => Array.from(new Set(mapCatalog.map(item => item.category))), [mapCatalog])
  const visibleMapRules = useMemo(() => {
    const q = mapQuery.trim().toLowerCase()
    return mapCatalog.filter(item => !item.present)
      .filter(item => !mapCategory || item.category === mapCategory)
      .filter(item => !q || `${item.section} ${item.label} ${item.category}`.toLowerCase().includes(q))
  }, [mapCatalog, mapCategory, mapQuery])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError('')
    setMapQuery('')
    void workspaceApi.snapshot().then(snapshot => {
      if (cancelled) return
      const isMap = snapshot.document.kind === 'map'
      setMapMode(isMap)
      setAresEnabled(snapshot.settings.ares_enabled)
      setMapCatalog(isMap ? snapshot.map_rule_catalog : [])
      if (isMap) {
        const available = snapshot.map_rule_catalog.filter(item => !item.present)
        const preferred = available.find(item => normalizedCategory(initialCategory || '') === normalizedCategory(item.category))
        const first = preferred ?? available[0]
        setMapCategory(first?.category ?? '')
        setMapSection(first?.section ?? '')
      }
    }).catch(err => {
      if (!cancelled) setError(`读取文档模式失败：${String(err)}`)
    })
    return () => { cancelled = true }
  }, [initialCategory, open])

  useEffect(() => {
    if (!mapMode || !open) return
    const first = visibleMapRules[0]?.section ?? ''
    setMapSection(current => visibleMapRules.some(item => item.section === current) ? current : first)
  }, [mapMode, open, visibleMapRules])

  useEffect(() => {
    if (!open || mapMode) return
    const preferred = normalizedCategory(initialCategory || '')
    const nextCategory = categories.includes(preferred as typeof UNIT_CATEGORIES[number]) ? preferred : (categories[0] ?? '')
    setCategory(nextCategory)
    setSectionName('')
    setComment('')
    setParameterQuery('')
    setSuperweaponType('')
    setProviderBuilding('')
    setError('')
  }, [categories, initialCategory, mapMode, open])

  useEffect(() => {
    if (!open || mapMode) return
    const first = categoryRows[0]?.id ?? ''
    setTemplateId(current => categoryRows.some(row => row.id === current) ? current : first)
  }, [categoryRows, mapMode, open])

  useEffect(() => {
    if (!open || mapMode || !templateId) {
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
      const templateType = data.options.find(option => option.key.toLowerCase() === 'type')?.value ?? ''
      if (category === '超级武器') setSuperweaponType(templateType)
      setSelectedLines(Object.fromEntries(
        data.options
          .filter(option => !['name', 'uiname', ...(category === '超级武器' ? ['type'] : [])].includes(option.key.toLowerCase()))
          .map(option => [option.line_id, category !== '超级武器']),
      ))
    }).catch(err => {
      if (!cancelled) setError(`读取模板失败：${String(err)}`)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [category, mapMode, open, templateId])

  function selectAll() {
    setSelectedLines(Object.fromEntries(selectableOptions.map(option => [option.line_id, true])))
  }

  function invertSelection() {
    setSelectedLines(current => Object.fromEntries(selectableOptions.map(option => [option.line_id, !current[option.line_id]])))
  }

  function toggleLine(lineId: number) {
    setSelectedLines(current => ({ ...current, [lineId]: !current[lineId] }))
  }

  async function addMapRule() {
    if (!mapSection) {
      setError('请选择要添加到地图的规则 Section。')
      return
    }
    setCreating(true)
    setError('')
    try {
      const result = await workspaceApi.createUnit({
        template: mapSection,
        section: mapSection,
        comment: '',
        included_line_ids: [],
      })
      await onCreated(result)
    } catch (err) {
      setError(`添加地图规则失败：${String(err)}`)
    } finally {
      setCreating(false)
    }
  }

  async function inspectProviderSlot() {
    if (!providerBuilding) return null
    const building = await workspaceApi.section(providerBuilding)
    const primary = optionByKey(building, 'SuperWeapon')
    const secondary = optionByKey(building, 'SuperWeapon2')
    if (slotIsFree(primary)) return { key: 'SuperWeapon', option: primary, current: '' }
    if (slotIsFree(secondary)) return { key: 'SuperWeapon2', option: secondary, current: '' }
    if (!aresEnabled) {
      throw new Error('该建筑的原版 SuperWeapon / SuperWeapon2 两个槽位都已占用。开启 Ares 支持后，编辑器才能使用 SuperWeapons= 追加更多超级武器。')
    }
    const additional = optionByKey(building, 'SuperWeapons')
    return { key: 'SuperWeapons', option: additional, current: additional?.value ?? '' }
  }

  async function attachSuperweapon(target: Awaited<ReturnType<typeof inspectProviderSlot>>, newSection: string) {
    if (!target || !providerBuilding) return
    if (target.key === 'SuperWeapons') {
      const tokens = target.current.split(',').map(value => value.trim()).filter(Boolean)
      if (!tokens.some(value => value.toLowerCase() === newSection.toLowerCase())) tokens.push(newSection)
      const value = tokens.join(',')
      if (target.option) await workspaceApi.setValue(target.option.line_id, value)
      else await workspaceApi.addOption(providerBuilding, target.key, value)
      return
    }
    if (target.option) await workspaceApi.setValue(target.option.line_id, newSection)
    else await workspaceApi.addOption(providerBuilding, target.key, newSection)
  }

  async function createUnit() {
    const cleanSection = sectionName.trim()
    const cleanComment = comment.trim()
    if (!validSectionName(cleanSection)) {
      setError('注册名只能使用英文字母、数字和下划线，并且必须以字母开头。')
      return
    }
    if (!cleanComment) {
      setError(isSuperweapon ? '必须填写超级武器名称 / 注释。' : '必须填写注释（Name）。它也是自定义单位没有内置名称资料时的显示名称。')
      return
    }
    if (!templateData || !templateId) {
      setError('请先选择一个有效模板。')
      return
    }
    if (isSuperweapon && !superweaponType) {
      setError('请选择超级武器 Type。')
      return
    }
    if (isSuperweapon && ARES_SUPERWEAPON_TYPES.has(superweaponType) && !aresEnabled) {
      setError(`${superweaponType} 是 Ares 新增的超级武器 Type；请先在设置中开启 Ares 支持。`)
      return
    }

    setCreating(true)
    setError('')
    try {
      const providerTarget = isSuperweapon ? await inspectProviderSlot() : null
      const result = await workspaceApi.createUnit({
        template: templateId,
        section: cleanSection,
        comment: cleanComment,
        included_line_ids: selectableOptions.filter(option => selectedLines[option.line_id]).map(option => option.line_id),
      })

      if (isSuperweapon) {
        await workspaceApi.addOption(cleanSection, 'Type', superweaponType)
        await attachSuperweapon(providerTarget, cleanSection)
        const [snapshot, section] = await Promise.all([
          workspaceApi.snapshot(),
          workspaceApi.section(cleanSection),
        ])
        await onCreated({ ...result, snapshot, section })
      } else {
        await onCreated(result)
      }
    } catch (err) {
      setError(`${isSuperweapon ? '添加超级武器' : '添加单位'}失败：${String(err)}`)
    } finally {
      setCreating(false)
    }
  }

  if (mapMode) {
    const categoryOptions = mapCategories.map(value => ({ value, label: value }))
    const ruleOptions = visibleMapRules.map(item => ({ value: item.section, label: `${item.label} · ${item.section}` }))
    const selectedRule = mapCatalog.find(item => item.section === mapSection)
    return <Dialog open={open} title="添加地图规则" icon={<PackagePlus size={18}/>} size="wide" onClose={onClose}>
      <div className="addUnitDialog mapRuleDialog">
        <div className="addUnitSetup mapRuleSetup">
          <label><span>规则类型</span><Select value={mapCategory} options={categoryOptions} onChange={setMapCategory}/></label>
          <label><span>规则 Section</span><Select value={mapSection} options={ruleOptions} onChange={setMapSection} searchable searchPlaceholder="搜索中文名或 Section"/></label>
          <label className="mapRuleSearch"><span>搜索目录</span><div className="mapRuleSearchBox"><Search size={15}/><input value={mapQuery} onChange={event => setMapQuery(event.target.value)} placeholder="例如 美国大兵、E1、武器、General"/></div></label>
        </div>
        <div className="addUnitRegistrationHint mapRuleHint">
          <strong>{selectedRule ? `${selectedRule.label} [${selectedRule.section}]` : '选择一个规则 Section'}</strong>
          <span>这里只在地图末尾创建对应 Section，不复制整段 rulesmd。创建后用主编辑器的“参数”按钮添加需要覆盖的 Key；地图里的地形、触发器、单位摆放与压缩数据不会被当作规则编辑。</span>
        </div>
        {error && <div className="addUnitError">{error}</div>}
        <footer className="addUnitActions">
          <span>列表只显示尚未嵌入此地图的规则；已有规则会直接出现在左侧对象树。</span>
          <div><Button onClick={onClose}>取消</Button><Button variant="accent" disabled={creating || !mapSection} onClick={() => void addMapRule()}><PackagePlus size={16}/>{creating ? '正在添加…' : '添加规则'}</Button></div>
        </footer>
      </div>
    </Dialog>
  }

  const categoryOptions = categories.map(value => ({ value, label: value }))
  const templateOptions = categoryRows.map(row => ({ value: row.id, label: `${row.label} · ${row.id}` }))
  const selectedTemplate = categoryRows.find(row => row.id === templateId)
  const providerOptions = [
    { value: '', label: '不自动挂载到建筑' },
    ...buildingRows.map(row => ({ value: row.id, label: `${row.label} · ${row.id}` })),
  ]

  return <Dialog open={open} title={isSuperweapon ? '新增超级武器' : '添加新单位'} icon={isSuperweapon ? <Sparkles size={18}/> : <PackagePlus size={18}/>} size="wide" onClose={onClose}>
    <div className="addUnitDialog">
      <div className="addUnitSetup">
        <label><span>单位类型</span><Select value={category} options={categoryOptions} onChange={setCategory}/></label>
        <label><span>{isSuperweapon ? '参考模板' : '现有单位模板'}</span><Select value={templateId} options={templateOptions} onChange={setTemplateId} searchable searchPlaceholder="搜索中文名或 Section"/></label>
        <label><span>{isSuperweapon ? '新超级武器 Section' : '新单位 Section'}</span><TextField value={sectionName} onChange={setSectionName} placeholder={isSuperweapon ? '例如 MY_SUPERWEAPON' : '例如 MYTANK'}/></label>
        <label><span>{isSuperweapon ? '名称 / 注释' : '注释 / Name'} <b>必填</b></span><TextField value={comment} onChange={setComment} placeholder={isSuperweapon ? '例如 我的轨道打击' : '例如 我的测试坦克'}/></label>
        {isSuperweapon && <label><span>超级武器 Type <b>必填</b></span><Select value={superweaponType} options={SUPERWEAPON_TYPES.filter(item => aresEnabled || !ARES_SUPERWEAPON_TYPES.has(item.value))} onChange={setSuperweaponType} searchable searchPlaceholder="搜索 Type"/></label>}
        {isSuperweapon && <label><span>提供该超武的建筑</span><Select value={providerBuilding} options={providerOptions} onChange={setProviderBuilding} searchable searchPlaceholder="搜索建筑"/></label>}
      </div>

      <div className="addUnitRegistrationHint">
        <strong>{isSuperweapon ? '超级武器注册与挂载自动处理' : '注册 ID 自动分配'}</strong>
        <span>{isSuperweapon
          ? `创建时自动写入 [SuperWeaponTypes]。若选择提供建筑，编辑器会依次使用 SuperWeapon、SuperWeapon2；两个原版槽位都已占用时${aresEnabled ? '自动改用 Ares 的 SuperWeapons= 追加，不覆盖已有超武。' : '会停止创建并提示开启 Ares，不会覆盖已有超武。'} Type= / Action= 不能靠地图或游戏模式 INI 改写，因此新 Type 应在 rulesmd.ini 中创建。`
          : `创建时会自动写入 [${CATEGORY_ROOT[category] || 'Types'}] 的下一个数字 ID；Name 使用上方必填注释，UIName 自动指向新 Section。下方参数只决定是否从模板继承，不在此窗口修改参数值。`}</span>
      </div>

      <div className="addUnitParameterToolbar">
        <div className="addUnitTemplateMeta"><strong>{isSuperweapon ? '可选继承模板参数' : '继承模板参数'}</strong><span>{selectedTemplate ? `${selectedTemplate.label} [${selectedTemplate.id}]` : '未选择模板'}</span><em>已选 {selectedCount}/{selectableOptions.length}</em></div>
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
            const display = displayedValues.get(option.line_id) ?? (option.value || '空值')
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
        <span>{isSuperweapon ? '超级武器默认不继承模板参数，避免把旧 Type 的专用配置误带入新 Type；需要的参数可勾选或创建后继续添加。' : '未勾选的模板参数不会写入新单位；创建后可在主编辑器继续添加或修改参数。'}</span>
        <div><Button onClick={onClose}>取消</Button><Button variant="accent" disabled={creating || loading || !templateId || !validSectionName(sectionName) || !comment.trim() || (isSuperweapon && !superweaponType)} onClick={() => void createUnit()}><PackagePlus size={16}/>{creating ? '正在创建…' : (isSuperweapon ? '创建超级武器' : '创建单位')}</Button></div>
      </footer>
    </div>
  </Dialog>
}
