import type { CSSProperties, ReactNode } from 'react'
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

export const LEGACY_ICON_TILE = '/legacy/iconTile.jpg'
export const LEGACY_COUNTRY_TILE = '/legacy/countryTile.png'

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

export function legacyIconStyle(id: string, size = 36): CSSProperties | undefined {
  const pos = ICON_POS[id]
  if (!pos) return undefined
  return createTileIconStyle({
    image: LEGACY_ICON_TILE,
    x: pos[0],
    y: pos[1],
    cellWidth: 60,
    cellHeight: 48,
    sheetWidth: 600,
    sheetHeight: 672,
  }, size)
}

export function countryIconStyle(id: string, width = 32): CSSProperties | undefined {
  const index = COUNTRY_ORDER.indexOf(id as typeof COUNTRY_ORDER[number])
  if (index < 0) return undefined
  const col = index % 5
  const row = Math.floor(index / 5)
  return createTileIconStyle({
    image: LEGACY_COUNTRY_TILE,
    x: col * 60,
    y: row * 40,
    cellWidth: 60,
    cellHeight: 40,
    sheetWidth: 300,
    sheetHeight: 80,
  }, width)
}

export function hasLegacyIcon(id: string): boolean {
  return Boolean(ICON_POS[id])
}

export function semanticOpenIconKind(value: string): SemanticIconKind | undefined {
  return SEMANTIC_VALUE_ICON[value.trim().toUpperCase()]
}

export function resolveVisualIcon(value: string, options: VisualIconResolverOptions = {}): ReactNode | undefined {
  const size = options.size ?? 32
  const country = countryIconStyle(value, size)
  if (country) return <span className="rulesCountryOptionIcon" style={country}/>

  const unit = legacyIconStyle(value, size)
  if (unit) return <span className="rulesUnitOptionIcon" style={unit}/>

  const semantic = semanticOpenIconKind(value)
  if (semantic) return createOpenIcon(semantic, Math.max(14, Math.round(size * .48)))

  if (options.countryFallback) return createSimpleIcon(options.label || value, { kind: 'flag', withElement: false, className: 'countryFallback' })
  return undefined
}

installOptionIconResolver((value: string) => {
  const country = countryIconStyle(value)
  if (country) return { className: 'rulesCountryOptionIcon', style: country }

  const unit = legacyIconStyle(value, 32)
  if (unit) return { className: 'rulesUnitOptionIcon', style: unit }

  const semantic = semanticOpenIconKind(value)
  if (semantic) return { node: createOpenIcon(semantic, 15) }
  return undefined
})
