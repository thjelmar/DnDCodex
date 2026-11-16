import { test, expect } from '@playwright/test'
import {
  availableAttacks, canDodge, canUseSignature, chooseAttack, dailyMatchup, dailyTwist, endTurn, foeAc,
  foeAttackMode, foeIntent, heroAc, heroAttack, heroAttacks, heroOf, hitChance, powerAttackOf, resolveFoe,
  rollPending, signatureOf, startDuel, upgradeSave, useDodge, useSignature, type DuelState,
} from '../src/lib/dailyDuel'
import { attackFx } from '../src/lib/duelFx'
import { isTokenIcon } from '../src/lib/tokenIcons'
import { DUELIST_ICONS, FOES, HEROES, SIGNATURES, TWISTS, type Tier, type TwistId } from '../src/data/duelists'

// Daily Duel combat update (T-65): telegraphed intent, Dodge, Power Attack,
// signature moves and daily twists. Pure engine logic, no browser. Dice are
// rigged by replacing Math.random with a queue of values.

const realRandom = Math.random
function rig(values: number[]) {
  const q = [...values]
  Math.random = () => (q.length ? q.shift()! : 0.5)
}
test.afterEach(() => { Math.random = realRandom })

/** The random value that makes a die with `sides` faces land on `face`. */
const face = (f: number, sides: number) => (f - 0.5) / sides
const d20 = (f: number) => face(f, 20)
/** The first attack roll in the log (signature moves log an info row before it). */
const atk = (s: DuelState) => s.log.find((e) => e.attack !== undefined)!

/** A duel at round 1 with the hero to act, no twist unless given. */
function fresh(heroId: string, foeId: string, tier: Tier = 'standard', twist: TwistId | '' = ''): DuelState {
  rig([0.99, 0, 0]) // the hero wins initiative; the foe's first attack is its first listed
  const hero = HEROES.find((h) => h.id === heroId)!
  const t = TWISTS.find((x) => x.id === twist) ?? TWISTS[0]
  const s = startDuel('2026-11-16', { day: '2026-11-16', tier, hero, foe: resolveFoe(foeId, tier), twist: t })
  Math.random = realRandom
  return { ...s, twist, log: [], heroHp: hero.hp, foeHp: resolveFoe(foeId, tier).hp }
}

test.describe('daily duel twists', () => {
  test('the twist is picked by the date and is the same every time', () => {
    expect(dailyTwist('2026-11-16').id).toBe(dailyTwist('2026-11-16').id)
    expect(TWISTS.map((t) => t.id)).toContain(dailyTwist('2026-11-17').id)
    expect(dailyMatchup('2026-11-16').twist.id).toBe(dailyTwist('2026-11-16').id)
    // A month of days uses more than one twist.
    const seen = new Set(Array.from({ length: 30 }, (_, i) => dailyTwist(`2026-12-${String(i + 1).padStart(2, '0')}`).id))
    expect(seen.size).toBeGreaterThan(3)
  })
  test('half the twists help the hero and half help the foe', () => {
    expect(TWISTS.filter((t) => t.favors === 'hero')).toHaveLength(4)
    expect(TWISTS.filter((t) => t.favors === 'foe')).toHaveLength(4)
  })
  test('Plated Foe and Frayed Gear change Armor Class', () => {
    expect(foeAc(fresh('fighter', 'ogre', 'standard', 'armored'))).toBe(14)
    expect(foeAc(fresh('fighter', 'ogre'))).toBe(12)
    expect(heroAc(fresh('fighter', 'ogre', 'standard', 'frail'))).toBe(16)
  })
  test('Blessed adds 2 to the hero’s attack roll', () => {
    const s = fresh('fighter', 'ogre', 'standard', 'blessed')
    rig([d20(10), ...Array(8).fill(0.5)])
    const next = rollPending(chooseAttack(s, 'shove'))
    const e = next.log[0]
    expect(e.bonus).toBe(9) // +7 and the twist
    expect(e.total).toBe(19)
  })
  test('Fey Luck rerolls a natural 1', () => {
    const s = fresh('fighter', 'ogre', 'standard', 'fey-luck')
    rig([d20(1), d20(15), ...Array(8).fill(0.5)])
    const e = rollPending(chooseAttack(s, 'shove')).log[0]
    expect(e.d20s).toEqual([1, 15])
    expect(e.d20).toBe(15)
    expect(e.kind === 'hit' || e.kind === 'crit').toBe(true)
  })
  test('Brittle Hide adds 3 damage and Vicious Foe adds 2', () => {
    // Shield Bash: 1d4+4, with the die at 1 → 5 damage, +3 with the twist.
    let s = fresh('fighter', 'ogre', 'standard', 'brittle')
    rig([d20(15), face(1, 4)])
    expect(rollPending(chooseAttack(s, 'shove')).log[0].damage).toBe(8)
    // The Ogre's Club Smash: 2d8+6 with both dice at 1 → 8, +2 with the twist.
    s = { ...fresh('fighter', 'ogre', 'standard', 'vicious'), intent: 'smash' }
    rig([d20(15), face(1, 8), face(1, 8)])
    const after = endTurn({ ...s, actionUsed: true, bonusUsed: true })
    expect(after.log[0].damage).toBe(10)
  })
  test('Troll’s Blood heals the foe and Mending Light heals the hero each round', () => {
    let s = fresh('fighter', 'ogre', 'standard', 'troll-blood')
    s = { ...s, foeHp: 30, intent: 'smash' }
    rig([d20(2)]) // the Ogre misses
    const next = endTurn(s)
    expect(next.foeHp).toBe(34)
    expect(next.log.some((e) => /Troll/.test(e.text) && e.heal === 4 && e.to === 'foe')).toBe(true)

    s = { ...fresh('fighter', 'ogre', 'standard', 'mending'), heroHp: 20, intent: 'smash' }
    rig([d20(2)])
    const healed = endTurn(s)
    expect(healed.heroHp).toBe(23)
    expect(healed.round).toBe(2)
  })
})

