import type { SectionOption } from './backend'

/**
 * The legacy Qt editor treated [General] plus a set of dedicated global-rule sections
 * as one conceptual “全局规则” workspace. Keep that exact information architecture in
 * the React editor instead of reclassifying General through the generic unit categories.
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

/** main.tsx already adds the “全部” source view before these labels. */
export const GENERAL_LEGACY_GROUP_ORDER = GENERAL_LEGACY_VIEWS.slice(1).map(view => view.label)

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
 * Compatibility helper used by main.tsx. Backend global-rule bundles already stamp the
 * dedicated Qt category onto each row; only the five [General] substring filters need
 * to be derived from the key here.
 */
export function legacyGeneralGroup(option: SectionOption): string | null {
  for (const view of GENERAL_LEGACY_VIEWS.slice(1, 6)) {
    if (matchesLegacyGeneralFilter(option, view.label)) return view.label
  }
  return null
}

/** Return every legacy Qt category in its original order, even if that section is empty. */
export function orderedGeneralGroups(_groups: string[] = []): string[] {
  return [...GENERAL_LEGACY_GROUP_ORDER]
}
