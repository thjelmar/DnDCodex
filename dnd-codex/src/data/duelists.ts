// Curated duelists for the Daily Duel (T-63). The srdMonsters.json bundle only
// carries HP/AC/DEX, so the game needs explicit attack bonuses and damage dice.
// Heroes are roughly level-5 adventurers; foes are CR 1–3 SRD-style creatures.
// Numbers are tuned so the hero wins most (not all) duels — see the balance
// script notes in docs/DAILY_DUEL.md.

export interface DuelAttack {
  id: string
  name: string
  /** `action` uses the turn's action; `bonus` uses the bonus action. */
  kind: 'action' | 'bonus'
  /** Attack roll modifier added to the d20. */
  toHit: number
  /** Damage expression like "2d6+3" (dice are doubled on a critical hit). */
  damage: string
  /** Hits to roll this many times in one use (Multiattack). Default 1. */
  times?: number
  /** Short flavor line for the button. */
  blurb?: string
  /** Foes only: the lowest difficulty (1 easy, 2 standard, 3 hard) that can use it. */
  tier?: 1 | 2 | 3
}

export interface Duelist {
  id: string
  name: string
  emoji: string
  hp: number
  ac: number
  /** Initiative modifier. */
  init: number
  attacks: DuelAttack[]
}

export const HEROES: Duelist[] = [
  {
    id: 'fighter', name: 'Veteran Fighter', emoji: '🛡️', hp: 52, ac: 18, init: 1,
    attacks: [
      { id: 'longsword', name: 'Longsword', kind: 'action', toHit: 7, damage: '1d8+4', times: 2, blurb: 'Two swings' },
      { id: 'shove', name: 'Shield Bash', kind: 'bonus', toHit: 7, damage: '1d4+4' },
    ],
  },
  {
    id: 'rogue', name: 'Cunning Rogue', emoji: '🗡️', hp: 42, ac: 16, init: 4,
    attacks: [
      { id: 'rapier', name: 'Sneak Attack Rapier', kind: 'action', toHit: 7, damage: '1d8+4+3d6', blurb: 'Big, single strike' },
      { id: 'offhand', name: 'Off-hand Dagger', kind: 'bonus', toHit: 7, damage: '1d4+4' },
    ],
  },
  {
    id: 'barbarian', name: 'Raging Barbarian', emoji: '🪓', hp: 62, ac: 14, init: 1,
    attacks: [
      { id: 'greataxe', name: 'Greataxe', kind: 'action', toHit: 7, damage: '1d12+5', times: 2, blurb: 'Two heavy chops' },
      { id: 'headbutt', name: 'Headbutt', kind: 'bonus', toHit: 7, damage: '1d4+4' },
    ],
  },
  {
    id: 'paladin', name: 'Oath Paladin', emoji: '⚔️', hp: 50, ac: 18, init: 0,
    attacks: [
      { id: 'sword', name: 'Smite Longsword', kind: 'action', toHit: 7, damage: '1d8+4+2d8', blurb: 'Radiant smite' },
      { id: 'lay', name: 'Radiant Strike', kind: 'bonus', toHit: 6, damage: '1d6+3' },
    ],
  },
  {
    id: 'ranger', name: 'Wild Ranger', emoji: '🏹', hp: 44, ac: 16, init: 4,
    attacks: [
      { id: 'bow', name: 'Longbow', kind: 'action', toHit: 8, damage: '1d8+4', times: 2, blurb: 'Two arrows' },
      { id: 'mark', name: 'Hunter’s Mark Arrow', kind: 'bonus', toHit: 8, damage: '1d6+2' },
    ],
  },
  {
    id: 'monk', name: 'Flurry Monk', emoji: '👊', hp: 40, ac: 17, init: 4,
    attacks: [
      { id: 'strike', name: 'Unarmed Strikes', kind: 'action', toHit: 7, damage: '1d8+4', times: 2, blurb: 'Two fast hits' },
      { id: 'flurry', name: 'Flurry of Blows', kind: 'bonus', toHit: 7, damage: '1d8+4' },
    ],
  },
  {
    id: 'cleric', name: 'War Cleric', emoji: '🔨', hp: 46, ac: 18, init: 0,
    attacks: [
      { id: 'mace', name: 'Warhammer', kind: 'action', toHit: 6, damage: '1d8+3+1d8', times: 2, blurb: 'Two blessed swings' },
      { id: 'spirit', name: 'Spiritual Weapon', kind: 'bonus', toHit: 6, damage: '1d8+3' },
    ],
  },
  {
    id: 'warlock', name: 'Pact Warlock', emoji: '🔮', hp: 44, ac: 16, init: 2,
    attacks: [
      { id: 'blast', name: 'Eldritch Blast', kind: 'action', toHit: 7, damage: '1d10+4', times: 2, blurb: 'Two beams' },
      { id: 'hex', name: 'Hexblade Strike', kind: 'bonus', toHit: 7, damage: '1d6+3' },
    ],
  },
]

export type Tier = 'easy' | 'standard' | 'hard'
export const TIERS: Tier[] = ['easy', 'standard', 'hard']
export const TIER_LABEL: Record<Tier, string> = { easy: 'Easy', standard: 'Standard', hard: 'Hard' }

/**
 * A foe has one armor class and initiative, but its hit points and the set of
 * attacks it may use grow with difficulty. Each turn the foe picks one attack
 * at random from those unlocked at the day's tier (see `tier` on each attack).
 */
export interface Foe {
  id: string
  name: string
  emoji: string
  ac: number
  init: number
  /** Hit points at [easy, standard, hard]. */
  hp: [number, number, number]
  attacks: DuelAttack[]
}

