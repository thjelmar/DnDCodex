// Balance simulation for the Daily Duel (T-63, T-65). Bundled and run by
// scripts/duel-sim.mjs. Two player policies: "smart" picks the best expected
// option each turn (dodges when in danger, uses its signature move), and
// "naive" only ever attacks. The foe's HP is tuned so a smart player lands on
// the targets; the naive policy shows the floor.
import {
  availableAttacks, averageDamage, canDodge, canUseSignature, endTurn, foeAc, foeAttackMode, foeIntent,
  foeOf, heroAc, heroAttack, heroAttackMode, heroOf, heroToHit, hitChance, resolveFoe, signatureOf,
  startDuel, useDodge, useSignature, type DuelState,
} from '../src/lib/dailyDuel'
import { FOES, HEROES, TWISTS, TIERS, type Tier } from '../src/data/duelists'

export type Policy = 'smart' | 'naive' | 'attacks' | 'nododge'

const TARGET: Record<Tier, number> = { easy: 0.95, standard: 0.65, hard: 0.39 }

function expectedHeroDamage(s: DuelState, a: { toHit: number; damage: string; times?: number }): number {
  const p = hitChance(heroToHit(s, a as never), foeAc(s), heroAttackMode(s))
  const flat = s.rage + (s.twist === 'brittle' ? 3 : 0)
  return p * (averageDamage(a.damage) + flat) * (a.times ?? 1)
}

function smartTurn(start: DuelState, opts: { sigs: boolean; dodge: boolean; power: boolean } = { sigs: true, dodge: true, power: true }): DuelState {
  let s = start
  for (let guard = 0; guard < 40 && s.outcome === 'playing' && s.turn === 'hero' && s.round === start.round; guard++) {
    const hero = heroOf(s)
    const intent = foeIntent(s)
    const vicious = s.twist === 'vicious' ? 2 : 0
    const foeNormal = hitChance(intent.toHit, heroAc(s), 'normal') * (averageDamage(intent.damage) + vicious) * (intent.times ?? 1)
    const attacks = availableAttacks(s).filter((a) => opts.power || a.id !== 'power')
    const best = attacks.reduce<typeof attacks[number] | null>((b, a) => (!b || expectedHeroDamage(s, a) > expectedHeroDamage(s, b) ? a : b), null)

    const sig = signatureOf(s)
    if (opts.sigs && sig && canUseSignature(s)) {
      let use = false
      if (sig.kind === 'heal') use = hero.hp - s.heroHp >= 14 && s.heroHp <= hero.hp * 0.55
      else if (sig.kind === 'surge') use = true
      else if (sig.kind === 'ward') use = foeNormal >= 7
      else if (sig.kind === 'hinder') use = true
      else use = attacks.length > 0 // a buff only helps if there is still an attack to make
      if (use) { s = useSignature(s); continue }
    }
    // Dodge when the foe is likely to kill the hero soon and the hero cannot finish first.
    if (opts.dodge && canDodge(s) && !s.dodging && foeAttackMode(s) === 'normal') {
      const mine = best ? expectedHeroDamage(s, best) : 0
      if (s.heroHp <= foeNormal * 1.15 && s.foeHp > mine * 1.3) { s = useDodge(s); continue }
    }
    if (best) { s = heroAttack(s, best.id); continue }
    break
  }
  return s.outcome === 'playing' && s.turn === 'hero' && s.round === start.round ? endTurn(s) : s
}

function naiveTurn(start: DuelState): DuelState {
  let s = start
  // The first action attack (not Power Attack), then the bonus attack, then end the turn.
  const action = availableAttacks(s).find((a) => a.kind === 'action' && a.id !== 'power')
  if (action) s = heroAttack(s, action.id)
  if (s.outcome === 'playing' && s.round === start.round) {
    const bonus = availableAttacks(s).find((a) => a.kind === 'bonus')
    if (bonus) s = heroAttack(s, bonus.id)
  }
  return s.outcome === 'playing' && s.round === start.round && s.turn === 'hero' ? endTurn(s) : s
}

export function playDuel(heroId: string, foeId: string, tier: Tier, twistIdx: number, policy: Policy): { won: boolean; rounds: number } {
  const hero = HEROES.find((h) => h.id === heroId)!
  const matchup = { day: 'sim', tier, hero, foe: resolveFoe(foeId, tier), twist: TWISTS[twistIdx % TWISTS.length] }
  let s = startDuel('sim', matchup)
  for (let i = 0; i < 400 && s.outcome === 'playing'; i++) s = policy === 'naive' ? naiveTurn(s) : policy === 'smart' ? smartTurn(s) : policy === 'nododge' ? smartTurn(s, { sigs: true, dodge: false, power: true }) : smartTurn(s, { sigs: false, dodge: false, power: false })
  return { won: s.outcome === 'won', rounds: s.round }
}

