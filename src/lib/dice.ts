// Pure dice-rolling logic. Kept free of UI so it's easy to reason about and
// could be unit-tested. Randomness uses Math.random (fine in the browser).

export interface RollTerm {
  /** Human label, e.g. "3d6", "2d20 (adv)", "+2". */
  label: string
  /** Individual die results (empty for a flat modifier). */
  rolls: number[]
  /** This term's signed contribution to the total. */
  subtotal: number
  /** For advantage/disadvantage: the index within `rolls` that counted. */
  keptIndex?: number
}

export interface RollResult {
  /** The expression that was rolled, e.g. "2d6+3" or "d20 adv +5". */
  expression: string
  total: number
  terms: RollTerm[]
  /** Epoch millis; stamped by the caller so this module stays deterministic-ish. */
  at: number
}

export type RollMode = 'normal' | 'advantage' | 'disadvantage'

/** A single die result in 1..sides. */
function rollOne(sides: number): number {
  return Math.floor(Math.random() * sides) + 1
}

export function rollDice(count: number, sides: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) out.push(rollOne(sides))
  return out
}

function modifierTerm(modifier: number): RollTerm[] {
  if (!modifier) return []
  return [{ label: `${modifier > 0 ? '+' : ''}${modifier}`, rolls: [], subtotal: modifier }]
}

/**
 * Rolls `count` dice of `sides`, plus a flat modifier. When mode is advantage /
 * disadvantage AND it's a single d20, rolls twice and keeps the higher / lower.
 */
export function quickRoll(
  count: number,
  sides: number,
  modifier: number,
  mode: RollMode,
  at: number,
): RollResult {
  const useAdv = mode !== 'normal' && sides === 20 && count === 1

  if (useAdv) {
    const rolls = [rollOne(20), rollOne(20)]
    const keptIndex =
      mode === 'advantage'
        ? rolls[0] >= rolls[1] ? 0 : 1
        : rolls[0] <= rolls[1] ? 0 : 1
    const kept = rolls[keptIndex]
    const terms: RollTerm[] = [
      { label: `2d20 (${mode === 'advantage' ? 'adv' : 'dis'})`, rolls, subtotal: kept, keptIndex },
      ...modifierTerm(modifier),
    ]
    return {
      expression: `d20 ${mode === 'advantage' ? 'adv' : 'dis'}${modifier ? ` ${modifier > 0 ? '+' : ''}${modifier}` : ''}`,
      total: kept + modifier,
      terms,
      at,
    }
  }

  const rolls = rollDice(count, sides)
  const sub = rolls.reduce((a, b) => a + b, 0)
  return {
    expression: `${count}d${sides}${modifier ? `${modifier > 0 ? '+' : ''}${modifier}` : ''}`,
    total: sub + modifier,
    terms: [{ label: `${count}d${sides}`, rolls, subtotal: sub }, ...modifierTerm(modifier)],
    at,
  }
}

/**
 * Parses and rolls a dice expression like "2d6+3", "d20+5", "1d8+1d6-1".
 * Returns null if the whole string isn't a valid expression.
 */
export function rollExpression(input: string, at: number): RollResult | null {
  const expr = input.replace(/\s+/g, '').toLowerCase()
  if (!expr) return null

  const tokenRe = /([+-]?)(\d*d\d+|\d+)/g
  const terms: RollTerm[] = []
  let total = 0
  let consumed = ''
  let m: RegExpExecArray | null

  while ((m = tokenRe.exec(expr)) !== null) {
    consumed += m[0]
    const sign = m[1] === '-' ? -1 : 1
    const body = m[2]
    const dm = /^(\d*)d(\d+)$/.exec(body)
    if (dm) {
      const count = dm[1] ? parseInt(dm[1], 10) : 1
      const sides = parseInt(dm[2], 10)
      if (count < 1 || count > 100 || sides < 1 || sides > 1000) return null
      const rolls = rollDice(count, sides)
      const subtotal = rolls.reduce((a, b) => a + b, 0) * sign
      terms.push({ label: `${sign < 0 ? '-' : ''}${count}d${sides}`, rolls, subtotal })
      total += subtotal
    } else {
      const val = parseInt(body, 10) * sign
      terms.push({ label: `${val >= 0 ? '+' : ''}${val}`, rolls: [], subtotal: val })
      total += val
    }
  }

  // Reject anything with leftover / invalid characters.
  if (consumed !== expr || terms.length === 0) return null
  return { expression: input.trim(), total, terms, at }
}
