export type NavigationSide = 'allied' | 'soviet' | 'yuri' | 'neutral'

type IniSection = Map<string, string>
type IniModel = Map<string, IniSection>

const CANONICAL_COUNTRY_SIDES: Record<string, NavigationSide> = {
  americans: 'allied',
  alliance: 'allied',
  french: 'allied',
  germans: 'allied',
  british: 'allied',
  africans: 'soviet',
  arabs: 'soviet',
  confederation: 'soviet',
  russians: 'soviet',
  yuricountry: 'yuri',
}

function splitValue(raw: string) {
  return raw.split(',').map(value => value.trim()).filter(Boolean)
}

function stripInlineComment(raw: string) {
  let quote = ''
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    if ((char === '"' || char === "'") && (!quote || quote === char)) quote = quote === char ? '' : char
    if (char === ';' && !quote) return raw.slice(0, index).trim()
  }
  return raw.trim()
}

function parseIni(raw: string): IniModel {
  const result: IniModel = new Map()
  let section = ''
  for (const sourceLine of raw.split(/\r?\n/)) {
    const line = sourceLine.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    const sectionMatch = line.match(/^\[([^\]]+)]/)
    if (sectionMatch) {
      section = sectionMatch[1].trim().toLowerCase()
      if (!result.has(section)) result.set(section, new Map())
      continue
    }
    if (!section) continue
    const equal = sourceLine.indexOf('=')
    if (equal < 0) continue
    const key = sourceLine.slice(0, equal).trim().toLowerCase()
    if (!key || key.startsWith(';') || key.startsWith('#')) continue
    const value = stripInlineComment(sourceLine.slice(equal + 1))
    result.get(section)!.set(key, value)
  }
  return result
}

function normalizeSide(value: string): NavigationSide | null {
  const key = value.trim().toLowerCase().replace(/\s+/g, '')
  if (['gdi', 'allied', 'allies', '盟军'].includes(key)) return 'allied'
  if (['nod', 'soviet', 'soviets', '苏军'].includes(key)) return 'soviet'
  if (['thirdside', 'yuri', '尤里'].includes(key)) return 'yuri'
  return null
}

function prefixFallback(section: string): NavigationSide | null {
  const key = section.trim().toUpperCase()
  if (key.startsWith('GA')) return 'allied'
  if (key.startsWith('NA')) return 'soviet'
  if (key.startsWith('YA')) return 'yuri'
  return null
}

export type RulesNavigation = {
  sideOf: (section: string) => NavigationSide
  exclusiveCountryOf: (section: string) => string | null
  countryIds: string[]
}

/**
 * Builds the navigation ownership model used by the left tree.
 *
 * The important bit mirrors the old Qt editor: if a Techno has no useful direct
 * Owner/RequiredHouses, its Prerequisite chain is followed until a faction-owned
 * building is found. This is why buildings such as GACSPH and YAGRND no longer fall
 * into the neutral bucket just because the final section omits Owner=.
 */