const a = (tier: 1 | 2 | 3, id: string, name: string, toHit: number, damage: string, times = 1): DuelAttack =>
  ({ id, name, kind: 'action', tier, toHit, damage, times })

export const FOES: Foe[] = [
  {
    id: 'goblin-boss', name: 'Goblin Boss', emoji: '👺', ac: 17, init: 2, hp: [56, 67, 70],
    attacks: [
      a(1, 'jab', 'Scimitar Jab', 6, '1d6+4'),
      a(2, 'flurry', 'Scimitar Flurry', 6, '1d6+4', 3),
      a(3, 'frenzy', 'Nimble Frenzy', 7, '1d6+4+1d6', 3),
    ],
  },
  {
    id: 'bugbear', name: 'Bugbear Chief', emoji: '🐻', ac: 17, init: 2, hp: [78, 94, 98],
    attacks: [
      a(1, 'swing', 'Morningstar Swing', 4, '2d8+2'),
      a(2, 'pair', 'Morningstar Pair', 4, '2d8+2', 2),
      a(3, 'ambush', 'Brutal Ambush', 5, '2d8+2+2d6', 2),
    ],
  },
  {
    id: 'orc', name: 'Orc War Chief', emoji: '👹', ac: 15, init: 1, hp: [88, 106, 110],
    attacks: [
      a(1, 'chop', 'Axe Chop', 5, '1d12+3'),
      a(2, 'flurry', 'Greataxe Flurry', 5, '1d12+3', 2),
      a(3, 'fury', 'Blood Fury', 6, '1d12+3+1d6', 2),
    ],
  },
  {
    id: 'ogre', name: 'Ogre', emoji: '🧌', ac: 12, init: -1, hp: [97, 116, 121],
    attacks: [
      a(1, 'smash', 'Club Smash', 7, '2d8+6'),
      a(2, 'wild', 'Wild Swings', 6, '2d8+4', 2),
      a(3, 'overhead', 'Crushing Overhead', 8, '3d8+6'),
    ],
  },
  {
    id: 'owlbear', name: 'Owlbear', emoji: '🦉', ac: 13, init: 1, hp: [72, 86, 90],
    attacks: [
      a(1, 'beak', 'Beak', 7, '1d10+5'),
      a(2, 'claws', 'Claws', 7, '2d8+5'),
      a(3, 'hug', 'Rending Bear Hug', 7, '2d8+5', 2),
    ],
  },
  {
    id: 'giant-spider', name: 'Giant Spider', emoji: '🕷️', ac: 15, init: 3, hp: [62, 74, 78],
    attacks: [
      a(1, 'bite', 'Bite', 6, '1d8+3+1d8'),
      a(2, 'venom', 'Venomous Bite', 6, '1d8+3+2d8', 2),
      a(3, 'web', 'Web and Bite', 7, '1d8+3+3d8', 2),
    ],
  },
  {
    id: 'wight', name: 'Wight', emoji: '💀', ac: 15, init: 2, hp: [70, 84, 88],
    attacks: [
      a(1, 'sword', 'Longsword', 5, '1d8+3'),
      a(2, 'pair', 'Longsword Pair', 5, '1d8+3+1d6', 2),
      a(3, 'drain', 'Life Drain', 6, '1d8+3+2d6', 2),
    ],
  },
  {
    id: 'gnoll-fang', name: 'Gnoll Fang of Yeenoghu', emoji: '🐺', ac: 14, init: 2, hp: [82, 98, 102],
    attacks: [
      a(1, 'spear', 'Spear', 6, '1d8+3'),
      a(2, 'bite', 'Bite and Spear', 6, '1d8+3', 2),
      a(3, 'rampage', 'Rampage', 6, '1d8+3', 3),
    ],
  },
  {
    id: 'ghoul', name: 'Ghoul Pack Leader', emoji: '🧟', ac: 13, init: 2, hp: [72, 86, 90],
    attacks: [
      a(1, 'claw', 'Claw', 5, '2d6+3'),
      a(2, 'claws', 'Paralyzing Claws', 5, '2d6+3', 2),
      a(3, 'frenzy', 'Ravenous Frenzy', 6, '2d6+5', 2),
    ],
  },
  {
    id: 'minotaur-skeleton', name: 'Minotaur Skeleton', emoji: '🐂', ac: 12, init: 0, hp: [84, 101, 105],
    attacks: [
      a(1, 'slam', 'Horn Slam', 6, '2d8+4'),
      a(2, 'gore', 'Gore', 6, '2d12+4'),
      a(3, 'charge', 'Rampaging Charge', 7, '3d12+4'),
    ],
  },
  {
    id: 'hobgoblin-captain', name: 'Hobgoblin Captain', emoji: '⚔️', ac: 17, init: 1, hp: [66, 79, 82],
    attacks: [
      a(1, 'greatsword', 'Greatsword', 5, '2d6+3'),
      a(2, 'pair', 'Greatsword Pair', 5, '2d6+3', 2),
      a(3, 'barrage', 'Disciplined Barrage', 6, '2d6+3+1d6', 2),
    ],
  },
  {
    id: 'troll', name: 'Troll', emoji: '🪨', ac: 14, init: 1, hp: [78, 94, 98],
    attacks: [
      a(1, 'bite', 'Bite', 6, '1d6+3'),
      a(2, 'claws', 'Claws', 6, '2d6+3', 2),
      a(3, 'rend', 'Rend', 7, '2d6+4', 3),
    ],
  },
]
