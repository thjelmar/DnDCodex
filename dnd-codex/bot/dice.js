// Dice rolling for the /roll command.
//
// Mirrors src/lib/dice.ts (same expression grammar and limits) so a roll in
// Discord behaves like one in the app. It is plain JavaScript because the bot is
// its own Node package and can't import the app's TypeScript.

const MAX_DICE = 100
const MAX_SIDES = 1000
// Discord rejects messages over 2000 characters; stay well under.
const MAX_MESSAGE = 1800

const rollOne = (sides, rng) => Math.floor(rng() * sides) + 1

/**
 * Parses and rolls an expression like "2d6+3", "d20+5", or "1d8+1d6-1".
 * With mode 'advantage' or 'disadvantage', every single d20 rolls twice and keeps
 * the higher or lower result.
 * Returns null when the input isn't a valid expression.
 */
export function rollExpression(input, { mode = 'normal', rng = Math.random } = {}) {
  const expr = String(input).replace(/\s+/g, '').toLowerCase()
  if (!expr) return null

  const tokenRe = /([+-]?)(\d*d\d+|\d+)/g
  const terms = []
  let total = 0
  let consumed = ''
  let m

  while ((m = tokenRe.exec(expr)) !== null) {
    consumed += m[0]
    const sign = m[1] === '-' ? -1 : 1
    const dice = /^(\d*)d(\d+)$/.exec(m[2])

    if (!dice) {
      const value = parseInt(m[2], 10) * sign
      terms.push({ label: `${value >= 0 ? '+' : ''}${value}`, rolls: [], subtotal: value })
      total += value
      continue
    }

    const count = dice[1] ? parseInt(dice[1], 10) : 1
    const sides = parseInt(dice[2], 10)
    if (count < 1 || count > MAX_DICE || sides < 1 || sides > MAX_SIDES) return null

    if (mode !== 'normal' && count === 1 && sides === 20) {
      const rolls = [rollOne(20, rng), rollOne(20, rng)]
      const keptIndex =
        mode === 'advantage' ? (rolls[0] >= rolls[1] ? 0 : 1) : rolls[0] <= rolls[1] ? 0 : 1
      const subtotal = rolls[keptIndex] * sign
      terms.push({ label: `${sign < 0 ? '-' : ''}2d20 (${mode === 'advantage' ? 'adv' : 'dis'})`, rolls, subtotal, keptIndex })
      total += subtotal
      continue
    }

    const rolls = Array.from({ length: count }, () => rollOne(sides, rng))
    const subtotal = rolls.reduce((a, b) => a + b, 0) * sign
    terms.push({ label: `${sign < 0 ? '-' : ''}${count}d${sides}`, rolls, subtotal })
    total += subtotal
  }

  // Reject anything with leftover or invalid characters.
  if (consumed !== expr || terms.length === 0) return null
  return { expression: String(input).trim(), total, terms }
}

/** Escapes Discord Markdown so a display name can't restyle the message. */
export function escapeMarkdown(text) {
  return String(text).replace(/[\\*_~`|>]/g, '\\$&')
}

function termText(term) {
  if (term.rolls.length === 0) return term.label
  const shown = term.rolls.map((r, i) => (term.keptIndex === undefined || i === term.keptIndex ? `${r}` : `~~${r}~~`))
  return `${term.label.startsWith('-') ? '-' : ''}[${shown.join(', ')}]`
}

/** The message the bot posts, for example: 🎲 **Sam** rolled `2d6+3`: [4, 5] +3 = **12** */
export function formatRoll(result, who) {
  const head = `🎲 **${escapeMarkdown(who)}** rolled \`${result.expression}\``
  const detailed = `${head}: ${result.terms.map(termText).join(' ')} = **${result.total}**`
  // A hundred dice or many terms can run long; fall back to the total alone.
  return detailed.length <= MAX_MESSAGE ? detailed : `${head} = **${result.total}**`
}
