import { rollDice } from './dice'
import type { DuelRecord } from '../db/types'
import { FOES, HEROES, TIER_LABEL, TIERS, type DuelAttack, type Duelist, type Tier } from '../data/duelists'

// Daily Duel (T-63): a Wordle-style 1v1 that is the same for everyone each UTC
// day. The matchup is derived from the date (no server); dice are free. Pure
// logic only — it never touches the shared combat tracker store (codex.combat),
// Dexie, or Supabase, so it is safe in any context and trivially testable.

/** Sanity bound for a decoded challenge's round count (duels run to a winner). */
const MAX_CODE_ROUNDS = 999

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

/**
 * The day's difficulty ramps through the UTC week: Mon–Tue easy, Wed–Thu
 * standard, Fri–Sun hard.
 */
export function dailyTier(day: string): Tier {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay() // 0 = Sunday
  if (dow === 1 || dow === 2) return 'easy'
  if (dow === 3 || dow === 4) return 'standard'
  return 'hard'
}

export interface Matchup {
  day: string
  tier: Tier
  hero: Duelist
  /** The foe at the day's difficulty: its HP and unlocked attacks. */
  foe: Duelist
}

/** A foe flattened to one difficulty: that tier's HP and its unlocked attacks. */
export function resolveFoe(foeId: string, tier: Tier): Duelist {
  const f = FOES.find((x) => x.id === foeId)
  if (!f) throw new Error(`Unknown foe ${foeId}`)
  const level = (TIERS.indexOf(tier) + 1) as 1 | 2 | 3
  return {
    id: f.id, name: f.name, emoji: f.emoji, ac: f.ac, init: f.init,
    hp: f.hp[level - 1],
    attacks: f.attacks.filter((x) => (x.tier ?? 1) <= level),
  }
}

/** Today's hero and opponent — identical for everyone on the same UTC day. */
export function dailyMatchup(day: string, tier: Tier = dailyTier(day)): Matchup {
  const rand = mulberry32(hashString(`dnd-codex-daily-duel:${day}`))
  const hero = HEROES[Math.floor(rand() * HEROES.length)]
  const foeBase = FOES[Math.floor(rand() * FOES.length)]
  return { day, tier, hero, foe: resolveFoe(foeBase.id, tier) }
}

// ── State ────────────────────────────────────────────────────────────────────

export type Side = 'hero' | 'foe'
export type Outcome = 'playing' | 'won' | 'lost'

export interface LogEntry {
  round: number
  side: Side
  kind: 'hit' | 'crit' | 'miss' | 'fumble' | 'info'
  text: string
  damage?: number
}

