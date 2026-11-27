import { rollDice } from './dice'
import { attackFx, type DuelFxKind } from './duelFx'
import type { DuelRecord } from '../db/types'
import {
  FOES, HEROES, SIGNATURES, TIER_LABEL, TIERS, TWISTS,
  type DuelAttack, type Duelist, type Signature, type Tier, type Twist,
} from '../data/duelists'

// Daily Duel (T-63, T-65): a Wordle-style 1v1 that is the same for everyone each
// UTC day. The matchup and the day's twist are derived from the date (no
// server); dice are free. Pure logic only — it never touches the shared combat
// tracker store (codex.combat), Dexie, or Supabase, so it is safe in any
// context and trivially testable.
//
// A turn works in small steps so the page can animate each roll: choose an
// attack (`chooseAttack`), roll each swing (`rollPending`), then `endTurn`.
// `heroAttack` runs a whole attack at once for the simulation and tests.

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

/** The day's twist: one rule that bends the duel, the same for everyone. */
export function dailyTwist(day: string, lean?: 'hero' | 'foe' | null): Twist {
  const rand = mulberry32(hashString(`dnd-codex-daily-duel-twist:${day}`))
  // With a lean (T-66), pick among the twists that favor that side, same seed.
  const pool = lean ? TWISTS.filter((t) => t.favors === lean) : TWISTS
  return pool[Math.floor(rand() * pool.length)]
}