export function buildRulesNavigation(raw: string): RulesNavigation {
  const ini = parseIni(raw)
  const countryIds = splitValueFromRegistry(ini.get('countries'))
  const countryCase = new Map(countryIds.map(country => [country.toLowerCase(), country]))
  const countrySides = new Map<string, NavigationSide>(Object.entries(CANONICAL_COUNTRY_SIDES))

  const sides = ini.get('sides')
  if (sides) {
    for (const [sideName, value] of sides.entries()) {
      const side = normalizeSide(sideName)
      if (!side) continue
      for (const country of splitValue(value)) countrySides.set(country.toLowerCase(), side)
    }
  }

  for (const country of countryIds) {
    const data = ini.get(country.toLowerCase())
    const side = data ? normalizeSide(data.get('side') ?? '') : null
    if (side) countrySides.set(country.toLowerCase(), side)
  }

  const countriesPerSide = new Map<NavigationSide, number>()
  for (const country of countryIds) {
    const side = countrySides.get(country.toLowerCase())
    if (side) countriesPerSide.set(side, (countriesPerSide.get(side) ?? 0) + 1)
  }

  const knownCountry = (token: string) => {
    const folded = token.trim().toLowerCase()
    return countryCase.get(folded) ?? (countrySides.has(folded) ? token.trim() : null)
  }

  const sideMemo = new Map<string, NavigationSide>()
  const resolving = new Set<string>()

  const sideOf = (section: string): NavigationSide => {
    const folded = section.trim().toLowerCase()
    if (!folded) return 'neutral'
    const cached = sideMemo.get(folded)
    if (cached) return cached
    const countrySide = countrySides.get(folded)
    if (countrySide) {
      sideMemo.set(folded, countrySide)
      return countrySide
    }
    if (resolving.has(folded)) return 'neutral'
    resolving.add(folded)

    const data = ini.get(folded)
    if (data) {
      for (const key of ['requiredhouses', 'owner']) {
        const rawValue = data.get(key) ?? ''
        const sidesFound = new Set<NavigationSide>()
        for (const token of splitValue(rawValue)) {
          const side = countrySides.get(token.toLowerCase())
          if (side) sidesFound.add(side)
        }
        if (sidesFound.size === 1) {
          const side = [...sidesFound][0]
          resolving.delete(folded)
          sideMemo.set(folded, side)
          return side
        }
        if (sidesFound.size > 1) {
          resolving.delete(folded)
          sideMemo.set(folded, 'neutral')
          return 'neutral'
        }
      }

      const prerequisiteValues: string[] = []
      for (const [key, value] of data.entries()) {
        if (key === 'prerequisite' || /^prerequisite\.list\d+$/i.test(key)) prerequisiteValues.push(value)
      }
      const inherited = new Set<NavigationSide>()
      for (const value of prerequisiteValues) {
        for (const token of splitValue(value)) {
          if (!ini.has(token.toLowerCase())) continue
          const side = sideOf(token)
          if (side !== 'neutral') inherited.add(side)
        }
      }
      if (inherited.size === 1) {
        const side = [...inherited][0]
        resolving.delete(folded)
        sideMemo.set(folded, side)
        return side
      }
    }

    const fallback = prefixFallback(section) ?? 'neutral'
    resolving.delete(folded)
    sideMemo.set(folded, fallback)
    return fallback
  }

  // SuperWeaponTypes inherit the side of buildings that provide them.
  for (const [section, data] of ini.entries()) {
    const providerSide = sideOf(section)
    if (providerSide === 'neutral') continue
    for (const key of ['superweapon', 'superweapon2', 'superweapons']) {
      for (const target of splitValue(data.get(key) ?? '')) {
        const folded = target.toLowerCase()
        if (!sideMemo.has(folded)) sideMemo.set(folded, providerSide)
      }
    }
  }

  const exclusiveCountryOf = (section: string): string | null => {
    const data = ini.get(section.trim().toLowerCase())
    if (!data) return null
    for (const key of ['requiredhouses', 'owner']) {
      const countries = splitValue(data.get(key) ?? '')
        .map(knownCountry)
        .filter((value): value is string => Boolean(value))
      const unique = [...new Map(countries.map(value => [value.toLowerCase(), value])).values()]
      if (unique.length === 1) {
        const registered = countryCase.get(unique[0].toLowerCase())
        if (!registered) return null
        const side = countrySides.get(registered.toLowerCase())
        if (!side || (countriesPerSide.get(side) ?? 0) <= 1) return null
        return registered
      }
      if (unique.length > 1) return null
    }
    return null
  }

  return { sideOf, exclusiveCountryOf, countryIds }
}

function splitValueFromRegistry(section: IniSection | undefined) {
  if (!section) return []
  const values: string[] = []
  for (const value of section.values()) {
    const token = value.split(';', 1)[0].trim()
    if (token) values.push(token)
  }
  return values
}
