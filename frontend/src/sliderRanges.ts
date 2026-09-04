export type SliderRange = {
  min: number
  max: number
  step: number
  suffix: string
}

type RangeSpec = Omit<SliderRange, 'suffix'>

/*
 * Slider tracks are editing conveniences, not validation boundaries.
 *
 * RED LINE:
 * - Never derive min/max by multiplying the current value.
 * - A Key must resolve to the same track range regardless of its current value.
 * - Manual numeric input may intentionally exceed the track range.
 * - Numeric precision is independent from track range. A floating-point rule must not
 *   become an integer merely because its semantic range uses an integer-sized domain.
 *
 * Exact Key rules win first. Families are only fallbacks for numeric Keys that share
 * well-known Rules/Ares semantics. Add a new exact rule whenever a Key needs a more
 * useful domain-specific range.
 */
const EXACT_RULES: Record<string, RangeSpec> = {
  // TechnoType core geometry / movement.
  size: { min: 0, max: 20, step: 1 },
  sight: { min: 0, max: 30, step: 1 },
  sensorssight: { min: 0, max: 30, step: 1 },
  speed: { min: 0, max: 30, step: 1 },
  flightlevel: { min: 0, max: 2000, step: 10 },
  threatposed: { min: 0, max: 100, step: 1 },
  passengers: { min: 0, max: 20, step: 1 },
  ammo: { min: -1, max: 20, step: 1 },

  // Durability / economy.
  strength: { min: 0, max: 5000, step: 1 },
  cost: { min: 0, max: 10000, step: 10 },
  soylent: { min: 0, max: 10000, step: 10 },
  bountyvalue: { min: 0, max: 10000, step: 10 },
  'bounty.value': { min: 0, max: 10000, step: 10 },
  'buildtime.cost': { min: 0, max: 10000, step: 10 },

  // Weapon-style numeric fields.
  damage: { min: 0, max: 2000, step: 1 },
  rof: { min: 0, max: 600, step: 1 },
  range: { min: 0, max: 30, step: 0.25 },
  minimumrange: { min: 0, max: 30, step: 0.25 },
  burst: { min: 1, max: 20, step: 1 },

  // Common experience / multiplier values.
  veteranratio: { min: 0, max: 10, step: 0.05 },
  veteranfactor: { min: 0, max: 5, step: 0.01 },
  elitefactor: { min: 0, max: 5, step: 0.01 },

  // Ares high-frequency fields.
  'attacheffect.duration': { min: -1, max: 1800, step: 1 },
  'attacheffect.delay': { min: 0, max: 1800, step: 1 },
  'attacheffect.initialdelay': { min: 0, max: 1800, step: 1 },
  'attacheffect.speedmultiplier': { min: 0, max: 5, step: 0.01 },
  'attacheffect.armormultiplier': { min: 0, max: 5, step: 0.01 },
  'attacheffect.firepowermultiplier': { min: 0, max: 5, step: 0.01 },
  'attacheffect.rofmultiplier': { min: 0, max: 5, step: 0.01 },
  'emp.duration': { min: -600, max: 1800, step: 1 },
  'emp.cap': { min: -1, max: 1800, step: 1 },
  'emp.modifier': { min: 0, max: 300, step: 1 },
  'buildtime.speed': { min: 0, max: 5, step: 0.01 },
  'academy.infantryveterancy': { min: 0, max: 2, step: 0.05 },
  'academy.aircraftveterancy': { min: 0, max: 2, step: 0.05 },
  'academy.vehicleveterancy': { min: 0, max: 2, step: 0.05 },
  'academy.buildingveterancy': { min: 0, max: 2, step: 0.05 },
}