export interface DuelState {
  day: string
  tier: Tier
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
  return resolveFoe(s.foeId, s.tier)
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

/** The foe's turn: it picks one attack at random from the set unlocked at the
 *  day's difficulty and makes every swing of it (a Multiattack is one choice). */
function foeTurn(s: DuelState): DuelState {
  const foe = foeOf(s)
  const hero = heroOf(s)
  const attack = foe.attacks[Math.floor(Math.random() * foe.attacks.length)]
  let next = s
  for (let i = 0; i < (attack.times ?? 1); i++) {
    if (next.heroHp <= 0) break
    const sw = swing(attack, foe.name, hero.ac, 'foe', next.round)
    const dmg = sw.entry.damage ?? 0
    next = {
      ...next,
      heroHp: next.heroHp - dmg,
      taken: next.taken + dmg,
      grid: [...next.grid, sw.cell],
      log: [...next.log, sw.entry],
    }
  }
  return finish(next)
}

/** Opens a new round: the hero's action and bonus action refresh. The duel
 *  runs until one side reaches 0 HP. */
function newRound(s: DuelState): DuelState {
  if (s.outcome !== 'playing') return s
  return { ...s, round: s.round + 1, turn: 'hero', actionUsed: false, bonusUsed: false }
}

/** Starts today's duel: rolls initiative; the foe may open with its turn. */
export function startDuel(day: string): DuelState {
  const { hero, foe, tier } = dailyMatchup(day)
  const heroInit = rollDice(1, 20)[0] + hero.init
  const foeInit = rollDice(1, 20)[0] + foe.init
  const heroFirst = heroInit >= foeInit
  const base: DuelState = {
    day, tier, heroId: hero.id, foeId: foe.id,
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

const OUTCOME_CODE: Record<Challenge['outcome'], string> = { won: 'w', lost: 'l' }

/** `2026-11-04.w.5.23` — day, outcome (w/l/s), rounds, hero HP left. */
export function encodeChallenge(s: DuelState): string {
  if (s.outcome === 'playing') return ''
  return `${s.day}.${OUTCOME_CODE[s.outcome]}.${s.round}.${Math.max(0, s.heroHp)}`
}

/** Parses a challenge code; returns null for anything malformed. */
export function parseChallenge(code: string | null | undefined): Challenge | null {
  const m = /^(\d{4}-\d{2}-\d{2})\.([wl])\.(\d{1,3})\.(\d{1,3})$/.exec(code ?? '')
  if (!m) return null
  const outcome = (Object.keys(OUTCOME_CODE) as Challenge['outcome'][]).find((k) => OUTCOME_CODE[k] === m[2])
  if (!outcome) return null
  const rounds = Number(m[3])
  if (rounds < 1 || rounds > MAX_CODE_ROUNDS) return null
  return { day: m[1], outcome, rounds, hpLeft: Number(m[4]) }
}

/** Higher is better. Only wins score: fewer rounds first, then more HP left. */
export function challengeScore(c: Pick<Challenge, 'outcome' | 'rounds' | 'hpLeft'>): number {
  return c.outcome === 'won' ? Math.max(1, 10000 - c.rounds * 10) * 1000 + c.hpLeft : 0
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
  const verdict = s.outcome === 'won' ? 'Victory' : 'Defeat'
  const rows: string[] = []
  for (let i = 0; i < s.grid.length; i += 6) rows.push(s.grid.slice(i, i + 6).map((c) => CELL_EMOJI[c]).join(''))
  return [
    `⚔️ D&D Codex Daily Duel ${s.day}`,
    `${hero.emoji} ${hero.name} vs ${foe.emoji} ${foe.name} (${TIER_LABEL[s.tier]})`,
    `${verdict} in ${s.round} round${s.round === 1 ? '' : 's'} · ${Math.max(0, s.heroHp)}/${hero.hp} HP left`,
    ...rows,
    ...(link ? ['', `Think you can beat me? ${link}`] : []),
  ].join('\n')
}

// ── Battle history ───────────────────────────────────────────────────────────

/** A finished duel as a history row (see DuelRecord); null while still playing. */
export function toDuelRecord(s: DuelState): Omit<DuelRecord, 'updatedAt'> | null {
  if (s.outcome === 'playing') return null
  return {
    day: s.day, tier: s.tier, heroId: s.heroId, foeId: s.foeId, outcome: s.outcome,
    rounds: s.round, heroHpLeft: Math.max(0, s.heroHp), heroHpMax: heroOf(s).hp,
    dealt: s.dealt, taken: s.taken, grid: s.grid.join(''),
  }
}

/** A saved grid string as emoji (unknown characters are skipped). */
export function gridEmoji(grid: string): string {
  return [...grid].map((c) => CELL_EMOJI[c as GridCell] ?? '').join('')
}

export interface HistoryStats {
  played: number
  won: number
  /** Consecutive UTC days won, counting back from today or yesterday. */
  streak: number
  bestStreak: number
}

const DAY_MS = 86_400_000
const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS)

/** Totals and win streaks for a list of history rows (any order). */
export function historyStats(records: Pick<DuelRecord, 'day' | 'outcome'>[], today: string = utcDayKey()): HistoryStats {
  const wins = records.filter((r) => r.outcome === 'won').map((r) => dayNumber(r.day)).sort((a, b) => a - b)
  let best = 0
  let run = 0
  for (let i = 0; i < wins.length; i++) {
    run = i > 0 && wins[i] === wins[i - 1] + 1 ? run + 1 : 1
    best = Math.max(best, run)
  }
  // The current streak is the run that ends today or yesterday; older runs have lapsed.
  let streak = 0
  const last = wins[wins.length - 1]
  if (last !== undefined && last >= dayNumber(today) - 1) {
    streak = 1
    for (let i = wins.length - 1; i > 0 && wins[i - 1] === wins[i] - 1; i--) streak++
  }
  return { played: records.length, won: wins.length, streak, bestStreak: best }
}

// ── Persistence (one play per UTC day, this browser) ─────────────────────────

const KEY = 'codex.dailyDuel'

/** Today's saved duel (so a reload resumes it), or null if none for this day. */
export function loadDuel(day: string): DuelState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as DuelState
    // Saves from before difficulty tiers (no `tier`) or with the removed
    // stalemate outcome can't be resumed.
    return s.day === day && s.tier && (s.outcome as string) !== 'stalemate' ? s : null
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
