import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Bomb,
  Building2,
  Crosshair,
  Flag,
  Layers3,
  PackagePlus,
  Plane,
  Rocket,
  Search,
  Shield,
  Sparkles,
  Truck,
  Users,
} from 'lucide-react'
import { Button, Checkbox, Dialog, Select, TextField } from 'terry-react-ui-library'
import { workspaceApi, type CreateUnitResult, type MapRuleCatalogItem, type SectionData, type SectionOption } from './backend'
import { countryIconStyle } from './legacyIcons'
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

type ObjectKind = '' | 'unit' | 'country' | 'side' | 'superweapon' | 'weapon' | 'warhead' | 'projectile' | 'armor'
type WizardStep = 'kind' | 'unit-type' | 'details' | 'parameters'
type RegistryItem = { id: string; key: string }

const OBJECT_CATEGORIES = ['步兵', '载具', '飞机', '建筑', '超级武器', '国家', '武器', '弹头', '弹体'] as const
const UNIT_CATEGORIES = ['步兵', '载具', '飞机', '建筑'] as const
const CATEGORY_ROOT: Record<string, string> = {
  步兵: 'InfantryTypes',
  载具: 'VehicleTypes',
  飞机: 'AircraftTypes',
  建筑: 'BuildingTypes',
  超级武器: 'SuperWeaponTypes',
  国家: 'Countries',
}
const STANDALONE_CATEGORY: Partial<Record<ObjectKind, string>> = {
  weapon: '武器',
  warhead: '弹头',
  projectile: '弹体',
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
  { value: 'GenericWarhead', label: '通用弹头 · GenericWarhead · Ares' },
  { value: 'UnitDelivery', label: '单位投送 · UnitDelivery · Ares' },
  { value: 'Firestorm', label: '火风暴 · Firestorm · Ares' },
  { value: 'HunterSeeker', label: '猎杀搜寻 · HunterSeeker · Ares' },
  { value: 'DropPod', label: '空降舱 · DropPod · Ares' },
  { value: 'EMPulse', label: 'EMP 脉冲 · EMPulse · Ares' },
  { value: 'Battery', label: '电池 / 充能 · Battery · Ares' },
]

const BUILTIN_SIDE_LABELS: Record<string, string> = {
  gdi: '盟军',
  nod: '苏军',
  thirdside: '尤里',
}

function normalizedCategory(value: string) {
  return value === '战车' ? '载具' : value
}

function validSectionName(value: string) {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(value.trim())
}