function foeWinRate(foeId: string, tier: Tier, policy: Policy, sims: number): number {
  let wins = 0
  let n = 0
  for (const h of HEROES) {
    for (let i = 0; i < sims; i++) {
      wins += playDuel(h.id, foeId, tier, Math.floor(Math.random() * TWISTS.length), policy).won ? 1 : 0
      n++
    }
  }
  return wins / n
}

/** Tunes every foe's HP for one tier so a smart player wins about TARGET of duels. */
function tuneTier(tier: Tier, minimums: number[]): Record<string, number> {
  const idx = TIERS.indexOf(tier)
  const out: Record<string, number> = {}
  FOES.forEach((f, fi) => {
    let lo = Math.max(10, minimums[fi])
    let hi = 600
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      f.hp[idx] = mid
      // Win rate falls as HP rises; stop when the rate crosses the target.
      if (foeWinRate(f.id, tier, 'smart', 40) > TARGET[tier]) lo = mid
      else hi = mid
    }
    f.hp[idx] = hi
    out[f.id] = hi
  })
  return out
}

export function report(sims: number): void {
  for (const policy of ['smart', 'nododge', 'attacks', 'naive'] as const) {
    console.log(`\n== ${policy} policy ==`)
    for (const tier of TIERS) {
      const perFoe = FOES.map((f) => foeWinRate(f.id, tier, policy, sims))
      const perHero = HEROES.map((h) => {
        let w = 0
        let n = 0
        for (const f of FOES) for (let i = 0; i < Math.ceil(sims / 2); i++) { w += playDuel(h.id, f.id, tier, Math.floor(Math.random() * TWISTS.length), policy).won ? 1 : 0; n++ }
        return w / n
      })
      const avg = perFoe.reduce((a, b) => a + b, 0) / perFoe.length
      const pct = (x: number) => (x * 100).toFixed(1) + '%'
      console.log(`${tier.padEnd(8)} avg ${pct(avg)} (target ${pct(TARGET[tier])}) · foe range ${pct(Math.min(...perFoe))}–${pct(Math.max(...perFoe))} · hero range ${pct(Math.min(...perHero))}–${pct(Math.max(...perHero))}`)
    }
  }
  console.log('\n== by twist (smart) ==')
  for (let t = 0; t < TWISTS.length; t++) {
    const row = TIERS.map((tier) => {
      let w = 0
      let n = 0
      for (const f of FOES) for (const h of HEROES) { w += playDuel(h.id, f.id, tier, t, 'smart').won ? 1 : 0; n++ }
      return `${tier} ${(w / n * 100).toFixed(1)}%`
    })
    console.log(`${TWISTS[t].name.padEnd(14)} ${row.join(' · ')}`)
  }
}

export function tune(): Record<string, [number, number, number]> {
  const minimums = FOES.map(() => 10)
  const result: Record<string, [number, number, number]> = {}
  for (const tier of TIERS) {
    const hp = tuneTier(tier, minimums)
    FOES.forEach((f, i) => { minimums[i] = hp[f.id]; (result[f.id] ??= [0, 0, 0])[TIERS.indexOf(tier)] = hp[f.id] })
  }
  return result
}

void foeOf

/** Per-hero win rate for a smart player, averaged over every foe and tier. */
function heroRates(sims: number): number[] {
  return HEROES.map((h) => {
    let w = 0
    let n = 0
    for (const tier of TIERS) {
      for (const f of FOES) {
        for (let i = 0; i < sims; i++) { w += playDuel(h.id, f.id, tier, Math.floor(Math.random() * TWISTS.length), 'smart').won ? 1 : 0; n++ }
      }
    }
    return w / n
  })
}

/** Nudges hero HP so every hero wins about as often as the average one. */
export function tuneHeroes(rounds = 5, sims = 6): Record<string, number> {
  const orig = HEROES.map((h) => h.hp)
  for (let r = 0; r < rounds; r++) {
    const rates = heroRates(sims)
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length
    HEROES.forEach((h, i) => { h.hp = Math.max(25, Math.round(h.hp - (rates[i] - mean) * 90)) })
  }
  const out: Record<string, number> = {}
  HEROES.forEach((h, i) => { out[h.id] = h.hp; void orig[i] })
  return out
}

export function heroReport(sims: number): void {
  const rates = heroRates(sims)
  HEROES.forEach((h, i) => console.log(`${h.id.padEnd(14)} hp ${String(h.hp).padStart(3)}  ${(rates[i] * 100).toFixed(1)}%`))
}
