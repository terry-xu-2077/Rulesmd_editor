import './app-ui-overrides.css'
import { createElement, type CSSProperties, type ReactNode } from 'react'
import {
  createOpenIcon,
  createSimpleIcon,
  createTileIconStyle,
  installOptionIconResolver,
  type SemanticIconKind,
  type TileIconSource,
  type VisualOptionIconDescriptor,
} from 'terry-react-ui-library'

/**
 * Rulesmd-specific icon registry.
 *
 * The rendering/generation engine lives in Terry_React_UI_Library. This file only owns
 * Red Alert 2 asset coordinates and the value -> semantic-icon mapping for this app.
 */

export type OpenIconKind = SemanticIconKind
export type { TileIconSource, VisualOptionIconDescriptor }
export { createOpenIcon, createSimpleIcon, createTileIconStyle }

export type VisualIconResolverOptions = {
  label?: string
  category?: string
  countryFallback?: boolean
  size?: number
}

type CachedIconEntry = {
  x: number
  y: number
  cellWidth: number
  cellHeight: number
  source?: 'custom' | 'mod' | string
  gameFile?: string
}

type CachedIconRegistry = {
  version?: number
  unitTile?: string
  countryTile?: string
  unit?: Record<string, CachedIconEntry>
  country?: Record<string, CachedIconEntry>
}

export const CUSTOM_ICON_CACHE_KEY = 'rulesmd.customIconCache'
export const RA2_ICON_TILE = '/game-assets/iconTile.jpg'
export const COUNTRY_ICON_TILE = '/game-assets/countryTile.png'
export const RA2_UNIT_ICON_CELL_WIDTH = 60
export const RA2_UNIT_ICON_CELL_HEIGHT = 48
export const RA2_COUNTRY_ICON_CELL_WIDTH = 60
export const RA2_COUNTRY_ICON_CELL_HEIGHT = 40
export const RA2_OPTION_ICON_WIDTH = 32
export const RA2_UNIT_ICON_ASPECT = RA2_UNIT_ICON_CELL_HEIGHT / RA2_UNIT_ICON_CELL_WIDTH
export const RA2_COUNTRY_ICON_ASPECT = RA2_COUNTRY_ICON_CELL_HEIGHT / RA2_COUNTRY_ICON_CELL_WIDTH

const ICON_POS: Record<string, [number, number]> = {
  ADOG:[0,0],AEGIS:[60,0],AMCV:[120,0],AmericanParaDropSpecial:[180,0],APOC:[240,0],ATESLA:[300,0],BEAG:[360,0],BFRT:[420,0],BORIS:[480,0],BRUTE:[540,0],
  BSUB:[0,48],CAOS:[60,48],CARRIER:[120,48],CCOMAND:[180,48],ChronoSphereSpecial:[240,48],CIVAN:[300,48],CLEG:[360,48],CMIN:[420,48],DESO:[480,48],DEST:[540,48],
  DISK:[0,96],DLPH:[60,96],DOG:[120,96],DRED:[180,96],DRON:[240,96],DTRUCK:[300,96],E1:[360,96],E2:[420,96],ENGINEER:[480,96],FLAKT:[540,96],
  ForceShieldSpecial:[0,144],FV:[60,144],GAAIRC:[120,144],GACNST:[180,144],GACSPH:[240,144],GADEPT:[300,144],GAFWLL:[360,144],GAGAP:[420,144],GAOREP:[480,144],GAPILE:[540,144],
  GAPILL:[0,192],GAPOWR:[60,192],GAREFN:[120,192],GAROBO:[180,192],GASPYSAT:[240,192],GATECH:[300,192],GAWALL:[360,192],GAWEAP:[420,192],GAWEAT:[480,192],GAYARD:[540,192],
  GeneticConverterSpecial:[0,240],GGI:[60,240],GHOST:[120,240],GTGCAN:[180,240],HARV:[240,240],HTK:[300,240],HTNK:[360,240],HYD:[420,240],INIT:[480,240],IronCurtainSpecial:[540,240],
  IVAN:[0,288],JUMPJET:[60,288],LCRF:[120,288],LightningStormSpecial:[180,288],LTNK:[240,288],LUNR:[300,288],MGTK:[360,288],MIND:[420,288],MTNK:[480,288],NABNKR:[540,288],
  NACLON:[0,336],NACNST:[60,336],NADEPT:[120,336],NAFLAK:[180,336],NAHAND:[240,336],NAINDP:[300,336],NAIRON:[360,336],NALASR:[420,336],NAMISL:[480,336],NANRCT:[540,336],
  NAPOWR:[0,384],NAPSIS:[60,384],NARADR:[120,384],NAREFN:[180,384],NASAM:[240,384],NATBNK:[300,384],NATECH:[360,384],NAWALL:[420,384],NAWEAP:[480,384],NAYARD:[540,384],
  NukeSpecial:[0,432],ORCA:[60,432],PCV:[120,432],PsychicDominatorSpecial:[180,432],PsychicRevealSpecial:[240,432],PTROOP:[300,432],ROBO:[360,432],SAPC:[420,432],SCHP:[480,432],SHAD:[540,432],
  SHK:[0,480],SMCV:[60,480],SNIPE:[120,480],SPY:[180,480],SpyPlaneSpecial:[240,480],SQD:[300,480],SREF:[360,480],SUB:[420,480],TANY:[480,480],TELE:[540,480],
  TERROR:[0,528],TESLA:[60,528],TNKD:[120,528],TTNK:[180,528],V3:[240,528],VIRUS:[300,528],YABRCK:[360,528],YACNST:[420,528],YAGGUN:[480,528],YAGNTC:[540,528],
  YAGRND:[0,576],YAPOWR:[60,576],YAPPET:[120,576],YAPSYT:[180,576],YAREFN:[240,576],YATECH:[300,576],YAWEAP:[360,576],YAYARD:[420,576],YHVR:[480,576],YTNK:[540,576],
  YURI:[0,624],YURIPR:[60,624],ZEP:[120,624],
}

