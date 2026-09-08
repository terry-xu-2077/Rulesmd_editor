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

  // Common Warhead ids.
  ap: '穿甲弹头', he: '高爆弹头', hollowpoint: '空尖弹头', hollowpoint2: '强化空尖弹头',
  flakwh: '防空弹头', flaktwh: '防空炮塔弹头', samwh: '防空导弹弹头', c4warhead: 'C4 弹头',
  terrorbombwh: '恐怖炸弹弹头', radbeamwarhead: '辐射射线弹头', nuke: '核爆弹头',
  demobombwh: '自爆炸弹弹头', controller: '心灵控制弹头', psipulse: '心灵脉冲弹头', superpsipulse: '超级心灵脉冲弹头',

  // Common Projectile ids.
  invisible: '隐形弹体', invisiblelow: '低空隐形弹体', invisiblehigh: '高空隐形弹体',
  ballistic: '弹道弹体', cannon: '炮弹', smallmissile: '小型导弹', largemissile: '大型导弹',
  heatseeker: '热源追踪弹体', aaheatseeker: '防空热源追踪弹体', aaheatseeker2: '防空热源追踪弹体 2',
  torpedo: '鱼雷', flakproj: '防空弹体', v3rocket: 'V3 火箭弹',

  // High-frequency generic audio ids in vanilla/YR rules.
  genvehicledie: '通用载具 · 摧毁音效', infantrysquish: '步兵 · 被碾压音效', tankcrush: '坦克 · 碾压音效',
  placebuilding: '建筑 · 放置音效', mcvmovestart: '机动基地车 · 移动音效', mcvsovietselect: '苏联机动基地车 · 选择语音',
  mcvsovietmove: '苏联机动基地车 · 移动语音', mcvyuriselect: '尤里机动基地车 · 选择语音', mcvyurimove: '尤里机动基地车 · 移动语音',
  initiateselect: '尤里新兵 · 选择语音', initiatemove: '尤里新兵 · 移动语音', initiateattackcommand: '尤里新兵 · 攻击语音',
  initiatefear: '尤里新兵 · 受惊语音', initiatedie: '尤里新兵 · 死亡音效', apocalypsemovestart: '天启坦克 · 移动音效',
}

// Longest-prefix match. This keeps technical audio ids readable without changing values.
const AUDIO_PREFIXES: Array<[string, string]> = [
  ['ChronoLegionnaire', '超时空军团兵'], ['GuardianGI', '重装大兵'], ['BlackEagle', '黑鹰战机'], ['BattleFortress', '战斗要塞'],
  ['MasterMind', '精神控制车'], ['GattlingTank', '盖特坦克'], ['Magnetron', '磁电坦克'], ['CrazyIvan', '疯狂伊文'],
  ['Rocketeer', '火箭飞行兵'], ['Apocalypse', '天启坦克'], ['Dreadnought', '无畏级战舰'], ['SeaScorpion', '海蝎'],
  ['TerrorDrone', '恐怖机器人'], ['FlakTrack', '防空履带车'], ['ChronoMiner', '超时空采矿车'], ['RobotTank', '遥控坦克'],
  ['Destroyer', '驱逐舰'], ['AircraftCarrier', '航空母舰'], ['Carrier', '航空母舰'], ['Typhoon', '台风级潜艇'],
  ['Initiate', '尤里新兵'], ['Conscript', '动员兵'], ['Tesla', '磁爆步兵'], ['Flak', '防空步兵'], ['Terrorist', '恐怖分子'],
  ['Desolator', '辐射工兵'], ['Engineer', '工程师'], ['Sniper', '狙击手'], ['Boris', '鲍里斯'], ['Tanya', '谭雅'],
  ['Virus', '病毒狙击手'], ['Brute', '狂兽人'], ['Slave', '奴隶'], ['YuriPrime', '尤里X'], ['Yuri', '尤里'],
  ['Grizzly', '灰熊坦克'], ['Rhino', '犀牛坦克'], ['Prism', '光棱坦克'], ['Mirage', '幻影坦克'], ['Lasher', '狂风坦克'],
  ['Kirov', '基洛夫空艇'], ['Harrier', '入侵者战机'], ['Dolphin', '海豚'], ['Squid', '巨型乌贼'], ['Boomer', '雷鸣攻击潜艇'],
  ['IFV', '多功能步兵车'], ['SEAL', '海豹部队'], ['Spy', '间谍'], ['GI', '美国大兵'],
  ['MCVSoviet', '苏联机动基地车'], ['MCVYuri', '尤里机动基地车'], ['MCVAllied', '盟军机动基地车'], ['Chrono', '超时空单位'],
]

