import type { SectionOption } from './backend'

/**
 * The legacy Qt editor treated [General] plus a set of dedicated global-rule sections
 * as one conceptual “全局规则” workspace. Keep that information architecture in the
 * React editor instead of reclassifying General through the generic unit categories.
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

/**
 * The old Qt list only exposed five keyword filters inside [General]. The official
 * rulesmd.ini itself has much better comment blocks (repair/refit, income/production,
 * computer controls, missile controls, spy rules, etc.). Use those blocks to classify
 * the remaining General keys while preserving every original Qt category verbatim.
 *
 * These are deliberately General-specific names; they are not the generic unit-option
 * categories used by ordinary TechnoTypes.
 */
export const GENERAL_SUPPLEMENT_GROUP_ORDER = [
  '修理与补给',
  '经济与生产',
  '电脑AI设置',
  '间谍与伪装',
  '资源与采集',
  '运动与载具',
  '超级武器规则',
  '战斗与伤害规则',
  '环境与地图',
  '常规全局设置',
] as const

type GeneralSupplementGroup = typeof GENERAL_SUPPLEMENT_GROUP_ORDER[number]

const GENERAL_SUPPLEMENT_RULES: Array<{ name: GeneralSupplementGroup; match: (key: string) => boolean }> = [
  {
    name: '修理与补给',
    match: key => /(?:^refundpercent$|reloadrate|repair|selfheal|tiberiumheal)/i.test(key),
  },
  {
    name: '资源与采集',
    match: key => /(?:tiberium(?:short|long)scan|slaveminer|harvestersperrefinery|aiextrarefineries|aislaveminernumber|purifierbonus|growthrate|tiberiumgrows|tiberiumspreads|weedcapacity)/i.test(key),
  },
  {
    name: '经济与生产',
    match: key => /(?:buildspeed|builduptime|separateaircraft|survivor|placementdelay|multiplefactory|lowpowerproduction|lowpowerpenalty|campaignmoney|alternateproductioncredit|money|income|production)/i.test(key),
  },
  {
    name: '间谍与伪装',
    match: key => /(?:spy|disguise|mirage|blinkdisguise|disguisedetection|attackcursorondisguise)/i.test(key),
  },
  {
    name: '超级武器规则',
    match: key => /(?:^lightning|forceshield|mutateexplosion|^chrono(?:delay|reinf|distance|trigger|minimum|range)|aisuperdefense)/i.test(key),
  },
  {
    name: '战斗与伤害规则',
    match: key => /(?:missile(?:speed|rot|safety)|^prism|^v3rocket|^dmisl|^cmisl|droppodweapon|damage|warhead)/i.test(key),
  },
  {
    name: '运动与载具',
    match: key => /(?:curleyshuffle|closeenough|gamespeedbias|flightlevel|parachutemaxfallrate|noparachutemaxfallrate|guardmodestray|^stray$|relaxedstray|hover|balloon|tunnelspeed|tracked|wheeled|leptonsper(?:sight|fire)increase)/i.test(key),
  },
  {
    name: '电脑AI设置',
    match: key => /(?:^ai|teamdelays|basedefense|basebias|suspend|fillearliestteamprobability|minimumaidefensiveteams|maximumaidefensiveteams|totalaiteamcap|usemindefenserule|dissolveunfilledteamdelay|healscanradius|targetingdelay|maximumbuildingplacementfailures|threatperoccupant|approachtargetresetmultiplier)/i.test(key),
  },
  {
    name: '环境与地图',
    match: key => /(?:fogofwar|camerarange|visceroid|treestrength|winddirection|blendedfog|cliffback|icecracking|icebreaking|shipsinking|treeflammability|craterlevel|bridgevoxel|tiberiumtransmogrify)/i.test(key),
  },
]

const ORIGINAL_QT_LABELS = GENERAL_LEGACY_VIEWS.slice(1).map(view => view.label as string)
const ORIGINAL_QT_LABEL_SET = new Set(ORIGINAL_QT_LABELS)

/** main.tsx already adds the “全部” source view before these labels. */
export const GENERAL_LEGACY_GROUP_ORDER = Array.from(new Set([
  ...GENERAL_LEGACY_VIEWS.slice(1, 6).map(view => view.label as string),
  ...GENERAL_SUPPLEMENT_GROUP_ORDER,
  ...GENERAL_LEGACY_VIEWS.slice(6).map(view => view.label as string),
]))
const GENERAL_LEGACY_LABELS = new Set(GENERAL_LEGACY_VIEWS.map(view => view.label as string))

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

function supplementalGeneralGroup(option: SectionOption): GeneralSupplementGroup {
  const key = option.key.trim()
  for (const rule of GENERAL_SUPPLEMENT_RULES) {
    if (rule.match(key)) return rule.name
  }
  return '常规全局设置'
}

/**
 * Backend global-rule bundles stamp dedicated old-Qt sections with their legacy label.
 * Preserve that authoritative category first. For rows physically belonging to [General],
 * apply the five original Qt filters and then the official-rules comment-block mapping.
 */
export function legacyGeneralGroup(option: SectionOption): string {
  const category = option.category.trim()
  if (GENERAL_LEGACY_LABELS.has(category) && category !== '全部') return category
  for (const view of GENERAL_LEGACY_VIEWS.slice(1, 6)) {
    if (matchesLegacyGeneralFilter(option, view.label)) return view.label
  }
  return supplementalGeneralGroup(option)
}

/**
 * Keep every old-Qt category visible in its original order. Supplemental General-only
 * groups appear only when the current document actually contains matching parameters.
 */
export function orderedGeneralGroups(groups: string[] = []): string[] {
  const present = new Set(groups)
  return GENERAL_LEGACY_GROUP_ORDER.filter(group => ORIGINAL_QT_LABEL_SET.has(group) || present.has(group))
}
