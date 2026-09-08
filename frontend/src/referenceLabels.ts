export type ReferenceLabelKind = 'generic' | 'weapon' | 'audio' | 'warhead' | 'projectile' | 'debris' | string

const DIRECT_LABELS: Record<string, string> = {
  none: '无', yes: '是', no: '否', true: '是', false: '否',
  soldier: '步兵', infantry: '步兵', vehicle: '载具', aircraft: '飞机', building: '建筑', civilian: '平民', gi: '美国大兵',

  // Common weapon Sections.
  defaultdeathweapon: '默认死亡武器', oilexplosion: '油井爆炸', barrelexplosion: '油桶爆炸', terrorbomb: '恐怖分子炸弹',
  minigun: '机枪', bazooka: '火箭筒', psychicjab: '心灵冲击', psychicjabe: '精英心灵冲击', ucpsychicjab: '驻军心灵冲击',
  ucelitepsychicjab: '精英驻军心灵冲击', awp: '狙击步枪', awpe: '精英狙击步枪', redeye2: '防空导弹',
  grandcannonweapon: '巨炮', akm: 'AKM 步枪', flare: '信号弹', punch: '重拳', smash: '猛击', virusgun: '病毒狙击枪',
  mindcontrol: '心灵控制', supermindcontrol: '超级心灵控制', radbeamweapon: '辐射射线', radbeamweapone: '精英辐射射线',
  raderuptionweapon: '辐射爆发', shovel: '铁锹',

  // High-frequency technical names which are clearer when translated as a phrase.
  blimpbomb: '飞艇炸弹', blimpbombeffect: '飞艇炸弹效果', assaultcannon: '突击炮', harpyclaw: '哈比爪',
  raidercannon: '突袭炮', vulcantower: '火神炮塔', vulcan2: '火神炮 2',

  // High-frequency generic audio ids in vanilla/YR rules.
  genvehicledie: '通用载具 · 摧毁音效', infantrysquish: '步兵 · 被碾压音效', tankcrush: '坦克 · 碾压音效',
  placebuilding: '建筑 · 放置音效', mcvmovestart: '机动基地车 · 移动音效', mcvsovietselect: '苏联机动基地车 · 选择语音',
  mcvsovietmove: '苏联机动基地车 · 移动语音', mcvyuriselect: '尤里机动基地车 · 选择语音', mcvyurimove: '尤里机动基地车 · 移动语音',
  initiateselect: '尤里新兵 · 选择语音', initiatemove: '尤里新兵 · 移动语音', initiateattackcommand: '尤里新兵 · 攻击语音',
  initiatefear: '尤里新兵 · 受惊语音', initiatedie: '尤里新兵 · 死亡音效', apocalypsemovestart: '天启坦克 · 移动音效',
}

// Longest-prefix match. This keeps technical audio ids readable without changing values.
const AUDIO_PREFIXES: Array<[string, string]> = [
  ['GuardianGI', '重装大兵'], ['BlackEagle', '黑鹰战机'], ['ChronoLegionnaire', '超时空军团兵'], ['Chrono', '超时空单位'],
  ['Rocketeer', '火箭飞行兵'], ['Apocalypse', '天启坦克'], ['Dreadnought', '无畏级战舰'], ['Initiate', '尤里新兵'],
  ['Conscript', '动员兵'], ['Tesla', '磁爆步兵'], ['Flak', '防空步兵'], ['Terrorist', '恐怖分子'], ['Desolator', '辐射工兵'],
  ['Boris', '鲍里斯'], ['Tanya', '谭雅'], ['Virus', '病毒狙击手'], ['Brute', '狂兽人'], ['Slave', '奴隶'], ['Yuri', '尤里'],
  ['Grizzly', '灰熊坦克'], ['Rhino', '犀牛坦克'], ['Prism', '光棱坦克'], ['Mirage', '幻影坦克'], ['Kirov', '基洛夫空艇'],
  ['Harrier', '入侵者战机'], ['Dolphin', '海豚'], ['Squid', '巨型乌贼'], ['Boomer', '雷鸣攻击潜艇'], ['IFV', '多功能步兵车'],
  ['GI', '美国大兵'], ['Spy', '间谍'], ['SEAL', '海豹部队'], ['MCVSoviet', '苏联机动基地车'], ['MCVYuri', '尤里机动基地车'],
  ['MCVAllied', '盟军机动基地车'],
]