test.describe('telegraphed intent', () => {
  test('the foe uses the attack it showed, then shows its next one', () => {
    const s = { ...fresh('fighter', 'ogre', 'hard'), intent: 'overhead' }
    expect(foeIntent(s).name).toBe('Crushing Overhead')
    rig([d20(2)]) // misses
    const next = endTurn(s)
    expect(next.log[0].attack).toBe('Crushing Overhead')
    expect(FOES.find((f) => f.id === 'ogre')!.attacks.map((a) => a.id)).toContain(next.intent)
  })
  test('a new duel starts with an intent from the day’s unlocked attacks', () => {
    for (let i = 0; i < 20; i++) {
      const s = fresh('fighter', 'goblin-boss', 'easy')
      expect(resolveFoe('goblin-boss', 'easy').attacks.map((a) => a.id)).toContain(s.intent)
    }
  })
  test('hit chance follows the d20 rules, with advantage and disadvantage', () => {
    expect(hitChance(7, 15)).toBeCloseTo(0.65)
    expect(hitChance(0, 30)).toBeCloseTo(0.05) // only a natural 20
    expect(hitChance(30, 10)).toBeCloseTo(0.95) // a natural 1 still misses
    expect(hitChance(7, 15, 'dis')).toBeCloseTo(0.65 * 0.65)
    expect(hitChance(7, 15, 'adv')).toBeCloseTo(1 - 0.35 * 0.35)
  })
})

test.describe('Dodge and Power Attack', () => {
  test('Dodge spends the action, and the foe rolls two d20 and keeps the lower', () => {
    const s0 = { ...fresh('fighter', 'ogre'), intent: 'smash' }
    expect(canDodge(s0)).toBe(true)
    const s = useDodge(s0)
    expect(s.actionUsed).toBe(true)
    expect(s.dodging).toBe(true)
    expect(foeAttackMode(s)).toBe('dis')
    expect(canDodge(s)).toBe(false)
    // d20 15 and 18, keep 15: 15+7 = 22 beats AC 18. Dice 8 and 8 → 22 damage, halved to 11.
    rig([d20(15), d20(18), face(8, 8), face(8, 8)])
    const after = endTurn({ ...s, bonusUsed: true })
    const e = after.log.find((x) => x.attack === 'Club Smash')!
    expect(e.d20s).toEqual([15, 18])
    expect(e.d20).toBe(15)
    expect(e.mode).toBe('dis')
    expect(e.damage).toBe(11)
    expect(e.warded).toBe(true)
    expect(after.dodging).toBe(false) // it ends with the round
  })
  test('Power Attack keeps every swing at −5 to hit and +6 damage', () => {
    const fighter = HEROES.find((h) => h.id === 'fighter')!
    const p = powerAttackOf(fighter)!
    expect(p.toHit).toBe(2)
    expect(p.damage).toBe('1d8+4+6')
    expect(p.times).toBe(2)
    expect(heroAttacks(fighter).map((a) => a.id)).toEqual(['longsword', 'power', 'shove'])
    const s = fresh('rogue', 'ogre')
    expect(availableAttacks(s).map((a) => a.id)).toContain('power')
    expect(powerAttackOf(HEROES.find((h) => h.id === 'rogue')!)!.times).toBe(1)
  })
  test('a two-swing attack takes one roll per swing, and the action stays spent', () => {
    let s = fresh('fighter', 'ogre')
    s = chooseAttack(s, 'longsword')
    expect(s.pending).toEqual({ attackId: 'longsword', left: 2 })
    expect(s.actionUsed).toBe(true)
    expect(availableAttacks(s)).toEqual([]) // nothing else until the swings are rolled
    rig([d20(2)])
    s = rollPending(s)
    expect(s.pending).toEqual({ attackId: 'longsword', left: 1 })
    rig([d20(2)])
    s = rollPending(s)
    expect(s.pending).toBeNull()
    expect(s.log.map((e) => e.kind)).toEqual(['miss', 'miss'])
  })
  test('the turn ends by itself once nothing is left to do', () => {
    // No signature surge: the Fighter's Action Surge keeps the turn open, so use a Rogue.
    const s = heroAttack(heroAttack(fresh('rogue', 'ogre'), 'rapier'), 'offhand')
    expect(s.round).toBe(2) // the foe acted and a new round began
  })
})