// Mirrors RulesmdEditorWeb/js/countryTile.js cell order exactly.
const COUNTRY_ORDER = ['Confederation','French','Germans','British','Arabs','Alliance','Africans','Russians','Americans','YuriCountry'] as const

const SEMANTIC_VALUE_ICON: Record<string, SemanticIconKind> = {
  TECH: 'technology',
  TECHNOLOGY: 'technology',
  '科技类建筑': 'technology',
  BARRACKS: 'people',
  '兵营类建筑': 'people',
  POWER: 'power',
  '发电厂类建筑': 'power',
  FACTORY: 'factory',
  '工厂类建筑': 'factory',
  PROC: 'refinery',
  REFINERY: 'refinery',
  '矿厂类建筑': 'refinery',
  RADAR: 'radar',
  '雷达类建筑': 'radar',
  GDI: 'flag',
  NOD: 'flag',
  THIRDSIDE: 'flag',
}

function cachedRegistry(): CachedIconRegistry {
  try {
    const raw = localStorage.getItem(CUSTOM_ICON_CACHE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed as CachedIconRegistry : {}
  } catch {
    return {}
  }
}

function cachedEntry(rows: Record<string, CachedIconEntry> | undefined, id: string) {
  if (!rows) return undefined
  if (rows[id]) return rows[id]
  const folded = id.toLowerCase()
  const key = Object.keys(rows).find(value => value.toLowerCase() === folded)
  return key ? rows[key] : undefined
}

function cachedTileStyle(kind: 'unit' | 'country', id: string, size: number): CSSProperties | undefined {
  const cache = cachedRegistry()
  const rows = kind === 'unit' ? cache.unit : cache.country
  const image = kind === 'unit' ? cache.unitTile : cache.countryTile
  const entry = cachedEntry(rows, id)
  if (!entry || !image) return undefined
  const entries = Object.values(rows ?? {})
  const sheetWidth = Math.max(entry.cellWidth, ...entries.map(item => item.x + item.cellWidth))
  const sheetHeight = Math.max(entry.cellHeight, ...entries.map(item => item.y + item.cellHeight))
  return createTileIconStyle({
    image,
    x: entry.x,
    y: entry.y,
    cellWidth: entry.cellWidth,
    cellHeight: entry.cellHeight,
    sheetWidth,
    sheetHeight,
  }, size)
}

function semanticFrameHeight(kind: SemanticIconKind, width: number) {
  return width * (kind === 'flag' ? RA2_COUNTRY_ICON_ASPECT : RA2_UNIT_ICON_ASPECT)
}

function semanticGlyphSize(kind: SemanticIconKind, width: number) {
  return Math.max(14, Math.round(semanticFrameHeight(kind, width) * .62))
}

export function semanticIconKindForCategory(category: string): SemanticIconKind | undefined {
  const normalized = category.replace(/^Ares\s*·\s*/i, '').trim()
  if (/步兵/i.test(normalized)) return 'infantry'
  if (/载具|战车/i.test(normalized)) return 'vehicle'
  if (/飞机/i.test(normalized)) return 'aircraft'
  if (/超级武器|超武/i.test(normalized)) return 'superweapon'
  if (/建筑/i.test(normalized)) return 'building'
  if (/国家|阵营/i.test(normalized)) return 'flag'
  if (/武器/i.test(normalized)) return 'weapon'
  if (/弹头/i.test(normalized)) return 'warhead'
  if (/弹体|抛射/i.test(normalized)) return 'projectile'
  if (/声音|音频/i.test(normalized)) return 'audio'
  if (/碎片|残骸/i.test(normalized)) return 'debris'
  return undefined
}

export function categoryVisualIcon(category: string, width = RA2_OPTION_ICON_WIDTH): ReactNode | undefined {
  const kind = semanticIconKindForCategory(category)
  if (!kind) return undefined
  return createOpenIcon(kind, semanticGlyphSize(kind, width), '', {
    frameWidth: width,
    frameHeight: semanticFrameHeight(kind, width),
  })
}

export function unitIconStyle(id: string, size = 36): CSSProperties | undefined {
  const custom = cachedTileStyle('unit', id, size)
  if (custom) return custom
  const pos = ICON_POS[id]
  if (!pos) return undefined
  return createTileIconStyle({
    image: RA2_ICON_TILE,
    x: pos[0],
    y: pos[1],
    cellWidth: RA2_UNIT_ICON_CELL_WIDTH,
    cellHeight: RA2_UNIT_ICON_CELL_HEIGHT,
    sheetWidth: 600,
    sheetHeight: 672,
  }, size)
}

export function countryIconStyle(id: string, width = 32): CSSProperties | undefined {
  const custom = cachedTileStyle('country', id, width)
  if (custom) return custom
  const index = COUNTRY_ORDER.indexOf(id as typeof COUNTRY_ORDER[number])
  if (index < 0) return undefined
  const col = index % 5
  const row = Math.floor(index / 5)
  return createTileIconStyle({
    image: COUNTRY_ICON_TILE,
    x: col * RA2_COUNTRY_ICON_CELL_WIDTH,
    y: row * RA2_COUNTRY_ICON_CELL_HEIGHT,
    cellWidth: RA2_COUNTRY_ICON_CELL_WIDTH,
    cellHeight: RA2_COUNTRY_ICON_CELL_HEIGHT,
    sheetWidth: 300,
    sheetHeight: 80,
  }, width)
}

export function hasUnitIcon(id: string): boolean {
  const cache = cachedRegistry()
  return Boolean(cachedEntry(cache.unit, id) || ICON_POS[id])
}

export function semanticOpenIconKind(value: string): SemanticIconKind | undefined {
  return SEMANTIC_VALUE_ICON[value.trim().toUpperCase()]
}

export function resolveVisualIcon(value: string, options: VisualIconResolverOptions = {}): ReactNode | undefined {
  const size = options.size ?? RA2_OPTION_ICON_WIDTH
  const country = countryIconStyle(value, size)
  if (country) return createElement('span', { className: 'rulesCountryOptionIcon', style: country })

  const unit = unitIconStyle(value, size)
  if (unit) return createElement('span', { className: 'rulesUnitOptionIcon', style: unit })

  const semantic = semanticOpenIconKind(value)
  if (semantic) return createOpenIcon(semantic, semanticGlyphSize(semantic, size), '', {
    frameWidth: size,
    frameHeight: semanticFrameHeight(semantic, size),
  })

  if (options.category) {
    const categoryIcon = categoryVisualIcon(options.category, size)
    if (categoryIcon) return categoryIcon
  }

  if (options.countryFallback) return createSimpleIcon(options.label || value, { kind: 'flag', withElement: false, className: 'countryFallback' })
  return undefined
}

installOptionIconResolver((value: string) => {
  const country = countryIconStyle(value, RA2_OPTION_ICON_WIDTH)
  if (country) return { className: 'rulesCountryOptionIcon', style: country }

  const unit = unitIconStyle(value, RA2_OPTION_ICON_WIDTH)
  if (unit) return { className: 'rulesUnitOptionIcon', style: unit }

  const semantic = semanticOpenIconKind(value)
  if (semantic) return {
    node: createOpenIcon(semantic, semanticGlyphSize(semantic, RA2_OPTION_ICON_WIDTH), '', {
      frameWidth: RA2_OPTION_ICON_WIDTH,
      frameHeight: semanticFrameHeight(semantic, RA2_OPTION_ICON_WIDTH),
    }),
  }
  return undefined
})