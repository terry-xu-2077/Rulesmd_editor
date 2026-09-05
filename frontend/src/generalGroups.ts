import type { SectionOption } from './backend'

/**
 * The old Qt editor treated [General] plus dedicated global-rule sections as one
 * workspace.  Keep those section identities here for navigation compatibility, while
 * the Python backend owns the actual General parameter categorization from official
 * rulesmd.ini comment blocks.
 */
export const GENERAL_LEGACY_VIEWS = [
  { label: '全部', section: 'General', tokens: [] },
  { label: '伞兵设置', section: 'General', tokens: ['Para', 'Pilot', 'PParatrooper'] },
  { label: '秘密科技', section: 'General', tokens: ['Secret'] },
  { label: '定义单位', section: 'General', tokens: ['Shipyard', 'RepairBay', 'BaseUnit', 'HarvesterUnit', 'PadAircraft', 'Prerequisite'] },
  { label: '老兵设置', section: 'General', tokens: ['Veteran'] },
  { label: '随机超武', section: 'General', tokens: ['Meteorites', 'IonStorms'] },
  { label: '多人游戏对话框设置', section: 'MultiplayerDialogSettings', tokens: [] },
  { label: '难度设置-简单', section: 'Easy', tokens: [] },
  { label: '难度设置-普通', section: 'Normal', tokens: [] },
  { label: '难度设置-冷酷', section: 'Difficult', tokens: [] },
  { label: '奖励箱规则', section: 'CrateRules', tokens: [] },
  { label: '电脑AI设置', section: 'AI', tokens: [] },
  { label: '电脑IQ设置', section: 'IQ', tokens: [] },
  { label: 'Jumpjet飞行规则', section: 'JumpjetControls', tokens: [] },
  { label: '超级武器规则', section: 'SpecialWeapons', tokens: [] },
  { label: '音频视频规则', section: 'AudioVisual', tokens: [] },
  { label: '战斗与伤害规则', section: 'CombatDamage', tokens: [] },
  { label: '辐射设置', section: 'Radiation', tokens: [] },
  { label: '颜色主题', section: 'Colors', tokens: [] },
] as const

export type GeneralLegacyViewLabel = typeof GENERAL_LEGACY_VIEWS[number]['label']

/** Must mirror GLOBAL_RULE_CATEGORY_ORDER in src/rulesmd_editor/global_rules.py. */
export const GENERAL_CATEGORY_ORDER = [
  '老兵设置',
  '修理与补给',
  '经济与生产',
  '电脑AI设置',
  '运动与载具',
  '天气控制',
  '力场护盾',
  '光棱塔规则',
  'V3火箭规则',
  '无畏级导弹规则',
  '巡航导弹规则',
  '伞兵设置',
  '秘密科技',
  '间谍与伪装',
  '超时空传送',
  '定义单位',
  '资源与采集',
  '战斗与伤害规则',
  '环境与地图',
  '常规全局设置',
  '多人游戏对话框设置',
  '难度设置-简单',
  '难度设置-普通',
  '难度设置-冷酷',
  '奖励箱规则',
  '电脑IQ设置',
  'Jumpjet飞行规则',
  '超级武器规则',
  '音频视频规则',
  '辐射设置',
  '颜色主题',
] as const

const KNOWN_GENERAL_GROUPS = new Set<string>(GENERAL_CATEGORY_ORDER)
const GLOBAL_SUBSECTION_IDS = new Set(
  GENERAL_LEGACY_VIEWS
    .map(view => view.section.toLowerCase())
    .filter(section => section !== 'general'),
)

export function generalLegacyView(label: string) {
  return GENERAL_LEGACY_VIEWS.find(view => view.label === label) ?? GENERAL_LEGACY_VIEWS[0]
}

export function isLegacyGlobalSubsection(section: string) {
  return GLOBAL_SUBSECTION_IDS.has(section.trim().toLowerCase())
}

export function matchesLegacyGeneralFilter(option: SectionOption, label: string) {
  const view = generalLegacyView(label)
  if (view.section !== 'General') return false
  if (!view.tokens.length) return true
  const key = option.key.trim().toLowerCase()
  return view.tokens.some(token => key.includes(token.toLowerCase()))
}

/**
 * New backends return the official category directly.  The tiny Qt matcher is retained
 * only for compatibility with a stale sidecar during hot reload; it is not the normal
 * categorization path anymore.
 */
export function legacyGeneralGroup(option: SectionOption): string {
  const category = option.category.trim()
  if (KNOWN_GENERAL_GROUPS.has(category)) return category

  for (const view of GENERAL_LEGACY_VIEWS.slice(1, 6)) {
    if (matchesLegacyGeneralFilter(option, view.label)) return view.label
  }
  return '常规全局设置'
}

/** Show only categories that actually contain visible parameters. */
export function orderedGeneralGroups(groups: string[] = []): string[] {
  const present = new Set(groups)
  const ordered = GENERAL_CATEGORY_ORDER.filter(group => present.has(group))
  const known = new Set<string>(GENERAL_CATEGORY_ORDER)
  const unknown = [...present].filter(group => !known.has(group))
  return [...ordered, ...unknown]
}