test.describe('signature moves', () => {
  test('every hero has one, with a valid kind', () => {
    for (const h of HEROES) {
      const sig = SIGNATURES[h.id]
      expect(sig, h.id).toBeTruthy()
      expect(['surge', 'heal', 'empower', 'ward', 'strike', 'advantage', 'hinder']).toContain(sig.kind)
      if (sig.kind === 'heal' || sig.kind === 'strike') expect(sig.dice, h.id).toBeTruthy()
      if (sig.kind === 'empower') expect(sig.bonus, h.id).toBeGreaterThan(0)
    }
  })
  test('Action Surge needs a spent action, refunds it, and works once', () => {
    let s = fresh('fighter', 'ogre')
    expect(signatureOf(s)!.name).toBe('Action Surge')
    expect(canUseSignature(s)).toBe(false)
    rig([d20(2), d20(2)])
    s = rollPending(chooseAttack(s, 'longsword'))
    s = rollPending(s)
    expect(s.actionUsed).toBe(true)
    expect(canUseSignature(s)).toBe(true)
    s = useSignature(s)
    expect(s.actionUsed).toBe(false)
    expect(s.sigUsed).toBe(true)
    expect(canUseSignature(s)).toBe(false)
  })
  test('a heal restores HP up to the maximum and records the dice', () => {
    let s = { ...fresh('cleric', 'ogre'), heroHp: 10 } // Preserve Life: 2d8+4, a bonus action
    expect(signatureOf(s)!.kind).toBe('heal')
    rig([face(5, 8), face(6, 8)])
    s = useSignature(s)
    expect(s.heroHp).toBe(10 + 5 + 6 + 4)
    expect(s.bonusUsed).toBe(true)
    const e = s.log[s.log.length - 1]
    expect(e.heal).toBe(15)
    expect(e.dice).toHaveLength(2)
    s = { ...fresh('cleric', 'ogre'), heroHp: HEROES.find((h) => h.id === 'cleric')!.hp - 2 }
    rig([face(8, 8), face(8, 8)])
    expect(useSignature(s).heroHp).toBe(HEROES.find((h) => h.id === 'cleric')!.hp)
  })
  test('Rage adds damage to every hit for the rest of the duel', () => {
    let s = fresh('barbarian', 'ogre')
    s = useSignature(s)
    expect(s.rage).toBe(3)
    expect(s.bonusUsed).toBe(true)
    // Greataxe 1d12+5 with the die at 1 → 6, +3 rage.
    rig([d20(15), face(1, 12)])
    expect(rollPending(chooseAttack(s, 'greataxe')).log.pop()!.damage).toBe(9)
  })
  test('Divine Smite adds dice to the next hit, and is saved by a miss', () => {
    let s = fresh('paladin', 'ogre')
    s = useSignature(s)
    expect(s.strikeDice).toBe('2d8')
    rig([d20(2)])
    s = rollPending(chooseAttack(s, 'sword'))
    expect(s.strikeDice).toBe('2d8') // the miss kept it
  })
  test('Divine Smite is spent by the next hit', () => {
    let s = useSignature(fresh('paladin', 'ogre'))
    // Smite Longsword 1d8+4+2d8; the smite adds 2d8 more. All dice at 1 → 1+4+2+2 = 9.
    rig([d20(15), face(1, 8), face(1, 8), face(1, 8), face(1, 8), face(1, 8)])
    s = rollPending(chooseAttack(s, 'sword'))
    expect(s.strikeDice).toBeNull()
    expect(atk(s).dice).toHaveLength(5)
  })
  test('Steady Aim gives the next attack roll advantage, once', () => {
    let s = useSignature(fresh('rogue', 'ogre')) // a bonus action, so the action is still free
    expect(s.adv).toBe(true)
    rig([d20(4), d20(17), ...Array(8).fill(0.5)])
    s = rollPending(chooseAttack(s, 'rapier'))
    expect(atk(s).mode).toBe('adv')
    expect(atk(s).d20).toBe(17)
    expect(s.adv).toBe(false)
  })
  test('Shield halves the next hit on the hero, and only that hit', () => {
    let s = { ...fresh('wizard', 'ogre'), intent: 'smash' }
    s = useSignature(s)
    expect(s.ward).toBe(true)
    // Club Smash 2d8+6: dice 8 and 8 → 22, halved to 11.
    rig([d20(19), face(8, 8), face(8, 8)])
    const after = endTurn({ ...s, actionUsed: true, bonusUsed: true })
    expect(atk(after).damage).toBe(11)
    expect(after.ward).toBe(false)
  })
  test('Stunning Strike makes the foe’s next turn a disadvantage turn', () => {
    let s = fresh('monk', 'ogre')
    s = useSignature(s)
    expect(s.hinder).toBe(true)
    expect(foeAttackMode(s)).toBe('dis')
    rig([d20(2), d20(3)])
    const after = endTurn({ ...s, actionUsed: true, bonusUsed: true, intent: 'smash' })
    expect(atk(after).mode).toBe('dis')
    expect(after.hinder).toBe(false)
  })
  test('a win ends the duel and clears the pending swing', () => {
    let s = { ...fresh('fighter', 'ogre'), foeHp: 1 }
    rig([d20(20), face(1, 8)])
    s = rollPending(chooseAttack(s, 'longsword'))
    expect(s.outcome).toBe('won')
    expect(s.pending).toBeNull()
    expect(heroOf(s).id).toBe('fighter')
  })
})