const FAMILY_RULES: Array<{ test: RegExp; range: RangeSpec }> = [
  // Spatial values are usually cells or cell-like radii.
  { test: /(?:range|radius|cellspread)$/i, range: { min: 0, max: 30, step: 0.25 } },
  { test: /sight$/i, range: { min: 0, max: 30, step: 1 } },
  { test: /speed$/i, range: { min: 0, max: 30, step: 1 } },

  // Economy / health families.
  { test: /(?:strength|health)$/i, range: { min: 0, max: 5000, step: 1 } },
  { test: /(?:cost|soylent|bounty)$/i, range: { min: 0, max: 10000, step: 10 } },

  // Weapon / timing families.
  { test: /damage$/i, range: { min: 0, max: 2000, step: 1 } },
  { test: /(?:rof|delay|duration|reload|rearm|time)$/i, range: { min: 0, max: 1800, step: 1 } },

  // Multiplier-like values should have a useful fine-grained track around normal 1.0.
  { test: /(?:multiplier|modifier|factor|bonus)$/i, range: { min: 0, max: 5, step: 0.01 } },
]

// Keep the finest precision ever observed for a Key during the session. This matters
// because after the first drag a value such as .016 may become .017; recomputing from a
// rounded intermediate value must never widen the step back to 0.01 or 1.
const PRECISION_STEP_BY_KEY = new Map<string, number>()

function suffixFor(value: string) {
  return value.trim().endsWith('%') ? '%' : ''
}

function precisionStepFrom(value: string, valueType: string): number | null {
  const raw = value.trim().replace(/%$/, '')
  const exponent = raw.match(/[eE]([+-]?\d+)$/)
  if (exponent) {
    const exp = Number.parseInt(exponent[1], 10)
    if (Number.isFinite(exp) && exp < 0) return Math.max(1e-6, 10 ** exp)
  }

  const decimal = raw.match(/\.([0-9]+)/)
  if (decimal) {
    return Math.max(1e-6, 10 ** -Math.min(decimal[1].length, 6))
  }

  if (/float|double|decimal/i.test(valueType)) return 0.01
  return null
}

function preserveNumericPrecision(key: string, baseStep: number, value: string, valueType: string) {
  const observed = precisionStepFrom(value, valueType)
  const previous = PRECISION_STEP_BY_KEY.get(key)
  const finest = observed == null
    ? previous
    : previous == null ? observed : Math.min(previous, observed)
  if (finest == null) return baseStep
  const step = Math.min(baseStep, finest)
  PRECISION_STEP_BY_KEY.set(key, step)
  return step
}

function withPrecision(key: string, range: RangeSpec, value: string, valueType: string): RangeSpec {
  return { ...range, step: preserveNumericPrecision(key, range.step, value, valueType) }
}

function fallbackRange(value: string, valueType: string): RangeSpec {
  // Percent is a representation rule, not a current-value-derived scale.
  if (value.trim().endsWith('%') || valueType.toLowerCase() === 'percent') {
    return { min: 0, max: 100, step: value.includes('.') ? 0.01 : 1 }
  }

  // Unknown numeric Keys still use fixed, predictable ranges. The current magnitude
  // never expands/shrinks the track; users can type outside these convenience bounds.
  if (value.includes('.') || /float|double|decimal/i.test(valueType)) {
    return { min: 0, max: 10, step: 0.01 }
  }
  return { min: 0, max: 100, step: 1 }
}

export function sliderRangeFor(key: string, value: string, valueType = ''): SliderRange {
  const normalized = key.trim().toLowerCase()
  const exact = EXACT_RULES[normalized]
  if (exact) return { ...withPrecision(normalized, exact, value, valueType), suffix: suffixFor(value) }

  if (value.trim().endsWith('%') || valueType.toLowerCase() === 'percent') {
    const range = fallbackRange(value, valueType)
    return { ...withPrecision(normalized, range, value, valueType), suffix: suffixFor(value) }
  }

  const family = FAMILY_RULES.find(rule => rule.test.test(normalized))
  if (family) return { ...withPrecision(normalized, family.range, value, valueType), suffix: suffixFor(value) }

  const range = fallbackRange(value, valueType)
  return { ...withPrecision(normalized, range, value, valueType), suffix: suffixFor(value) }
}