function validArmorValue(value: string) {
  const clean = value.trim()
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(clean) || /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(clean)
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

function isAresCharacteristic(option: SectionOption) {
  return option.source.toLowerCase() === 'ares'
    || /^\s*✦/.test(option.label || '')
    || /Ares\s*(?:解锁|扩展|新增|解除原版硬编码)/i.test(option.description || '')
}

function cleanParameterLabel(label: string) {
  return label.replace(/^\s*✦\s*/, '').trim()
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

function CountryOptionFlag({ id }: { id: string }) {
  const style = countryIconStyle(id, 30)
  return style ? <span className="wizardCountryFlag" style={style}/> : undefined
}

function registryFromSection(data: SectionData | null): RegistryItem[] {
  if (!data) return []
  return data.options
    .map(option => ({ id: option.value.trim(), key: option.key.trim() }))
    .filter(item => Boolean(item.id))
}

export function AddUnitDialog({ open, rows, onClose, onCreated }: Props) {
  const eligibleRows = useMemo(() => rows
    .map(row => ({ ...row, category: normalizedCategory(row.category) }))
    .filter(row => OBJECT_CATEGORIES.includes(row.category as typeof OBJECT_CATEGORIES[number])), [rows])
  const rowsById = useMemo(() => new Map(rows.map(row => [row.id.toLowerCase(), row])), [rows])

  const [modeReady, setModeReady] = useState(false)
  const [mapMode, setMapMode] = useState(false)
  const [wizardStep, setWizardStep] = useState<WizardStep>('kind')
  const [objectKind, setObjectKind] = useState<ObjectKind>('')
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

  const [mapCatalog, setMapCatalog] = useState<MapRuleCatalogItem[]>([])
  const [mapCategory, setMapCategory] = useState('')
  const [mapSection, setMapSection] = useState('')
  const [mapQuery, setMapQuery] = useState('')

  const [aresEnabled, setAresEnabled] = useState(true)
  const [sideRegistry, setSideRegistry] = useState<RegistryItem[]>([])
  const [superweaponType, setSuperweaponType] = useState('')
  const [providerBuilding, setProviderBuilding] = useState('')
  const [countrySide, setCountrySide] = useState('GDI')
  const [armorBase, setArmorBase] = useState('steel')

  const isSuperweapon = objectKind === 'superweapon'
  const isCountry = objectKind === 'country'
  const isSide = objectKind === 'side'
  const isArmor = objectKind === 'armor'
  const isStandalone = objectKind === 'weapon' || objectKind === 'warhead' || objectKind === 'projectile'
  const objectName = isArmor ? '护甲' : isSide ? '阵营' : isCountry ? '国家' : isSuperweapon ? '超级武器' : STANDALONE_CATEGORY[objectKind] ?? '单位'

  const sideRows = useMemo<UnitTemplateRow[]>(() => sideRegistry.map(item => ({
    id: item.id,
    label: BUILTIN_SIDE_LABELS[item.id.toLowerCase()] || localizedReferenceLabel(item.id),
    category: '阵营',
  })), [sideRegistry])
  const categoryRows = useMemo(() => isSide ? sideRows : eligibleRows.filter(row => row.category === category), [category, eligibleRows, isSide, sideRows])
  const buildingRows = useMemo(() => eligibleRows.filter(row => row.category === '建筑'), [eligibleRows])
  const countrySideOptions = useMemo(() => {
    const registry = sideRegistry.length ? sideRegistry : [{ id: 'GDI', key: '0' }, { id: 'Nod', key: '1' }, { id: 'ThirdSide', key: '2' }]
    return registry.map(item => ({
      value: item.id,
      label: `${BUILTIN_SIDE_LABELS[item.id.toLowerCase()] || localizedReferenceLabel(item.id)} · ${item.id}`,
      icon: aresEnabled && !['gdi', 'nod', 'thirdside'].includes(item.id.toLowerCase()) ? <Sparkles size={13}/> : undefined,
    }))
  }, [aresEnabled, sideRegistry])

  const selectableOptions = useMemo(() => (templateData?.options ?? []).filter(option => {
    const key = option.key.toLowerCase()
    if (['name', 'uiname'].includes(key)) return false
    if (isSuperweapon && key === 'type') return false
    if (isCountry && key === 'side') return false
    return true
  }), [isCountry, isSuperweapon, templateData])
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
    setModeReady(false)
    setError('')
    setMapQuery('')
    setWizardStep('kind')
    setObjectKind('')
    setCategory('')
    setTemplateId('')
    setTemplateData(null)
    setSectionName('')
    setComment('')
    setParameterQuery('')
    setSelectedLines({})
    setSuperweaponType('')
    setProviderBuilding('')
    setCountrySide('GDI')
    setArmorBase('steel')
    setSideRegistry([])

    void workspaceApi.snapshot().then(snapshot => {
      if (cancelled) return
      const isMap = snapshot.document.kind === 'map'
      setMapMode(isMap)
      setAresEnabled(snapshot.settings.ares_enabled)
      setMapCatalog(isMap ? snapshot.map_rule_catalog : [])
      if (isMap) {
        const available = snapshot.map_rule_catalog.filter(item => !item.present)
        const first = available[0]
        setMapCategory(first?.category ?? '')
        setMapSection(first?.section ?? '')
      }
      if (!isMap && snapshot.settings.ares_enabled) {
        void workspaceApi.section('Sides').then(data => {
          if (!cancelled) setSideRegistry(registryFromSection(data))
        }).catch(() => {
          if (!cancelled) setSideRegistry([{ id: 'GDI', key: '0' }, { id: 'Nod', key: '1' }, { id: 'ThirdSide', key: '2' }])
        })
      }
      setModeReady(true)
    }).catch(err => {
      if (!cancelled) {
        setError(`读取文档模式失败：${String(err)}`)
        setModeReady(true)
      }
    })
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!mapMode || !open) return
    const first = visibleMapRules[0]?.section ?? ''
    setMapSection(current => visibleMapRules.some(item => item.section === current) ? current : first)
  }, [mapMode, open, visibleMapRules])

  useEffect(() => {
    if (!open || mapMode || !category || isArmor) return
    const first = categoryRows[0]?.id ?? ''
    setTemplateId(current => categoryRows.some(row => row.id === current) ? current : first)
  }, [category, categoryRows, isArmor, mapMode, open])

  useEffect(() => {
    if (!open || mapMode || isArmor || !templateId) {
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
      if (isSuperweapon) {
        const templateType = data.options.find(option => option.key.toLowerCase() === 'type')?.value ?? ''
        setSuperweaponType(templateType)
      }
      if (isCountry) {
        const templateSide = data.options.find(option => option.key.toLowerCase() === 'side')?.value ?? ''
        if (templateSide) setCountrySide(templateSide)
      }
      setSelectedLines(Object.fromEntries(
        data.options
          .filter(option => {
            const key = option.key.toLowerCase()
            if (['name', 'uiname'].includes(key)) return false
            if (isSuperweapon && key === 'type') return false
            if (isCountry && key === 'side') return false
            return true
          })
          .map(option => [option.line_id, !isSuperweapon]),
      ))
    }).catch(err => {
      if (!cancelled) setError(`读取模板失败：${String(err)}`)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [isArmor, isCountry, isSuperweapon, mapMode, open, templateId])

  function selectObjectKind(kind: Exclude<ObjectKind, ''>) {
    setObjectKind(kind)
    setError('')
    if (kind === 'unit') {
      setCategory('')
      setWizardStep('unit-type')
      return
    }
    if (kind === 'armor') {
      setCategory('')
      setTemplateId('')
      setTemplateData(null)
      setWizardStep('details')
      return
    }
    setCategory(kind === 'country' ? '国家' : kind === 'side' ? '阵营' : kind === 'superweapon' ? '超级武器' : STANDALONE_CATEGORY[kind] ?? '')
    setWizardStep('details')
  }

  function selectUnitType(nextCategory: typeof UNIT_CATEGORIES[number]) {
    setCategory(nextCategory)
    setWizardStep('details')
    setError('')
  }

  function backFromDetails() {
    setError('')
    setWizardStep(objectKind === 'unit' ? 'unit-type' : 'kind')
  }

  function detailsError() {
    if (isArmor) {
      if (!aresEnabled) return '请先在设置中开启 Ares 支持。'
      if (!validSectionName(sectionName.trim())) return '护甲 ID 只能使用英文字母、数字和下划线，并且必须以字母开头。'
      if (!validArmorValue(armorBase)) return '继承值请填写已有护甲 ID（例如 steel）或百分比（例如 100%）。'
      return ''
    }
    if (isSide && !aresEnabled) return '请先在设置中开启 Ares 支持。'
    if (!templateId || !templateData) return '请选择一个有效的参考模板。'
    if (!validSectionName(sectionName.trim())) return '注册名只能使用英文字母、数字和下划线，并且必须以字母开头。'
    if (!isStandalone && !isSide && !comment.trim()) return isCountry ? '必须填写国家名称 / 注释。' : isSuperweapon ? '必须填写超级武器名称 / 注释。' : '必须填写注释（Name）。'
    if (isSuperweapon && !superweaponType) return '请选择超级武器 Type。'
    if (isSuperweapon && ARES_SUPERWEAPON_TYPES.has(superweaponType) && !aresEnabled) return `${superweaponType} 是 Ares 新增的超级武器 Type；请先在设置中开启 Ares 支持。`
    if (isCountry && !countrySide) return '请选择国家所属阵营。'
    return ''
  }

  function goParameters() {
    const problem = detailsError()
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    setWizardStep('parameters')
  }

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
      const result = await workspaceApi.createUnit({ template: mapSection, section: mapSection, comment: '', included_line_ids: [] })
      await onCreated(result)
    } catch (err) {
      setError(`添加地图规则失败：${String(err)}`)
    } finally {
      setCreating(false)
    }
  }

  async function nextRegistryKey(root: string) {
    try {
      const data = await workspaceApi.section(root)
      const values = data.options
        .map(option => Number.parseInt(option.key, 10))
        .filter(value => Number.isFinite(value))
      return String(values.length ? Math.max(...values) + 1 : 0)
    } catch {
      return '0'
    }
  }

  async function registerListValue(root: string, value: string) {
    try {
      const data = await workspaceApi.section(root)
      if (data.options.some(option => option.value.trim().toLowerCase() === value.toLowerCase())) return
    } catch {
      // addOption creates the section when the registration root is not present yet.
    }
    const key = await nextRegistryKey(root)
    await workspaceApi.addOption(root, key, value)
  }

  async function inspectProviderSlot() {
    if (!providerBuilding) return null
    const building = await workspaceApi.section(providerBuilding)
    const primary = optionByKey(building, 'SuperWeapon')
    const secondary = optionByKey(building, 'SuperWeapon2')
    if (slotIsFree(primary)) return { key: 'SuperWeapon', option: primary, current: '' }
    if (slotIsFree(secondary)) return { key: 'SuperWeapon2', option: secondary, current: '' }
    if (!aresEnabled) throw new Error('该建筑的原版 SuperWeapon / SuperWeapon2 两个槽位都已占用。开启 Ares 支持后，编辑器才能使用 SuperWeapons= 追加更多超级武器。')
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

  async function createArmor() {
    const problem = detailsError()
    if (problem) {
      setError(problem)
      return
    }
    const armorId = sectionName.trim()
    setCreating(true)
    setError('')
    try {
      await workspaceApi.addOption('ArmorTypes', armorId, armorBase.trim())
      const [snapshot, section] = await Promise.all([workspaceApi.snapshot(), workspaceApi.section('ArmorTypes')])
      await onCreated({ snapshot, section, registration_id: armorId, root: 'ArmorTypes' })
    } catch (err) {
      setError(`添加护甲失败：${String(err)}`)
    } finally {
      setCreating(false)
    }
  }

  async function createSide() {
    const problem = detailsError()
    if (problem) {
      setError(problem)
      return
    }
    const picked = selectableOptions.filter(option => selectedLines[option.line_id])
    if (!picked.length) {
      setError('新阵营至少需要继承一个有效参数；建议保留参考阵营的默认参数后再逐项调整。')
      return
    }
    const cleanSection = sectionName.trim()
    setCreating(true)
    setError('')
    try {
      await registerListValue('Sides', cleanSection)
      for (const option of picked) await workspaceApi.addOption(cleanSection, option.key, option.value)
      const [snapshot, section, sides] = await Promise.all([
        workspaceApi.snapshot(),
        workspaceApi.section(cleanSection),
        workspaceApi.section('Sides'),
      ])
      setSideRegistry(registryFromSection(sides))
      const registered = registryFromSection(sides).find(item => item.id.toLowerCase() === cleanSection.toLowerCase())
      await onCreated({ snapshot, section, registration_id: registered?.key ?? '', root: 'Sides' })
    } catch (err) {
      setError(`添加阵营失败：${String(err)}`)
    } finally {
      setCreating(false)
    }
  }

  async function createObject() {
    if (isArmor) {
      await createArmor()
      return
    }
    if (isSide) {
      await createSide()
      return
    }
    const problem = detailsError()
    if (problem) {
      setError(problem)
      return
    }
    const cleanSection = sectionName.trim()
    setCreating(true)
    setError('')
    try {
      const providerTarget = isSuperweapon ? await inspectProviderSlot() : null
      const result = await workspaceApi.createUnit({
        template: templateId,
        section: cleanSection,
        comment: comment.trim(),
        included_line_ids: selectableOptions.filter(option => selectedLines[option.line_id]).map(option => option.line_id),
      })

      let needsRefresh = false
      if (isStandalone && comment.trim()) {
        await workspaceApi.addOption(cleanSection, 'Name', comment.trim())
        needsRefresh = true
      }
      if (objectKind === 'weapon' && aresEnabled) {
        await registerListValue('WeaponTypes', cleanSection)
        needsRefresh = true
      }
      if (isSuperweapon) {
        await workspaceApi.addOption(cleanSection, 'Type', superweaponType)
        await attachSuperweapon(providerTarget, cleanSection)
        needsRefresh = true
      }
      if (isCountry) {
        await workspaceApi.addOption(cleanSection, 'Side', countrySide)
        needsRefresh = true
      }

      if (needsRefresh) {
        const [snapshot, section] = await Promise.all([workspaceApi.snapshot(), workspaceApi.section(cleanSection)])
        await onCreated({ ...result, snapshot, section, root: objectKind === 'weapon' && aresEnabled ? 'WeaponTypes' : result.root })
      } else {
        await onCreated(result)
      }
    } catch (err) {
      setError(`添加${objectName}失败：${String(err)}`)
    } finally {
      setCreating(false)
    }
  }

  if (!modeReady) {
    return <Dialog open={open} title="添加新对象" icon={<PackagePlus size={18}/>} size="wide" onClose={onClose}>
      <div className="addUnitDialog wizardLoading"><div className="addUnitEmpty">正在读取对象目录…</div></div>
    </Dialog>
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

  const templateOptions = categoryRows.map(row => ({
    value: row.id,
    label: `${row.label} · ${row.id}`,
    icon: isCountry ? <CountryOptionFlag id={row.id}/> : isSide ? <Sparkles size={13}/> : undefined,
  }))
  const selectedTemplate = categoryRows.find(row => row.id === templateId)
  const providerOptions = [
    { value: '', label: '不自动挂载到建筑' },
    ...buildingRows.map(row => ({ value: row.id, label: `${row.label} · ${row.id}` })),
  ]
  const superweaponTypeOptions = SUPERWEAPON_TYPES
    .filter(item => aresEnabled || !ARES_SUPERWEAPON_TYPES.has(item.value))
    .map(item => ({ ...item, icon: ARES_SUPERWEAPON_TYPES.has(item.value) ? <Sparkles size={13}/> : undefined }))

  const dialogIcon = isArmor
    ? <Shield size={18}/>
    : isSide
      ? <Layers3 size={18}/>
      : isCountry
        ? <Flag size={18}/>
        : isSuperweapon
          ? <Sparkles size={18}/>
          : objectKind === 'weapon'
            ? <Crosshair size={18}/>
            : objectKind === 'warhead'
              ? <Bomb size={18}/>
              : objectKind === 'projectile'
                ? <Rocket size={18}/>
                : <PackagePlus size={18}/>

  if (wizardStep === 'kind') {
    return <Dialog open={open} title="添加新对象" icon={<PackagePlus size={18}/>} size="wide" onClose={onClose}>
      <div className="objectWizardChoice">
        <h2>你想创建什么对象？</h2>
        <div className="objectWizardCards">
          <button onClick={() => selectObjectKind('unit')}><Users size={24}/><strong>单位</strong></button>
          <button onClick={() => selectObjectKind('weapon')} disabled={!eligibleRows.some(row => row.category === '武器')}><Crosshair size={24}/><strong>武器</strong>{aresEnabled && <small><Sparkles size={11}/> Ares 注册</small>}</button>
          <button onClick={() => selectObjectKind('warhead')} disabled={!eligibleRows.some(row => row.category === '弹头')}><Bomb size={24}/><strong>弹头</strong></button>
          <button onClick={() => selectObjectKind('projectile')} disabled={!eligibleRows.some(row => row.category === '弹体')}><Rocket size={24}/><strong>弹体</strong></button>
          <button onClick={() => selectObjectKind('country')} disabled={!eligibleRows.some(row => row.category === '国家')}><Flag size={24}/><strong>国家</strong></button>
          <button onClick={() => selectObjectKind('superweapon')}><Sparkles size={24}/><strong>超级武器</strong></button>
          {aresEnabled && <button onClick={() => selectObjectKind('side')} disabled={!sideRows.length}><Layers3 size={24}/><strong>阵营</strong><small><Sparkles size={11}/> Ares</small></button>}
          {aresEnabled && <button onClick={() => selectObjectKind('armor')}><Shield size={24}/><strong>护甲</strong><small><Sparkles size={11}/> Ares</small></button>}
        </div>
      </div>
    </Dialog>
  }

  if (wizardStep === 'unit-type') {
    return <Dialog open={open} title="添加新对象" icon={<PackagePlus size={18}/>} size="wide" onClose={onClose}>
      <div className="objectWizardChoice">
        <h2>你想创建哪类单位？</h2>
        <div className="objectWizardCards unitKinds">
          <button onClick={() => selectUnitType('步兵')} disabled={!eligibleRows.some(row => row.category === '步兵')}><Users size={23}/><strong>步兵</strong></button>
          <button onClick={() => selectUnitType('载具')} disabled={!eligibleRows.some(row => row.category === '载具')}><Truck size={23}/><strong>载具</strong></button>
          <button onClick={() => selectUnitType('飞机')} disabled={!eligibleRows.some(row => row.category === '飞机')}><Plane size={23}/><strong>飞机</strong></button>
          <button onClick={() => selectUnitType('建筑')} disabled={!eligibleRows.some(row => row.category === '建筑')}><Building2 size={23}/><strong>建筑</strong></button>
        </div>
        <button className="wizardBackLink" onClick={() => setWizardStep('kind')}><ArrowLeft size={14}/> 返回</button>
      </div>
    </Dialog>
  }

  if (wizardStep === 'details' && isArmor) {
    return <Dialog open={open} title="添加 Ares 护甲" icon={dialogIcon} size="wide" onClose={onClose}>
      <div className="addUnitDialog objectWizardDetails">
        <div className="objectWizardStepLabel"><Sparkles size={14}/> Ares 对象</div>
        <div className="addUnitSetup wizardDetailsGrid">
          <label><span>新护甲 ID <b>必填</b></span><TextField value={sectionName} onChange={setSectionName} placeholder="例如 magic"/></label>
          <label><span>继承护甲 / 默认倍率 <b>必填</b></span><TextField value={armorBase} onChange={setArmorBase} placeholder="例如 steel 或 100%"/></label>
        </div>
        <div className="addUnitRegistrationHint">
          <strong><Sparkles size={13}/> 自动写入 [ArmorTypes]</strong>
          <span>Ares 自定义护甲不是独立 Section，而是 [ArmorTypes] 中的一项。填写已有护甲 ID（例如 steel）时继承它的默认弹头倍率；也可直接填写百分比作为默认倍率。创建后即可在 Armor= 与 Versus.&lt;Armor&gt; 中使用。</span>
        </div>
        {error && <div className="addUnitError">{error}</div>}
        <footer className="addUnitActions wizardNavActions">
          <span>只在开启 Ares 支持时显示此对象类型。</span>
          <div><Button onClick={backFromDetails}><ArrowLeft size={15}/>上一步</Button><Button variant="accent" disabled={creating} onClick={() => void createArmor()}><Shield size={16}/>{creating ? '正在创建…' : '创建护甲'}</Button></div>
        </footer>
      </div>
    </Dialog>
  }

  if (wizardStep === 'details') {
    return <Dialog open={open} title="添加新对象" icon={dialogIcon} size="wide" onClose={onClose}>
      <div className="addUnitDialog objectWizardDetails">
        <div className="objectWizardStepLabel">{isSide && <Sparkles size={14}/>} {isSide ? 'Ares 阵营' : '对象信息'}</div>
        <div className="addUnitSetup wizardDetailsGrid">
          <label><span>{isCountry ? '参考国家' : isSide ? '参考阵营' : isSuperweapon ? '参考模板' : isStandalone ? `参考${objectName}` : '现有单位模板'}</span><Select value={templateId} options={templateOptions} onChange={setTemplateId} searchable searchPlaceholder="搜索中文名或 Section"/></label>
          <label><span>{isCountry ? '新国家 Section' : isSide ? '新阵营 Section' : isSuperweapon ? '新超级武器 Section' : isStandalone ? `新${objectName} Section` : '新单位 Section'}</span><TextField value={sectionName} onChange={setSectionName} placeholder={isCountry ? '例如 MYCOUNTRY' : isSide ? '例如 MySide' : isSuperweapon ? '例如 MY_SUPERWEAPON' : objectKind === 'weapon' ? '例如 MYWEAPON' : objectKind === 'warhead' ? '例如 MYWARHEAD' : objectKind === 'projectile' ? '例如 MYPROJECTILE' : '例如 MYTANK'}/></label>
          {isStandalone
            ? <label><span>中文注释 / Name（仅维护）</span><TextField value={comment} onChange={setComment} placeholder={`例如 我的${objectName}`}/></label>
            : !isSide && <label><span>{isCountry ? '国家名称 / 注释' : isSuperweapon ? '名称 / 注释' : '注释 / Name'} <b>必填</b></span><TextField value={comment} onChange={setComment} placeholder={isCountry ? '例如 我的国家' : isSuperweapon ? '例如 我的轨道打击' : '例如 我的测试坦克'}/></label>}
          {isCountry && <label><span>所属阵营 <b>必填</b></span><Select value={countrySide} options={countrySideOptions} onChange={setCountrySide}/></label>}
          {isSuperweapon && <label><span>超级武器 Type <b>必填</b></span><Select value={superweaponType} options={superweaponTypeOptions} onChange={setSuperweaponType} searchable searchPlaceholder="搜索 Type"/></label>}
          {isSuperweapon && <label><span>提供该超武的建筑</span><Select value={providerBuilding} options={providerOptions} onChange={setProviderBuilding} searchable searchPlaceholder="搜索建筑"/></label>}
        </div>

        <div className="addUnitRegistrationHint">
          <strong>{isSide
            ? <><Sparkles size={13}/> Ares 阵营注册自动处理</>
            : objectKind === 'weapon' && aresEnabled
              ? <><Sparkles size={13}/> Ares WeaponTypes 注册自动处理</>
              : isStandalone
                ? `${objectName}为独立 Section，无需注册`
                : isCountry
                  ? '国家注册自动处理'
                  : isSuperweapon
                    ? '超级武器注册与挂载自动处理'
                    : '注册 ID 自动分配'}</strong>
          <span>{isSide
            ? '创建时自动向 [Sides] 追加新阵营，并从参考阵营复制你勾选的参数。新国家的“所属阵营”菜单会立即出现该阵营。'
            : objectKind === 'weapon' && aresEnabled
              ? `创建新的 [${sectionName.trim() || 'MYWEAPON'}] 后，同时自动写入 Ares 的 [WeaponTypes] 注册表，使独立武器无需依赖虚拟单位也能被游戏解析。`
              : isStandalone
                ? `创建时直接生成新的 [${sectionName.trim() || `MY${objectName}`}] Section，不写入不存在的原版 Types 注册表。中文注释会写入 Name=，仅供编辑器和人工维护识别；创建完成后会立即加入${objectName}候选列表，并排在菜单最前。`
                : isCountry
                  ? '创建时自动写入 [Countries] 的下一个数字 ID，并使用所选阵营写入 Side=。下一步只需要决定从参考国家继承哪些其他参数。'
                  : isSuperweapon
                    ? `创建时自动写入 [SuperWeaponTypes]。若选择提供建筑，编辑器会依次使用 SuperWeapon、SuperWeapon2；两个原版槽位都已占用时${aresEnabled ? '自动改用 Ares 的 SuperWeapons= 追加，不覆盖已有超武。' : '会停止创建并提示开启 Ares，不会覆盖已有超武。'}`
                    : `创建时自动写入 [${CATEGORY_ROOT[category] || 'Types'}] 的下一个数字 ID。下一步再选择需要从模板继承的参数。`}</span>
        </div>

        {loading && <div className="addUnitEmpty">正在读取参考模板…</div>}
        {error && <div className="addUnitError">{error}</div>}
        <footer className="addUnitActions wizardNavActions">
          <span>{selectedTemplate ? `参考：${selectedTemplate.label} [${selectedTemplate.id}]` : '请选择参考模板。'}</span>
          <div><Button onClick={backFromDetails}><ArrowLeft size={15}/>上一步</Button><Button variant="accent" disabled={loading || !templateData} onClick={goParameters}>下一步：选择参数</Button></div>
        </footer>
      </div>
    </Dialog>
  }

  return <Dialog open={open} title="添加新对象" icon={dialogIcon} size="wide" onClose={onClose}>
    <div className="addUnitDialog objectWizardParameters">
      <div className="addUnitParameterToolbar">
        <div className="addUnitTemplateMeta"><strong>最后一步 · 继承参数</strong><span>{selectedTemplate ? `${selectedTemplate.label} [${selectedTemplate.id}]` : '未选择模板'}</span><em>已选 {selectedCount}/{selectableOptions.length}</em></div>
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
            const aresFeature = isAresCharacteristic(option)
            const label = cleanParameterLabel(option.label || option.key) || option.key
            return <div className={`addUnitParameterRow parameterTableRow ${checked ? 'selected' : 'excluded'}`} key={option.line_id}>
              <div className="parameterKeyCell"><code title={option.key}>{option.key}</code>{option.source.toLowerCase() === 'ares' && <span className="aresBadge"><Sparkles size={10}/>ARES</span>}</div>
              <div className="parameterLabelCell"><strong title={label}>{aresFeature && <Sparkles size={12}/>} {label}</strong></div>
              <div className="parameterValueCell addUnitReadOnlyValue"><div className="rulesControlHost"><TextField value={display} onChange={() => {}} disabled/></div></div>
              <div className="addUnitParameterUse"><Checkbox checked={checked} onChange={() => toggleLine(option.line_id)} title={checked ? '创建时继承此参数' : '创建时不写入此参数'} ariaLabel={`${checked ? '取消继承' : '继承'} ${option.key}`}/></div>
            </div>
          })}
          {!loading && !visibleOptions.length && <div className="addUnitEmpty">这个模板没有其他可继承参数，可以直接创建。</div>}
        </div>
      </div>

      {error && <div className="addUnitError">{error}</div>}
      <footer className="addUnitActions wizardNavActions">
        <span>{isSuperweapon ? '超级武器默认不继承模板参数，避免把旧 Type 的专用配置误带入新 Type。' : isSide ? '阵营只复制勾选的参数；Ares 特性参数用星光图标标识。' : '未勾选的参数不会写入新对象；创建后仍可在主编辑器继续添加。'}</span>
        <div><Button onClick={() => setWizardStep('details')}><ArrowLeft size={15}/>上一步</Button><Button variant="accent" disabled={creating || loading} onClick={() => void createObject()}><PackagePlus size={16}/>{creating ? '正在创建…' : `创建${objectName}`}</Button></div>
      </footer>
    </div>
  </Dialog>
}