const AUDIO_SUFFIXES: Array<[string, string]> = [
  ['AttackCommand', '攻击语音'], ['SpecialAttack', '特殊攻击语音'], ['MoveStart', '移动音效'], ['Select', '选择语音'],
  ['Move', '移动语音'], ['Attack', '攻击语音'], ['Fear', '受惊语音'], ['Feedback', '反馈语音'], ['Created', '建造完成语音'],
  ['Ready', '就绪语音'], ['Deploy', '部署音效'], ['Undeploy', '解除部署音效'], ['Enter', '进入音效'], ['Leave', '离开音效'],
  ['Capture', '占领音效'], ['Repair', '维修音效'], ['Build', '建造音效'], ['Sell', '出售音效'], ['PowerDown', '断电音效'],
  ['PowerUp', '恢复供电音效'], ['Online', '上线音效'], ['Offline', '离线音效'], ['Crushed', '被碾压音效'],
  ['Die', '死亡音效'], ['Crush', '碾压音效'], ['Fire', '开火音效'], ['Start', '启动音效'], ['Stop', '停止音效'],
]

// Conservative vocabulary for PascalCase/CamelCase technical IDs. We only emit a guessed
// Chinese label when every word is known; an unknown token keeps the original ID intact.
const TOKEN_ZH: Record<string, string> = {
  Default: '默认', Death: '死亡', Weapon: '武器', Elite: '精英', Primary: '主武器', Secondary: '副武器',
  Oil: '油井', Barrel: '油桶', Explosion: '爆炸', Terror: '恐怖分子', Bomb: '炸弹', Mini: '迷你', Gun: '枪',
  Bazooka: '火箭筒', Psychic: '心灵', Psi: '心灵', Pulse: '脉冲', Jab: '冲击', UC: '驻军', Virus: '病毒', Mind: '心灵', Control: '控制',
  Controller: '控制', Super: '超级', Rad: '辐射', Beam: '射线', Eruption: '爆发', Cannon: '火炮', Jump: '跳跃', Punch: '重拳',
  Smash: '猛击', Flare: '信号弹', Shovel: '铁锹', Sound: '音效', Voice: '语音', Attack: '攻击', Move: '移动',
  Select: '选择', Die: '死亡', Deploy: '部署', Report: '开火音效', Projectile: '弹体', Proj: '弹体', Warhead: '弹头', WH: '弹头', Debris: '残骸',
  Blimp: '飞艇', Effect: '效果', Assault: '突击', Raider: '突袭', Vulcan: '火神炮', Tower: '炮塔', Harpy: '哈比', Claw: '爪',
  Tank: '坦克', Rocket: '火箭', Missile: '导弹', Laser: '激光', Tesla: '磁暴', Flak: '防空', Prism: '光棱', Chrono: '超时空',
  Para: '空降', Drop: '投放', Air: '空中', Strike: '打击', Naval: '海军', Infantry: '步兵', Vehicle: '载具', Aircraft: '飞机',
  Building: '建筑', Guard: '警戒', Range: '范围', Damage: '伤害', Fire: '开火', Burst: '连发', Carrier: '航母', Drone: '无人机',
  Spawn: '生成', Special: '特殊', Normal: '普通', Small: '小型', Large: '大型', Heavy: '重型', Light: '轻型',
  AP: '穿甲', HE: '高爆', AA: '防空', EMP: '电磁脉冲', C4: 'C4', Hollow: '空尖', Point: '',
  Invisible: '隐形', Low: '低空', High: '高空', Heat: '热源', Seeker: '追踪', Torpedo: '鱼雷', Ballistic: '弹道',
  Shell: '炮弹', Bullet: '子弹', Straight: '直射', Arcing: '抛物线', Nuke: '核爆', Demo: '自爆',
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
    if (label == null) return undefined
    translated.push(label)
  }
  return translated.join('').trim() || undefined
}

function guessTypedLabel(value: string, kind: ReferenceLabelKind) {
  const guessed = guessTokenLabel(value)
  if (!guessed) return undefined
  if (kind === 'warhead') return guessed.endsWith('弹头') ? guessed : `${guessed}弹头`
  if (kind === 'projectile') return guessed.endsWith('弹体') || /(?:导弹|火箭|鱼雷|炮弹|子弹)$/.test(guessed) ? guessed : `${guessed}弹体`
  return guessed
}

export function localizedReferenceLabel(value: string, kind: ReferenceLabelKind = 'generic') {
  const raw = value.trim()
  if (!raw) return raw
  const direct = DIRECT_LABELS[raw.toLowerCase()]
  if (direct) return direct
  if (kind === 'audio') return guessAudioLabel(raw) ?? guessTokenLabel(raw) ?? raw
  if (kind === 'warhead' || kind === 'projectile') return guessTypedLabel(raw, kind) ?? raw
  return guessTokenLabel(raw) ?? raw
}
