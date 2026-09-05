import type { SectionOption } from './backend'

export const GENERAL_LEGACY_GROUP_ORDER = [
  '伞兵设置',
  '秘密科技',
  '定义单位',
  '老兵设置',
  '随机超武',
] as const

const GENERAL_GROUP_RULES: Array<{ name: typeof GENERAL_LEGACY_GROUP_ORDER[number]; match: (key: string) => boolean }> = [
  {
    name: '伞兵设置',
    match: key => /(?:para|pilot|pparatrooper)/i.test(key),
  },
  {
    name: '秘密科技',
    match: key => /secret/i.test(key),
  },
  {
    name: '定义单位',
    match: key => /(?:shipyard|repairbay|baseunit|harvesterunit|padaircraft|prerequisite)/i.test(key),
  },
  {
    name: '老兵设置',
    match: key => /veteran/i.test(key),
  },
  {
    name: '随机超武',
    match: key => /(?:meteorites|ionstorms)/i.test(key),
  },
]

/**
 * The old Qt global-rules window had a small hand-curated set of filters for [General].
 * Preserve those proven groupings as the first layer, then let the modern semantic
 * category system handle everything else instead of dumping the remainder into one bucket.
 */
export function legacyGeneralGroup(option: SectionOption): string | null {
  const key = option.key.trim()
  for (const rule of GENERAL_GROUP_RULES) {
    if (rule.match(key)) return rule.name
  }
  return null
}

export function orderedGeneralGroups(groups: string[]): string[] {
  const unique = [...new Set(groups)]
  return [
    ...GENERAL_LEGACY_GROUP_ORDER.filter(group => unique.includes(group)),
    ...unique.filter(group => !GENERAL_LEGACY_GROUP_ORDER.includes(group as typeof GENERAL_LEGACY_GROUP_ORDER[number])),
  ]
}