export interface Matchup {
  day: string
  tier: Tier
  hero: Duelist
  /** The foe at the day's difficulty: its HP and unlocked attacks. */
  foe: Duelist
  twist: Twist
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

/** Today's hero, opponent and twist — identical for everyone on the same UTC day. */
export function dailyMatchup(day: string, tier: Tier = dailyTier(day), lean?: 'hero' | 'foe' | null): Matchup {
  const rand = mulberry32(hashString(`dnd-codex-daily-duel:${day}`))
  const hero = HEROES[Math.floor(rand() * HEROES.length)]
  const foeBase = FOES[Math.floor(rand() * FOES.length)]
  return { day, tier, hero, foe: resolveFoe(foeBase.id, tier), twist: dailyTwist(day, lean) }
}

// ── State ────────────────────────────────────────────────────────────────────

export type Side = 'hero' | 'foe'
export type Outcome = 'playing' | 'won' | 'lost'
export type RollMode = 'normal' | 'adv' | 'dis'

export interface DieRoll {
  sides: number
  value: number
}

export interface LogEntry {
  round: number
  side: Side
  kind: 'hit' | 'crit' | 'miss' | 'fumble' | 'info'
  text: string
  damage?: number
  /** Structured detail for the log display (absent on older saves and info rows). */
  who?: string
  attack?: string
  d20?: number
  bonus?: number
  total?: number
  ac?: number
  /** The target's HP after this attack, and its maximum. */
  targetHp?: number
  targetMax?: number
  /** T-65 detail, so the page can replay the roll with its dice and effect. */
  /** Every d20 rolled (two for advantage or disadvantage); `d20` is the one kept. */
  d20s?: number[]
  mode?: RollMode
  /** The damage dice rolled, and the flat bonus added to them. */
  dice?: DieRoll[]
  flat?: number
  /** The effect to play. */
  fx?: DuelFxKind
  /** Whose hit points changed (attacks: the target; heals and regeneration: who healed). */
  to?: Side
  heal?: number
  /** The foe's attack was halved by a ward. */
  warded?: boolean
}

export interface DuelState {
  day: string
  tier: Tier
  /** The day's twist id; empty on saves from before twists. */
  twist: string
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
  /** The id of the foe attack it will use on its next turn (telegraphed). */
  intent: string
  /** An attack the hero has chosen and is still rolling (one tap per swing). */
  pending: { attackId: string; left: number } | null
  /** Dodging: the foe attacks at disadvantage until the next round. */
  dodging: boolean
  /** The hero's once-per-duel signature move has been spent. */
  sigUsed: boolean
  /** Buffs waiting to be used. */
  adv: boolean
  strikeDice: string | null
  ward: boolean
  hinder: boolean
  /** Flat damage added to every hero hit (from an empowering signature). */
  rage: number
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
export function twistOf(s: Pick<DuelState, 'twist'>): Twist | null {
  return TWISTS.find((t) => t.id === s.twist) ?? null
}
export function signatureOf(s: Pick<DuelState, 'heroId'>): Signature | null {
  return SIGNATURES[s.heroId] ?? null
}
/** The hero's Armor Class today (a twist can lower it). */
export function heroAc(s: DuelState): number {
  return heroOf(s).ac - (s.twist === 'frail' ? 2 : 0)
}
/** The foe's Armor Class today (a twist can raise it). */
export function foeAc(s: DuelState): number {
  return foeOf(s).ac + (s.twist === 'armored' ? 2 : 0)
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
export function rollDamage(expr: string, crit: boolean): { total: number; rolls: number[]; dice: DieRoll[]; flat: number } {
  const { dice: groups, flat } = parseDamage(expr)
  const dice: DieRoll[] = []
  for (const [count, sides] of groups) {
    for (const value of rollDice(crit ? count * 2 : count, sides)) dice.push({ sides, value })
  }
  const rolls = dice.map((d) => d.value)
  return { total: Math.max(0, rolls.reduce((a, b) => a + b, 0) + flat), rolls, dice, flat }
}

/** Average damage of an expression (no crit). */
export function averageDamage(expr: string): number {
  const { dice, flat } = parseDamage(expr)
  return dice.reduce((sum, [n, sides]) => sum + (n * (sides + 1)) / 2, flat)
}

/** The chance an attack hits: a natural 20 always hits and a 1 always misses. */
export function hitChance(toHit: number, ac: number, mode: RollMode = 'normal'): number {
  const p = Math.min(0.95, Math.max(0.05, (21 - (ac - toHit)) / 20))
  if (mode === 'dis') return p * p
  if (mode === 'adv') return 1 - (1 - p) * (1 - p)
  return p
}

function rollD20(mode: RollMode, rerollOne: boolean): { kept: number; all: number[] } {
  const all = rollDice(mode === 'normal' ? 1 : 2, 20)
  let kept = mode === 'adv' ? Math.max(...all) : mode === 'dis' ? Math.min(...all) : all[0]
  if (rerollOne && kept === 1) {
    const again = rollDice(1, 20)[0]
    all.push(again)
    kept = again
  }
  return { kept, all }
}

interface SwingOpts {
  attack: DuelAttack
  attacker: string
  side: Side
  round: number
  ac: number
  mode: RollMode
  /** Added to the attack bonus (a twist). */
  toHitBonus?: number
  rerollOne?: boolean
  /** Flat damage added on a hit, and extra dice (doubled on a crit). */
  flat?: number
  extraDice?: string | null
  /** Halve the damage (a ward). */
  halve?: boolean
}

interface Swing {
  entry: LogEntry
  cell: GridCell
  hit: boolean
}

/** One attack roll against `ac`: nat 20 crits, nat 1 always misses. */
function swing(o: SwingOpts): Swing {
  const { attack, attacker, side, round, ac, mode } = o
  const bonus = attack.toHit + (o.toHitBonus ?? 0)
  const { kept: d20, all } = rollD20(mode, !!o.rerollOne)
  const total = d20 + bonus
  const crit = d20 === 20
  const hit = crit || (d20 !== 1 && total >= ac)
  const shown = all.length > 1 ? `d20 ${all.join('/')} keeps ${d20}` : `d20 ${d20}`
  const roll = `${shown}${bonus >= 0 ? '+' : ''}${bonus} = ${total} vs AC ${ac}`
  const lower = side === 'foe'
  const base = {
    round, side, who: attacker, attack: attack.name, d20, bonus, total, ac, d20s: all, mode,
    fx: attackFx(attack), to: (lower ? 'hero' : 'foe') as Side,
  }
  if (!hit) {
    const fumble = d20 === 1
    return {
      hit: false,
      cell: (lower ? 'm' : 'M') as GridCell,
      entry: {
        ...base, kind: fumble ? 'fumble' : 'miss',
        text: `${attacker} misses with ${attack.name} (${roll}${fumble ? ', natural 1' : ''}).`,
      },
    }
  }
  const dmg = rollDamage(o.extraDice ? `${attack.damage}+${o.extraDice}` : attack.damage, crit)
  const flat = dmg.flat + (o.flat ?? 0)
  let damage = Math.max(0, dmg.rolls.reduce((a, b) => a + b, 0) + flat)
  const warded = !!o.halve
  if (warded) damage = Math.ceil(damage / 2)
  return {
    hit: true,
    cell: (crit ? (lower ? 'c' : 'C') : lower ? 'h' : 'H') as GridCell,
    entry: {
      ...base, kind: crit ? 'crit' : 'hit', damage, dice: dmg.dice, flat, warded: warded || undefined,
      text: `${attacker} ${crit ? 'CRITS' : 'hits'} with ${attack.name} for ${damage}${warded ? ' (halved)' : ''} (${roll}${crit ? ', natural 20' : ''}).`,
    },
  }
}

// ── Moves ────────────────────────────────────────────────────────────────────

/**
 * Power Attack: the hero's main action with every swing at −5 to hit and +6
 * damage per hit. It beats a plain attack against a soft target (low Armor
 * Class) and loses to it against heavy armor, so the foe's AC is the choice.
 */
export function powerAttackOf(hero: Duelist): DuelAttack | null {
  const base = hero.attacks.find((a) => a.kind === 'action')
  if (!base) return null
  return {
    id: 'power', name: 'Power Attack', kind: 'action', toHit: base.toHit - 5,
    damage: `${base.damage}+6`, times: base.times ?? 1, blurb: '−5 to hit, +6 damage per hit',
  }
}

/** Every attack the hero can choose from, including Power Attack. */
export function heroAttacks(hero: Duelist): DuelAttack[] {
  const power = powerAttackOf(hero)
  const actions = hero.attacks.filter((a) => a.kind === 'action')
  const bonus = hero.attacks.filter((a) => a.kind === 'bonus')
  return [...actions, ...(power ? [power] : []), ...bonus]
}

/** The attack the foe has telegraphed for its next turn. */
export function foeIntent(s: DuelState): DuelAttack {
  const attacks = foeOf(s).attacks
  return attacks.find((a) => a.id === s.intent) ?? attacks[0]
}

function pickIntent(foe: Duelist): string {
  return foe.attacks[Math.floor(Math.random() * foe.attacks.length)].id
}

/** The roll mode of the foe's next attack: dodging or a hindered foe rolls twice, keeps the lower. */
export function foeAttackMode(s: DuelState): RollMode {
  return s.dodging || s.hinder ? 'dis' : 'normal'
}

const canAct = (s: DuelState) => s.outcome === 'playing' && s.turn === 'hero' && !s.pending

/** The hero's attacks still usable this turn. */
export function availableAttacks(s: DuelState): DuelAttack[] {
  if (!canAct(s)) return []
  return heroAttacks(heroOf(s)).filter((a) => (a.kind === 'action' ? !s.actionUsed : !s.bonusUsed))
}

export function canDodge(s: DuelState): boolean {
  return canAct(s) && !s.actionUsed
}

/** Whether the hero's signature move can be used right now. */
export function canUseSignature(s: DuelState): boolean {
  const sig = signatureOf(s)
  if (!sig || !canAct(s) || s.sigUsed) return false
  if (sig.cost === 'bonus' && s.bonusUsed) return false
  if (sig.kind === 'surge' && !s.actionUsed) return false
  return true
}

/** The mode of the hero's next attack roll. */
export function heroAttackMode(s: DuelState): RollMode {
  return s.adv ? 'adv' : 'normal'
}

/** The hero's attack bonus for `attack` today (a twist can raise it). */
export function heroToHit(s: DuelState, attack: DuelAttack): number {
  return attack.toHit + (s.twist === 'blessed' ? 2 : 0)
}

// ── Turn flow ────────────────────────────────────────────────────────────────

function finish(s: DuelState): DuelState {
  if (s.heroHp <= 0) return { ...s, heroHp: 0, outcome: 'lost' }
  if (s.foeHp <= 0) return { ...s, foeHp: 0, outcome: 'won' }
  return s
}

const info = (s: DuelState, e: Partial<LogEntry> & { text: string; side: Side }): LogEntry => ({ round: s.round, kind: 'info', ...e })

/** The foe's turn: it makes every swing of its telegraphed attack, then telegraphs the next. */
function foeTurn(s: DuelState): DuelState {
  const foe = foeOf(s)
  const hero = heroOf(s)
  const attack = foeIntent(s)
  const mode = foeAttackMode(s)
  let next = s
  // A ward, or dodging, halves the first hit this turn. A ward is spent by it; dodging ends with the round.
  let halve = s.ward || s.dodging
  let ward = s.ward
  for (let i = 0; i < (attack.times ?? 1); i++) {
    if (next.heroHp <= 0) break
    const sw = swing({
      attack, attacker: foe.name, side: 'foe', round: next.round, ac: heroAc(s), mode,
      flat: s.twist === 'vicious' ? 2 : 0, halve,
    })
    if (sw.hit) { halve = false; ward = false }
    const dmg = sw.entry.damage ?? 0
    const left = Math.max(0, next.heroHp - dmg)
    next = {
      ...next,
      heroHp: next.heroHp - dmg,
      taken: next.taken + dmg,
      grid: [...next.grid, sw.cell],
      log: [...next.log, { ...sw.entry, targetHp: left, targetMax: hero.hp }],
    }
  }
  next = { ...next, ward, hinder: false, intent: pickIntent(foe) }
  return finish(next)
}

/** Opens a new round: the hero's action and bonus action refresh. The duel
 *  runs until one side reaches 0 HP. */
function newRound(s: DuelState): DuelState {
  if (s.outcome !== 'playing') return s
  let next: DuelState = { ...s, round: s.round + 1, turn: 'hero', actionUsed: false, bonusUsed: false, dodging: false }
  if (next.twist === 'mending') {
    const max = heroOf(next).hp
    const healed = Math.min(max, next.heroHp + 3) - next.heroHp
    if (healed > 0) {
      next = {
        ...next, heroHp: next.heroHp + healed,
        log: [...next.log, info(next, { side: 'hero', fx: 'heal', to: 'hero', heal: healed, targetHp: next.heroHp + healed, targetMax: max, text: `Mending Light: you regain ${healed} HP.` })],
      }
    }
  }
  return next
}

/** Starts today's duel: rolls initiative; the foe may open with its turn. */
export function startDuel(day: string, matchup: Matchup = dailyMatchup(day)): DuelState {
  const { hero, foe, tier, twist } = matchup
  const heroInit = rollDice(1, 20)[0] + hero.init
  const foeInit = rollDice(1, 20)[0] + foe.init
  const heroFirst = heroInit >= foeInit
  const base: DuelState = {
    day, tier, twist: twist.id, heroId: hero.id, foeId: foe.id,
    heroHp: hero.hp, foeHp: foe.hp,
    round: 1, turn: 'hero', actionUsed: false, bonusUsed: false,
    outcome: 'playing', dealt: 0, taken: 0, grid: [],
    intent: pickIntent(foe), pending: null, dodging: false, sigUsed: false,
    adv: false, strikeDice: null, ward: false, hinder: false, rage: 0,
    log: [{
      round: 1, side: heroFirst ? 'hero' : 'foe', kind: 'info',
      text: `Initiative: ${hero.name} ${heroInit}, ${foe.name} ${foeInit}. ${heroFirst ? 'You go first.' : `${foe.name} strikes first.`}`,
    }],
  }
  return heroFirst ? base : foeTurn(base)
}

/** Whether nothing useful is left to do this turn, so it ends by itself. */
function turnIsSpent(s: DuelState): boolean {
  if (!canAct(s)) return false
  if (availableAttacks(s).length > 0 || canDodge(s)) return false
  const sig = signatureOf(s)
  // An unused Action Surge keeps the turn open: it grants another action.
  return !(sig && sig.kind === 'surge' && canUseSignature(s))
}

function settle(s: DuelState): DuelState {
  return turnIsSpent(s) ? endTurn(s) : s
}

/** Starts an attack: spends the action or bonus action; roll each swing with `rollPending`. */
export function chooseAttack(s: DuelState, attackId: string): DuelState {
  const attack = availableAttacks(s).find((a) => a.id === attackId)
  if (!attack) return s
  return {
    ...s,
    actionUsed: s.actionUsed || attack.kind === 'action',
    bonusUsed: s.bonusUsed || attack.kind === 'bonus',
    pending: { attackId: attack.id, left: attack.times ?? 1 },
  }
}

/** Rolls the next swing of the chosen attack. */
export function rollPending(s: DuelState): DuelState {
  if (s.outcome !== 'playing' || s.turn !== 'hero' || !s.pending) return s
  const hero = heroOf(s)
  const attack = heroAttacks(hero).find((a) => a.id === s.pending!.attackId)
  if (!attack) return { ...s, pending: null }
  const foe = foeOf(s)
  const mode = heroAttackMode(s)
  const sw = swing({
    attack, attacker: hero.name, side: 'hero', round: s.round, ac: foeAc(s), mode,
    toHitBonus: s.twist === 'blessed' ? 2 : 0,
    rerollOne: s.twist === 'fey-luck',
    flat: s.rage + (s.twist === 'brittle' ? 3 : 0),
    extraDice: s.strikeDice,
  })
  const dmg = sw.entry.damage ?? 0
  const left = Math.max(0, s.foeHp - dmg)
  const remaining = s.pending.left - 1
  let next: DuelState = {
    ...s,
    adv: false, // advantage covers the next attack roll only
    strikeDice: sw.hit ? null : s.strikeDice,
    foeHp: s.foeHp - dmg,
    dealt: s.dealt + dmg,
    pending: remaining > 0 ? { attackId: attack.id, left: remaining } : null,
    grid: [...s.grid, sw.cell],
    log: [...s.log, { ...sw.entry, targetHp: left, targetMax: foe.hp }],
  }
  next = finish(next)
  if (next.outcome !== 'playing') return { ...next, pending: null }
  return next.pending ? next : settle(next)
}

/** The hero uses a whole attack at once (every swing). The page rolls swing by swing instead. */
export function heroAttack(s: DuelState, attackId: string): DuelState {
  let next = chooseAttack(s, attackId)
  if (next === s) return s
  while (next.pending && next.outcome === 'playing') next = rollPending(next)
  return next
}

/**
 * Dodge: spends the action. Until the next round the foe attacks at
 * disadvantage, and the first hit it lands deals half damage.
 */
export function useDodge(s: DuelState): DuelState {
  if (!canDodge(s)) return s
  const next: DuelState = {
    ...s, actionUsed: true, dodging: true,
    log: [...s.log, info(s, { side: 'hero', fx: 'dodge', text: `${heroOf(s).name} takes the Dodge action. ${foeOf(s).name} attacks at disadvantage and its first hit deals half damage.` })],
  }
  return settle(next)
}

/** The hero's once-per-duel signature move. */
export function useSignature(s: DuelState): DuelState {
  const sig = signatureOf(s)
  if (!sig || !canUseSignature(s)) return s
  const hero = heroOf(s)
  let next: DuelState = { ...s, sigUsed: true, bonusUsed: s.bonusUsed || sig.cost === 'bonus' }
  const say = (text: string, extra: Partial<LogEntry> = {}): DuelState => ({
    ...next, log: [...next.log, info(next, { side: 'hero', text: `${hero.name} uses ${sig.name}. ${text}`, ...extra })],
  })
  switch (sig.kind) {
    case 'surge':
      next = say('You gain another action.', { fx: 'surge' })
      next = { ...next, actionUsed: false }
      break
    case 'heal': {
      const roll = rollDamage(sig.dice ?? '1d8', false)
      const healed = Math.min(hero.hp, next.heroHp + roll.total) - next.heroHp
      next = say(`You regain ${healed} HP.`, { fx: 'heal', to: 'hero', heal: healed, dice: roll.dice, flat: roll.flat, targetHp: next.heroHp + healed, targetMax: hero.hp })
      next = { ...next, heroHp: next.heroHp + healed }
      break
    }
    case 'empower':
      next = say(`Every hit deals ${sig.bonus ?? 0} more damage.`, { fx: 'buff' })
      next = { ...next, rage: next.rage + (sig.bonus ?? 0) }
      break
    case 'ward':
      next = say('The next hit on you deals half damage.', { fx: 'ward' })
      next = { ...next, ward: true }
      break
    case 'strike':
      next = say(`Your next hit deals +${sig.dice}.`, { fx: 'buff' })
      next = { ...next, strikeDice: sig.dice ?? null }
      break
    case 'advantage':
      next = say('Your next attack has advantage.', { fx: 'buff' })
      next = { ...next, adv: true }
      break
    case 'hinder':
      next = say(`${foeOf(s).name}'s next turn is at disadvantage.`, { fx: 'ward' })
      next = { ...next, hinder: true }
      break
  }
  return settle(next)
}

/** Ends the hero's turn: the foe acts, then a new round begins. */
export function endTurn(s: DuelState): DuelState {
  if (s.outcome !== 'playing' || s.turn !== 'hero') return s
  let next = foeTurn({ ...s, turn: 'foe', pending: null })
  if (next.outcome !== 'playing') return next
  if (next.twist === 'troll-blood') {
    const max = foeOf(next).hp
    const healed = Math.min(max, next.foeHp + 4) - next.foeHp
    if (healed > 0) {
      next = {
        ...next, foeHp: next.foeHp + healed,
        log: [...next.log, info(next, { side: 'foe', fx: 'heal', to: 'foe', heal: healed, targetHp: next.foeHp + healed, targetMax: max, text: `Troll’s Blood: ${foeOf(next).name} regains ${healed} HP.` })],
      }
    }
  }
  return newRound(next)
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

/** What the colored squares in a result mean. Shown beside the result, not pasted into messages. */
export const SHARE_LEGEND = '🟩 hit  🟨 crit  ⬛ miss (you)   🟥 hit  🟧 crit  ⬜ miss (foe)'

/** One attack as a square plus its outcome: "🟩 9 dmg" or "⬛ miss". */
function attackLabel(e: LogEntry): string {
  const mine = e.side === 'hero'
  if (e.kind === 'hit' || e.kind === 'crit') {
    const cell = e.kind === 'crit' ? (mine ? 'C' : 'c') : mine ? 'H' : 'h'
    return `${CELL_EMOJI[cell as GridCell]} ${e.damage ?? 0} dmg`
  }
  return `${CELL_EMOJI[mine ? 'M' : 'm']} miss`
}

/** One line per round: "R1  You 🟩 9 dmg   Foe 🟥 4 dmg". Falls back to the plain grid for saves without a log. */
function roundRows(s: DuelState): string[] {
  const attacks = s.log.filter((e) => e.kind !== 'info')
  if (attacks.length === 0) {
    const rows: string[] = []
    for (let i = 0; i < s.grid.length; i += 6) rows.push(s.grid.slice(i, i + 6).map((c) => CELL_EMOJI[c]).join(''))
    return rows
  }
  const rounds = [...new Set(attacks.map((e) => e.round))].sort((a, b) => a - b)
  return rounds.map((r) => {
    const side = (who: Side) => {
      const mine = attacks.filter((e) => e.round === r && e.side === who).map(attackLabel)
      return mine.length ? mine.join(', ') : '—'
    }
    return `R${r}  You ${side('hero')}   Foe ${side('foe')}`
  })
}

/** Share text: a header, one line per round, and a link. */
export function shareText(s: DuelState, link?: string): string {
  const hero = heroOf(s)
  const foe = foeOf(s)
  const twist = twistOf(s)
  const verdict = s.outcome === 'won' ? 'Victory' : 'Defeat'
  const rows = roundRows(s)
  return [
    `⚔️ D&D Codex Daily Duel ${s.day}`,
    `${hero.emoji} ${hero.name} vs ${foe.emoji} ${foe.name} (${TIER_LABEL[s.tier]})`,
    ...(twist ? [`Twist: ${twist.name}`] : []),
    `${verdict} in ${s.round} round${s.round === 1 ? '' : 's'} · ${Math.max(0, s.heroHp)}/${hero.hp} HP left`,
    '',
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

/**
 * Brings a saved duel up to the current shape. A finished duel from before
 * twists, telegraphed attacks or signature moves keeps its result (so a reload
 * can't start a second try); a duel still in progress can't be resumed.
 */
export function upgradeSave(s: DuelState): DuelState | null {
  if (!s.tier || (s.outcome as string) === 'stalemate') return null
  if (typeof s.twist === 'string' && typeof s.intent === 'string') return s
  if (s.outcome === 'playing') return null
  return {
    ...s, twist: s.twist ?? '', intent: s.intent ?? '', pending: null, dodging: false, sigUsed: true,
    adv: false, strikeDice: null, ward: false, hinder: false, rage: 0,
  }
}

/** Today's saved duel (so a reload resumes it), or null if none for this day. */
export function loadDuel(day: string): DuelState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as DuelState
    return s.day === day ? upgradeSave(s) : null
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
