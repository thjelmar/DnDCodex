import { rollDice } from './dice'
import { FOES, HEROES, type DuelAttack, type Duelist } from '../data/duelists'

// Daily Duel (T-63): a Wordle-style 1v1 that is the same for everyone each UTC
// day. The matchup is derived from the date (no server); dice are free. Pure
// logic only — it never touches the shared combat tracker store (codex.combat),
// Dexie, or Supabase, so it is safe in any context and trivially testable.

/** Safety cap so a stalemate (both sides whiffing) still ends. */
export const MAX_ROUNDS = 12

// ── Seeding ──────────────────────────────────────────────────────────────────

/** The UTC calendar day as `YYYY-MM-DD` — the seed for the daily matchup. */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** FNV-1a string hash → 32-bit unsigned seed. */
function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32: small, fast seeded PRNG returning [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Matchup {
  day: string
  hero: Duelist
  foe: Duelist
}

/** Today's hero and opponent — identical for everyone on the same UTC day. */
export function dailyMatchup(day: string): Matchup {
  const rand = mulberry32(hashString(`dnd-codex-daily-duel:${day}`))
  const hero = HEROES[Math.floor(rand() * HEROES.length)]
  const foe = FOES[Math.floor(rand() * FOES.length)]
  return { day, hero, foe }
}

// ── State ────────────────────────────────────────────────────────────────────

export type Side = 'hero' | 'foe'
export type Outcome = 'playing' | 'won' | 'lost' | 'stalemate'

export interface LogEntry {
  round: number
  side: Side
  kind: 'hit' | 'crit' | 'miss' | 'fumble' | 'info'
  text: string
  damage?: number
}

export interface DuelState {
  day: string
  heroId: string
  foeId: string
  heroHp: number
  foeHp: number
  round: number
  /** Whose turn it is. Always `hero` while the player can act. */
  turn: Side
  actionUsed: boolean
  bonusUsed: boolean
  outcome: Outcome
  /** Total damage the hero dealt / took, for the share summary. */
  dealt: number
  taken: number
  /** One entry per attack roll: the shareable play-by-play grid. */
  grid: GridCell[]
  log: LogEntry[]
}

/** A compact result for one attack, used for the emoji share grid. */
export type GridCell = 'H' | 'C' | 'M' | 'h' | 'c' | 'm'
// Uppercase = the hero's attack; lowercase = the foe's. H hit, C crit, M miss.

function byId(list: Duelist[], id: string): Duelist {
  const d = list.find((x) => x.id === id)
  if (!d) throw new Error(`Unknown duelist ${id}`)
  return d
}

export function heroOf(s: DuelState): Duelist {
  return byId(HEROES, s.heroId)
}
export function foeOf(s: DuelState): Duelist {
  return byId(FOES, s.foeId)
}

// ── Rolling ──────────────────────────────────────────────────────────────────

/** Parses "1d8+4+3d6" into dice groups and a flat modifier. */
export function parseDamage(expr: string): { dice: [number, number][]; flat: number } {
  const dice: [number, number][] = []
  let flat = 0
  for (const m of expr.replace(/\s+/g, '').matchAll(/([+-]?)(\d*d\d+|\d+)/g)) {
    const sign = m[1] === '-' ? -1 : 1
    const dm = /^(\d*)d(\d+)$/.exec(m[2])
    if (dm) dice.push([dm[1] ? parseInt(dm[1], 10) : 1, parseInt(dm[2], 10)])
    else flat += sign * parseInt(m[2], 10)
  }
  return { dice, flat }
}

/** Rolls damage; a critical hit doubles the dice (not the modifier). */
export function rollDamage(expr: string, crit: boolean): { total: number; rolls: number[] } {
  const { dice, flat } = parseDamage(expr)
  const rolls: number[] = []
  for (const [count, sides] of dice) rolls.push(...rollDice(crit ? count * 2 : count, sides))
  return { total: Math.max(0, rolls.reduce((a, b) => a + b, 0) + flat), rolls }
}

interface Swing {
  entry: LogEntry
  cell: GridCell
}

/** One attack roll against `ac`: nat 20 crits, nat 1 always misses. */
function swing(attack: DuelAttack, attacker: string, ac: number, side: Side, round: number): Swing {
  const d20 = rollDice(1, 20)[0]
  const total = d20 + attack.toHit
  const crit = d20 === 20
  const hit = crit || (d20 !== 1 && total >= ac)
  const roll = `d20 ${d20}${attack.toHit >= 0 ? '+' : ''}${attack.toHit} = ${total} vs AC ${ac}`
  const lower = side === 'foe'
  if (!hit) {
    const fumble = d20 === 1
    return {
      cell: (lower ? 'm' : 'M') as GridCell,
      entry: {
        round, side, kind: fumble ? 'fumble' : 'miss',
        text: `${attacker} misses with ${attack.name} (${roll}${fumble ? ', natural 1' : ''}).`,
      },
    }
  }
  const dmg = rollDamage(attack.damage, crit)
  return {
    cell: (crit ? (lower ? 'c' : 'C') : lower ? 'h' : 'H') as GridCell,
    entry: {
      round, side, kind: crit ? 'crit' : 'hit', damage: dmg.total,
      text: `${attacker} ${crit ? 'CRITS' : 'hits'} with ${attack.name} for ${dmg.total} (${roll}${crit ? ', natural 20' : ''}).`,
    },
  }
}

// ── Turn flow ────────────────────────────────────────────────────────────────

function finish(s: DuelState): DuelState {
  if (s.heroHp <= 0) return { ...s, heroHp: 0, outcome: 'lost' }
  if (s.foeHp <= 0) return { ...s, foeHp: 0, outcome: 'won' }
  return s
}

/** Resolves the foe's whole turn (every attack it has), then starts the hero's. */
function foeTurn(s: DuelState): DuelState {
  const foe = foeOf(s)
  let next = s
  for (const attack of foe.attacks) {
    for (let i = 0; i < (attack.times ?? 1); i++) {
      if (next.heroHp <= 0) break
      const sw = swing(attack, foe.name, heroOf(s).ac, 'foe', next.round)
      const dmg = sw.entry.damage ?? 0
      next = {
        ...next,
        heroHp: next.heroHp - dmg,
        taken: next.taken + dmg,
        grid: [...next.grid, sw.cell],
        log: [...next.log, sw.entry],
      }
    }
    // A foe with several separate actions (e.g. Owlbear beak + claws, Troll)
    // uses all of them each turn, like a Multiattack.
  }
  return finish(next)
}

/** Opens a new round: hero's turn flags reset; round cap ends a stalemate. */
function newRound(s: DuelState): DuelState {
  if (s.outcome !== 'playing') return s
  if (s.round >= MAX_ROUNDS) {
    return {
      ...s, outcome: 'stalemate',
      log: [...s.log, { round: s.round, side: 'hero', kind: 'info', text: 'Both fighters are spent. The duel ends in a stalemate.' }],
    }
  }
  return { ...s, round: s.round + 1, turn: 'hero', actionUsed: false, bonusUsed: false }
}

/** Starts today's duel: rolls initiative; the foe may open with its turn. */
export function startDuel(day: string): DuelState {
  const { hero, foe } = dailyMatchup(day)
  const heroInit = rollDice(1, 20)[0] + hero.init
  const foeInit = rollDice(1, 20)[0] + foe.init
  const heroFirst = heroInit >= foeInit
  const base: DuelState = {
    day, heroId: hero.id, foeId: foe.id,
    heroHp: hero.hp, foeHp: foe.hp,
    round: 1, turn: 'hero', actionUsed: false, bonusUsed: false,
    outcome: 'playing', dealt: 0, taken: 0, grid: [],
    log: [{
      round: 1, side: heroFirst ? 'hero' : 'foe', kind: 'info',
      text: `Initiative: ${hero.name} ${heroInit}, ${foe.name} ${foeInit}. ${heroFirst ? 'You go first.' : `${foe.name} strikes first.`}`,
    }],
  }
  return heroFirst ? base : foeTurn(base)
}

/** The hero's attacks still usable this turn. */
export function availableAttacks(s: DuelState): DuelAttack[] {
  if (s.outcome !== 'playing' || s.turn !== 'hero') return []
  return heroOf(s).attacks.filter((a) => (a.kind === 'action' ? !s.actionUsed : !s.bonusUsed))
}

/** The hero uses an attack. Ends the turn automatically once nothing is left. */
export function heroAttack(s: DuelState, attackId: string): DuelState {
  const attack = availableAttacks(s).find((a) => a.id === attackId)
  if (!attack) return s
  const hero = heroOf(s)
  const foe = foeOf(s)
  let next: DuelState = {
    ...s,
    actionUsed: s.actionUsed || attack.kind === 'action',
    bonusUsed: s.bonusUsed || attack.kind === 'bonus',
  }
  for (let i = 0; i < (attack.times ?? 1); i++) {
    if (next.foeHp <= 0) break
    const sw = swing(attack, hero.name, foe.ac, 'hero', next.round)
    const dmg = sw.entry.damage ?? 0
    next = {
      ...next,
      foeHp: next.foeHp - dmg,
      dealt: next.dealt + dmg,
      grid: [...next.grid, sw.cell],
      log: [...next.log, sw.entry],
    }
  }
  next = finish(next)
  if (next.outcome !== 'playing') return next
  return availableAttacks(next).length === 0 ? endTurn(next) : next
}

/** Ends the hero's turn: the foe acts, then a new round begins. */
export function endTurn(s: DuelState): DuelState {
  if (s.outcome !== 'playing' || s.turn !== 'hero') return s
  return newRound(foeTurn({ ...s, turn: 'foe' }))
}

// ── Sharing ──────────────────────────────────────────────────────────────────

const CELL_EMOJI: Record<GridCell, string> = {
  H: '🟩', C: '🟨', M: '⬛', h: '🟥', c: '🟧', m: '⬜',
}

/**
 * A finished duel's score, small enough to ride in a link. Nothing is stored
 * server-side, so the code is trusted only for a friendly "beat this" banner.
 */
export interface Challenge {
  day: string
  outcome: Exclude<Outcome, 'playing'>
  rounds: number
  hpLeft: number
}

const OUTCOME_CODE: Record<Challenge['outcome'], string> = { won: 'w', lost: 'l', stalemate: 's' }

/** `2026-11-04.w.5.23` — day, outcome (w/l/s), rounds, hero HP left. */
export function encodeChallenge(s: DuelState): string {
  if (s.outcome === 'playing') return ''
  return `${s.day}.${OUTCOME_CODE[s.outcome]}.${s.round}.${Math.max(0, s.heroHp)}`
}

/** Parses a challenge code; returns null for anything malformed. */
export function parseChallenge(code: string | null | undefined): Challenge | null {
  const m = /^(\d{4}-\d{2}-\d{2})\.([wls])\.(\d{1,2})\.(\d{1,3})$/.exec(code ?? '')
  if (!m) return null
  const outcome = (Object.keys(OUTCOME_CODE) as Challenge['outcome'][]).find((k) => OUTCOME_CODE[k] === m[2])
  if (!outcome) return null
  const rounds = Number(m[3])
  if (rounds < 1 || rounds > MAX_ROUNDS) return null
  return { day: m[1], outcome, rounds, hpLeft: Number(m[4]) }
}

/** Higher is better. Only wins score: fewer rounds first, then more HP left. */
export function challengeScore(c: Pick<Challenge, 'outcome' | 'rounds' | 'hpLeft'>): number {
  return c.outcome === 'won' ? 10000 - c.rounds * 200 + c.hpLeft : 0
}

export type Comparison = 'beat' | 'tied' | 'lost'

/** How a finished duel stacks up against a friend's challenge. */
export function compareToChallenge(s: DuelState, c: Challenge): Comparison {
  const mine = challengeScore({ outcome: s.outcome === 'playing' ? 'lost' : s.outcome, rounds: s.round, hpLeft: Math.max(0, s.heroHp) })
  const theirs = challengeScore(c)
  return mine > theirs ? 'beat' : mine === theirs ? 'tied' : 'lost'
}

/** The link a friend opens to play the same day's duel and try to beat you. */
export function challengeLink(s: DuelState, base: string): string {
  return `${base}#/daily?beat=${encodeChallenge(s)}`
}

/** Wordle-style text: a header, the roll-by-roll grid, the HP left, and a link. */
export function shareText(s: DuelState, link?: string): string {
  const hero = heroOf(s)
  const foe = foeOf(s)
  const verdict = s.outcome === 'won' ? 'Victory' : s.outcome === 'lost' ? 'Defeat' : 'Stalemate'
  const rows: string[] = []
  for (let i = 0; i < s.grid.length; i += 6) rows.push(s.grid.slice(i, i + 6).map((c) => CELL_EMOJI[c]).join(''))
  return [
    `⚔️ D&D Codex Daily Duel ${s.day}`,
    `${hero.emoji} ${hero.name} vs ${foe.emoji} ${foe.name}`,
    `${verdict} in ${s.round} round${s.round === 1 ? '' : 's'} · ${Math.max(0, s.heroHp)}/${hero.hp} HP left`,
    ...rows,
    ...(link ? ['', `Think you can beat me? ${link}`] : []),
  ].join('\n')
}

// ── Persistence (one play per UTC day, this browser) ─────────────────────────

const KEY = 'codex.dailyDuel'

/** Today's saved duel (so a reload resumes it), or null if none for this day. */
export function loadDuel(day: string): DuelState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as DuelState
    return s.day === day ? s : null
  } catch {
    return null
  }
}

export function saveDuel(s: DuelState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode / quota — this session's in-memory state still works */
  }
}