test.describe('saves, effects and icons', () => {
  test('a finished save from before T-65 is kept, and one in progress is dropped', () => {
    const old = { ...fresh('fighter', 'ogre'), outcome: 'won' as const } as unknown as Record<string, unknown>
    for (const k of ['twist', 'intent', 'pending', 'dodging', 'sigUsed', 'adv', 'strikeDice', 'ward', 'hinder', 'rage']) delete old[k]
    const kept = upgradeSave(old as unknown as DuelState)
    expect(kept).not.toBeNull()
    expect(kept!.outcome).toBe('won')
    expect(kept!.twist).toBe('')
    const playing = { ...old, outcome: 'playing' }
    expect(upgradeSave(playing as unknown as DuelState)).toBeNull()
    // A current save passes through untouched.
    const now = fresh('fighter', 'ogre')
    expect(upgradeSave(now)).toBe(now)
  })
  test('attack names map to an effect', () => {
    const fx = (name: string, id = 'x') => attackFx({ id, name })
    expect(fx('Longsword')).toBe('slash')
    expect(fx('Greatclub')).toBe('smash')
    expect(fx('Club Smash')).toBe('smash')
    expect(fx('Javelin')).toBe('spear')
    expect(fx('Longbow')).toBe('spear')
    expect(fx('Wild Haymaker')).toBe('arc')
    expect(fx('Shield Bash')).toBe('burst')
    expect(fx('Power Attack', 'power')).toBe('smash')
    expect(attackFx({ id: 'y', name: 'Anything', fx: 'arc' })).toBe('arc')
  })
  test('every duelist has a bundled token icon', () => {
    for (const d of [...HEROES, ...FOES]) {
      expect(isTokenIcon(DUELIST_ICONS[d.id]), `${d.id} → ${DUELIST_ICONS[d.id]}`).toBe(true)
    }
  })
  test('foe HP never drops from one difficulty to the next', () => {
    for (const f of FOES) {
      expect(f.hp[1], f.id).toBeGreaterThanOrEqual(f.hp[0])
      expect(f.hp[2], f.id).toBeGreaterThanOrEqual(f.hp[1])
    }
  })
})