const AUDIO_SUFFIXES: Array<[string, string]> = [
  ['AttackCommand', '攻击语音'], ['SpecialAttack', '特殊攻击语音'], ['MoveStart', '移动音效'], ['Select', '选择语音'],
  ['Move', '移动语音'], ['Attack', '攻击语音'], ['Fear', '受惊语音'], ['Feedback', '反馈语音'], ['Created', '建造完成语音'],
  ['Ready', '就绪语音'], ['Deploy', '部署音效'], ['Undeploy', '解除部署音效'], ['Enter', '进入音效'], ['Leave', '离开音效'],
  ['Die', '死亡音效'], ['Crush', '碾压音效'], ['Fire', '开火音效'],
]

// Conservative vocabulary for PascalCase/CamelCase technical IDs. We only emit a guessed
// Chinese label when every word is known; an unknown token keeps the original ID intact.
const TOKEN_ZH: Record<string, string> = {
  Default: '默认', Death: '死亡', Weapon: '武器', Elite: '精英', Primary: '主武器', Secondary: '副武器',
  Oil: '油井', Barrel: '油桶', Explosion: '爆炸', Terror: '恐怖分子', Bomb: '炸弹', Mini: '迷你', Gun: '枪',
  Bazooka: '火箭筒', Psychic: '心灵', Jab: '冲击', UC: '驻军', Virus: '病毒', Mind: '心灵', Control: '控制',
  Super: '超级', Rad: '辐射', Beam: '射线', Eruption: '爆发', Cannon: '火炮', Jump: '跳跃', Punch: '重拳',
  Smash: '猛击', Flare: '信号弹', Shovel: '铁锹', Sound: '音效', Voice: '语音', Attack: '攻击', Move: '移动',
  Select: '选择', Die: '死亡', Deploy: '部署', Report: '开火音效', Projectile: '抛射体', Warhead: '弹头', Debris: '残骸',
  Blimp: '飞艇', Effect: '效果', Assault: '突击', Raider: '突袭', Vulcan: '火神炮', Tower: '炮塔', Harpy: '哈比', Claw: '爪',
  Tank: '坦克', Rocket: '火箭', Missile: '导弹', Laser: '激光', Tesla: '磁暴', Flak: '防空', Prism: '光棱', Chrono: '超时空',
  Para: '空降', Drop: '投放', Air: '空中', Strike: '打击', Naval: '海军', Infantry: '步兵', Vehicle: '载具', Aircraft: '飞机',
  Building: '建筑', Guard: '警戒', Range: '范围', Damage: '伤害', Fire: '开火', Burst: '连发', Carrier: '航母', Drone: '无人机',
  Spawn: '生成', Special: '特殊', Normal: '普通', Small: '小型', Large: '大型', Heavy: '重型', Light: '轻型',
}

function camelTokens(value: string) {
  return value
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .flatMap(part => part.match(/[A-Z]+(?=[A-Z][a-z]|\d|$)|[A-Z]?[a-z]+|\d+/g) ?? [])
}

function guessAudioLabel(value: string) {
  const lower = value.toLowerCase()
  for (const [prefix, subject] of AUDIO_PREFIXES.slice().sort((a, b) => b[0].length - a[0].length)) {
    if (!lower.startsWith(prefix.toLowerCase())) continue
    const rest = value.slice(prefix.length)
    for (const [suffix, action] of AUDIO_SUFFIXES.slice().sort((a, b) => b[0].length - a[0].length)) {
      if (rest.toLowerCase() === suffix.toLowerCase()) return `${subject} · ${action}`
    }
  }
  return undefined
}

function guessTokenLabel(value: string) {
  const tokens = camelTokens(value)
  if (!tokens.length) return undefined
  const translated: string[] = []
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      translated.push(` ${token}`)
      continue
    }
    const label = TOKEN_ZH[token]
    if (!label) return undefined
    translated.push(label)
  }
  return translated.join('').trim() || undefined
}

export function localizedReferenceLabel(value: string, kind: ReferenceLabelKind = 'generic') {
  const raw = value.trim()
  if (!raw) return raw
  const direct = DIRECT_LABELS[raw.toLowerCase()]
  if (direct) return direct
  if (kind === 'audio') return guessAudioLabel(raw) ?? guessTokenLabel(raw) ?? raw
  return guessTokenLabel(raw) ?? raw
}
