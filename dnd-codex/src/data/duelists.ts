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
    id: 'fighter', name: 'Veteran Fighter', emoji: '🛡️', hp: 43, ac: 18, init: 1,
    attacks: [
      { id: 'longsword', name: 'Longsword', kind: 'action', toHit: 7, damage: '1d8+4', times: 2, blurb: 'Two swings' },
      { id: 'shove', name: 'Shield Bash', kind: 'bonus', toHit: 7, damage: '1d4+4' },
    ],
  },
  {
    id: 'rogue', name: 'Cunning Rogue', emoji: '🗡️', hp: 45, ac: 16, init: 4,
    attacks: [
      { id: 'rapier', name: 'Sneak Attack Rapier', kind: 'action', toHit: 7, damage: '1d8+4+3d6', blurb: 'Big, single strike' },
      { id: 'offhand', name: 'Off-hand Dagger', kind: 'bonus', toHit: 7, damage: '1d4+4' },
    ],
  },
  {
    id: 'barbarian', name: 'Raging Barbarian', emoji: '🪓', hp: 48, ac: 14, init: 1,
    attacks: [
      { id: 'greataxe', name: 'Greataxe', kind: 'action', toHit: 7, damage: '1d12+5', times: 2, blurb: 'Two heavy chops' },
      { id: 'headbutt', name: 'Headbutt', kind: 'bonus', toHit: 7, damage: '1d4+4' },
    ],
  },
  {
    id: 'paladin', name: 'Oath Paladin', emoji: '⚔️', hp: 43, ac: 18, init: 0,
    attacks: [
      { id: 'sword', name: 'Smite Longsword', kind: 'action', toHit: 7, damage: '1d8+4+2d8', blurb: 'Radiant smite' },
      { id: 'lay', name: 'Radiant Strike', kind: 'bonus', toHit: 6, damage: '1d6+3' },
    ],
  },
  {
    id: 'ranger', name: 'Wild Ranger', emoji: '🏹', hp: 48, ac: 16, init: 4,
    attacks: [
      { id: 'bow', name: 'Longbow', kind: 'action', toHit: 8, damage: '1d8+4', times: 2, blurb: 'Two arrows' },
      { id: 'mark', name: 'Hunter’s Mark Arrow', kind: 'bonus', toHit: 8, damage: '1d6+2' },
    ],
  },
  {
    id: 'monk', name: 'Flurry Monk', emoji: '👊', hp: 41, ac: 17, init: 4,
    attacks: [
      { id: 'strike', name: 'Unarmed Strikes', kind: 'action', toHit: 7, damage: '1d8+4', times: 2, blurb: 'Two fast hits' },
      { id: 'flurry', name: 'Flurry of Blows', kind: 'bonus', toHit: 7, damage: '1d8+4' },
    ],
  },
  {
    id: 'cleric', name: 'War Cleric', emoji: '🔨', hp: 35, ac: 18, init: 0,
    attacks: [
      { id: 'mace', name: 'Warhammer', kind: 'action', toHit: 6, damage: '1d8+3+1d8', times: 2, blurb: 'Two blessed swings' },
      { id: 'spirit', name: 'Spiritual Weapon', kind: 'bonus', toHit: 6, damage: '1d8+3' },
    ],
  },
  {
    id: 'warlock', name: 'Pact Warlock', emoji: '🔮', hp: 46, ac: 16, init: 2,
    attacks: [
      { id: 'blast', name: 'Eldritch Blast', kind: 'action', toHit: 7, damage: '1d10+4', times: 2, blurb: 'Two beams' },
      { id: 'hex', name: 'Hexblade Strike', kind: 'bonus', toHit: 7, damage: '1d6+3' },
    ],
  },
  {
    id: 'bard', name: 'Blade Bard', emoji: '🎻', hp: 54, ac: 15, init: 2,
    attacks: [
      { id: 'bard-a', name: 'Rapier Flourish', kind: 'action', toHit: 7, damage: '1d8+4', times: 2, blurb: 'Two thrusts' },
      { id: 'bard-b', name: 'Bardic Jab', kind: 'bonus', toHit: 7, damage: '1d6+3' },
    ],
  },
  {
    id: 'druid', name: 'Moon Druid', emoji: '🐾', hp: 59, ac: 15, init: 1,
    attacks: [
      { id: 'druid-a', name: 'Rend', kind: 'action', toHit: 6, damage: '1d8+4', times: 2, blurb: 'Claw and bite' },
      { id: 'druid-b', name: 'Thorn Whip', kind: 'bonus', toHit: 6, damage: '1d6+3' },
    ],
  },
  {
    id: 'sorcerer', name: 'Storm Sorcerer', emoji: '⚡', hp: 51, ac: 14, init: 2,
    attacks: [
      { id: 'sorcerer-a', name: 'Twinned Firebolt', kind: 'action', toHit: 7, damage: '1d10+4', times: 2, blurb: 'Two bolts' },
      { id: 'sorcerer-b', name: 'Quickened Spark', kind: 'bonus', toHit: 7, damage: '1d8+3' },
    ],
  },
  {
    id: 'wizard', name: 'Battle Wizard', emoji: '📖', hp: 36, ac: 15, init: 2,
    attacks: [
      { id: 'wizard-a', name: 'Scorching Ray', kind: 'action', toHit: 7, damage: '2d6+3', times: 3, blurb: 'Three rays' },
      { id: 'wizard-b', name: 'Shadow Dart', kind: 'bonus', toHit: 6, damage: '1d6+2' },
    ],
  },
  {
    id: 'knight', name: 'Dueling Knight', emoji: '🤺', hp: 36, ac: 18, init: 1,
    attacks: [
      { id: 'knight-a', name: 'Greatsword', kind: 'action', toHit: 7, damage: '2d6+4', times: 2, blurb: 'Two cuts' },
      { id: 'knight-b', name: 'Pommel Strike', kind: 'bonus', toHit: 7, damage: '1d4+4' },
    ],
  },
  {
    id: 'berserker', name: 'Frenzied Berserker', emoji: '😤', hp: 46, ac: 13, init: 1,
    attacks: [
      { id: 'berserker-a', name: 'Handaxe Barrage', kind: 'action', toHit: 7, damage: '1d6+5', times: 3, blurb: 'Three throws' },
      { id: 'berserker-b', name: 'Frenzied Strike', kind: 'bonus', toHit: 7, damage: '1d6+4' },
    ],
  },
  {
    id: 'assassin', name: 'Shadow Assassin', emoji: '🌑', hp: 44, ac: 15, init: 5,
    attacks: [
      { id: 'assassin-a', name: 'Assassinate', kind: 'action', toHit: 7, damage: '1d6+4+4d6', blurb: 'One deadly strike' },
      { id: 'assassin-b', name: 'Dagger Flick', kind: 'bonus', toHit: 7, damage: '1d4+4' },
    ],
  },
  {
    id: 'warden', name: 'Beast Warden', emoji: '🐺', hp: 60, ac: 15, init: 2,
    attacks: [
      { id: 'warden-a', name: 'Shortbow Volley', kind: 'action', toHit: 7, damage: '1d6+4', times: 2, blurb: 'Two arrows' },
      { id: 'warden-b', name: 'Wolf Companion Bite', kind: 'bonus', toHit: 6, damage: '1d6+3' },
    ],
  },
  {
    id: 'light-cleric', name: 'Light Cleric', emoji: '☀️', hp: 60, ac: 17, init: 0,
    attacks: [
      { id: 'light-cleric-a', name: 'Radiant Flame', kind: 'action', toHit: 7, damage: '2d8+3', blurb: 'Searing light' },
      { id: 'light-cleric-b', name: 'Warding Smite', kind: 'bonus', toHit: 6, damage: '1d6+3' },
    ],
  },
  {
    id: 'vengeance', name: 'Vengeance Paladin', emoji: '🔥', hp: 39, ac: 18, init: 0,
    attacks: [
      { id: 'vengeance-a', name: 'Greatsword Smite', kind: 'action', toHit: 7, damage: '2d6+4+2d8', blurb: 'Radiant smite' },
      { id: 'vengeance-b', name: 'Vow Strike', kind: 'bonus', toHit: 6, damage: '1d6+3' },
    ],
  },
  {
    id: 'shadow-monk', name: 'Shadow Monk', emoji: '🌘', hp: 41, ac: 17, init: 4,
    attacks: [
      { id: 'shadow-monk-a', name: 'Shadow Strikes', kind: 'action', toHit: 7, damage: '1d8+4', times: 2, blurb: 'Two quick hits' },
      { id: 'shadow-monk-b', name: 'Shadow Flurry', kind: 'bonus', toHit: 7, damage: '1d8+4' },
    ],
  },
  {
    id: 'skald', name: 'Skald Warrior', emoji: '🪕', hp: 40, ac: 16, init: 1,
    attacks: [
      { id: 'skald-a', name: 'Battleaxe', kind: 'action', toHit: 7, damage: '1d8+4+1d6', times: 2, blurb: 'Inspired swings' },
      { id: 'skald-b', name: 'War Cry Bash', kind: 'bonus', toHit: 7, damage: '1d4+4' },
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
    id: 'goblin-boss', name: 'Goblin Boss', emoji: '👺', ac: 17, init: 2, hp: [36, 54, 56],
    attacks: [
      a(1, 'jab', 'Scimitar Pair', 6, '1d6+4', 2),
      a(2, 'flurry', 'Scimitar Flurry', 6, '1d6+4', 3),
      a(3, 'frenzy', 'Nimble Frenzy', 7, '1d6+4+1d6', 3),
    ],
  },
  {
    id: 'bugbear', name: 'Bugbear Chief', emoji: '🐻', ac: 17, init: 2, hp: [49, 72, 74],
    attacks: [
      a(1, 'swing', 'Morningstar Swing', 4, '2d8+2'),
      a(2, 'pair', 'Morningstar Pair', 4, '2d8+2', 2),
      a(3, 'ambush', 'Brutal Ambush', 5, '2d8+2+2d6', 2),
    ],
  },
  {
    id: 'orc', name: 'Orc War Chief', emoji: '👹', ac: 15, init: 1, hp: [67, 89, 91],
    attacks: [
      a(1, 'chop', 'Axe Chop', 5, '1d12+3'),
      a(2, 'flurry', 'Greataxe Flurry', 5, '1d12+3', 2),
      a(3, 'fury', 'Blood Fury', 6, '1d12+3+1d6', 2),
    ],
  },
  {
    id: 'ogre', name: 'Ogre', emoji: '🧌', ac: 12, init: -1, hp: [45, 69, 89],
    attacks: [
      a(1, 'smash', 'Club Smash', 7, '2d8+6'),
      a(2, 'wild', 'Wild Swings', 6, '2d8+4', 2),
      a(3, 'overhead', 'Crushing Overhead', 8, '3d8+6'),
    ],
  },
  {
    id: 'owlbear', name: 'Owlbear', emoji: '🦉', ac: 13, init: 1, hp: [68, 104, 106],
    attacks: [
      a(1, 'beak', 'Beak', 7, '1d10+5'),
      a(2, 'claws', 'Claws', 7, '2d8+5'),
      a(3, 'hug', 'Rending Bear Hug', 7, '2d8+5', 2),
    ],
  },
  {
    id: 'giant-spider', name: 'Giant Spider', emoji: '🕷️', ac: 15, init: 3, hp: [44, 50, 53],
    attacks: [
      a(1, 'bite', 'Bite', 6, '1d8+3+1d8'),
      a(2, 'venom', 'Venomous Bite', 6, '1d8+3+2d8', 2),
      a(3, 'web', 'Web and Bite', 7, '1d8+3+3d8', 2),
    ],
  },
  {
    id: 'wight', name: 'Wight', emoji: '💀', ac: 15, init: 2, hp: [56, 75, 79],
    attacks: [
      a(1, 'sword', 'Longsword', 5, '1d8+3+1d6'),
      a(2, 'pair', 'Longsword Pair', 5, '1d8+3+1d6', 2),
      a(3, 'drain', 'Life Drain', 6, '1d8+3+2d6', 2),
    ],
  },
  {
    id: 'gnoll-fang', name: 'Gnoll Fang of Yeenoghu', emoji: '🐺', ac: 14, init: 2, hp: [99, 115, 117],
    attacks: [
      a(1, 'spear', 'Spear', 6, '1d8+3'),
      a(2, 'bite', 'Bite and Spear', 6, '1d8+3', 2),
      a(3, 'rampage', 'Rampage', 6, '1d8+3', 3),
    ],
  },
  {
    id: 'ghoul', name: 'Ghoul Pack Leader', emoji: '🧟', ac: 13, init: 2, hp: [79, 99, 103],
    attacks: [
      a(1, 'claw', 'Claw', 5, '2d6+3'),
      a(2, 'claws', 'Paralyzing Claws', 5, '2d6+3', 2),
      a(3, 'frenzy', 'Ravenous Frenzy', 6, '2d6+5', 2),
    ],
  },
  {
    id: 'minotaur-skeleton', name: 'Minotaur Skeleton', emoji: '🐂', ac: 12, init: 0, hp: [56, 97, 109],
    attacks: [
      a(1, 'slam', 'Horn Slam', 6, '2d8+4'),
      a(2, 'gore', 'Gore', 6, '2d12+4'),
      a(3, 'charge', 'Rampaging Charge', 7, '3d12+4'),
    ],
  },
  {
    id: 'hobgoblin-captain', name: 'Hobgoblin Captain', emoji: '⚔️', ac: 17, init: 1, hp: [53, 71, 73],
    attacks: [
      a(1, 'greatsword', 'Greatsword', 5, '2d6+3'),
      a(2, 'pair', 'Greatsword Pair', 5, '2d6+3', 2),
      a(3, 'barrage', 'Disciplined Barrage', 6, '2d6+3+1d6', 2),
    ],
  },
  {
    id: 'troll', name: 'Troll', emoji: '🪨', ac: 14, init: 1, hp: [64, 85, 87],
    attacks: [
      a(1, 'claw', 'Claw', 6, '2d6+3'),
      a(2, 'claws', 'Claws', 6, '2d6+3', 2),
      a(3, 'rend', 'Rend', 7, '2d6+4', 3),
    ],
  },
  {
    id: 'bandit-captain', name: 'Bandit Captain', emoji: '🏴‍☠️', ac: 15, init: 3, hp: [70, 83, 85],
    attacks: [
      a(1, 'scimitar-jab', 'Scimitar Jab', 6, '1d6+6'),
      a(2, 'scimitar-and-dagger', 'Scimitar and Dagger', 6, '1d6+6', 2),
      a(3, 'dirty-tricks', 'Dirty Tricks', 7, '1d6+3+2d6+3', 2),
    ],
  },
  {
    id: 'veteran', name: 'Veteran', emoji: '🎖️', ac: 17, init: 1, hp: [48, 64, 66],
    attacks: [
      a(1, 'longsword', 'Longsword', 6, '1d8+6'),
      a(2, 'longsword-pair', 'Longsword Pair', 6, '1d8+6', 2),
      a(3, 'shield-rush', 'Shield Rush', 7, '1d8+3+1d6+3', 2),
    ],
  },
  {
    id: 'cult-fanatic', name: 'Cult Fanatic', emoji: '🕯️', ac: 13, init: 2, hp: [59, 74, 89],
    attacks: [
      a(1, 'dagger-jab', 'Dagger Jab', 6, '1d4+3+1d6+3'),
      a(2, 'dark-devotion', 'Dark Devotion', 6, '1d4+3+1d6+3', 2),
      a(3, 'inflict-wounds', 'Inflict Wounds', 8, '4d8+3'),
    ],
  },
  {
    id: 'wererat', name: 'Wererat', emoji: '🐀', ac: 12, init: 3, hp: [111, 113, 115],
    attacks: [
      a(1, 'shortsword', 'Shortsword', 5, '1d6+5'),
      a(2, 'shortsword-and-bite', 'Shortsword and Bite', 5, '1d6+2+1d4+3', 2),
      a(3, 'rat-swarm-frenzy', 'Rat Swarm Frenzy', 6, '1d6+3+1d6+3', 3),
    ],
  },
  {
    id: 'werewolf', name: 'Werewolf', emoji: '🌕', ac: 12, init: 1, hp: [90, 104, 106],
    attacks: [
      a(1, 'bite', 'Bite', 6, '1d8+5'),
      a(2, 'claws', 'Claws', 5, '2d4+5', 2),
      a(3, 'savage-mauling', 'Savage Mauling', 7, '2d6+6', 2),
    ],
  },
  {
    id: 'dire-wolf', name: 'Dire Wolf', emoji: '🐕', ac: 14, init: 2, hp: [48, 62, 72],
    attacks: [
      a(1, 'bite', 'Bite', 6, '2d6+6'),
      a(2, 'pounce-and-bite', 'Pounce and Bite', 6, '2d6+6', 2),
      a(3, 'pack-fury', 'Pack Fury', 7, '2d6+7', 2),
    ],
  },
  {
    id: 'giant-boar', name: 'Giant Boar', emoji: '🐗', ac: 12, init: 0, hp: [60, 75, 80],
    attacks: [
      a(1, 'tusk', 'Tusk', 6, '2d6+6'),
      a(2, 'charging-tusk', 'Charging Tusk', 6, '2d6+6', 2),
      a(3, 'gore-rampage', 'Gore Rampage', 7, '3d6+6', 2),
    ],
  },
  {
    id: 'brown-bear', name: 'Brown Bear', emoji: '🐻', ac: 11, init: 0, hp: [77, 122, 124],
    attacks: [
      a(1, 'bite', 'Bite', 6, '1d8+7'),
      a(2, 'claws', 'Claws', 6, '2d6+7'),
      a(3, 'maul', 'Maul', 7, '2d6+7', 2),
    ],
  },
  {
    id: 'mummy', name: 'Mummy', emoji: '🧻', ac: 11, init: -1, hp: [62, 82, 85],
    attacks: [
      a(1, 'rotting-fist', 'Rotting Fist', 6, '2d6+6'),
      a(2, 'fist-pair', 'Fist Pair', 6, '2d6+6', 2),
      a(3, 'mummy-rot-curse', 'Mummy Rot Curse', 7, '3d6+6', 2),
    ],
  },
  {
    id: 'specter', name: 'Specter', emoji: '👻', ac: 12, init: 2, hp: [55, 75, 79],
    attacks: [
      a(1, 'life-drain', 'Life Drain', 5, '3d6+3'),
      a(2, 'draining-touch', 'Draining Touch', 5, '3d6+3', 2),
      a(3, 'soul-siphon', 'Soul Siphon', 7, '4d6+3', 2),
    ],
  },
  {
    id: 'ghast', name: 'Ghast', emoji: '🧟‍♂️', ac: 13, init: 3, hp: [53, 67, 76],
    attacks: [
      a(1, 'claw', 'Claw', 6, '2d6+6'),
      a(2, 'claws', 'Claws', 6, '2d6+6', 2),
      a(3, 'stench-frenzy', 'Stench Frenzy', 7, '2d6+7', 2),
    ],
  },
  {
    id: 'zombie-ogre', name: 'Ogre Zombie', emoji: '🧟‍♀️', ac: 8, init: -2, hp: [54, 68, 93],
    attacks: [
      a(1, 'morningstar', 'Morningstar', 7, '2d8+7'),
      a(2, 'slow-swings', 'Slow Swings', 7, '2d8+7', 2),
      a(3, 'undead-fortitude-smash', 'Undead Fortitude Smash', 8, '3d8+7'),
    ],
  },
  {
    id: 'skeleton-knight', name: 'Skeleton Knight', emoji: '☠️', ac: 16, init: 1, hp: [55, 69, 71],
    attacks: [
      a(1, 'longsword', 'Longsword', 6, '1d8+6'),
      a(2, 'longsword-pair', 'Longsword Pair', 6, '1d8+6', 2),
      a(3, 'rattling-charge', 'Rattling Charge', 7, '1d8+3+2d6+3', 2),
    ],
  },
  {
    id: 'harpy-matriarch', name: 'Harpy Matriarch', emoji: '🦅', ac: 13, init: 1, hp: [83, 98, 100],
    attacks: [
      a(1, 'claws', 'Claws', 5, '2d4+5'),
      a(2, 'claws-and-club', 'Claws and Club', 5, '2d4+5', 2),
      a(3, 'luring-dive', 'Luring Dive', 7, '2d6+6', 2),
    ],
  },
  {
    id: 'manticore', name: 'Manticore', emoji: '🦁', ac: 14, init: 3, hp: [65, 67, 69],
    attacks: [
      a(1, 'bite', 'Bite', 6, '1d8+6'),
      a(2, 'tail-spikes', 'Tail Spikes', 6, '1d8+6', 3),
      a(3, 'spike-volley', 'Spike Volley', 7, '1d8+7', 3),
    ],
  },
  {
    id: 'griffon', name: 'Griffon', emoji: '🪶', ac: 12, init: 2, hp: [66, 78, 80],
    attacks: [
      a(1, 'beak', 'Beak', 7, '1d8+7'),
      a(2, 'beak-and-claws', 'Beak and Claws', 7, '1d8+7', 2),
      a(3, 'dive-attack', 'Dive Attack', 8, '2d8+7', 2),
    ],
  },
  {
    id: 'lizardfolk-chief', name: 'Lizardfolk Chief', emoji: '🦎', ac: 15, init: 0, hp: [61, 77, 80],
    attacks: [
      a(1, 'spear', 'Spear', 6, '1d8+6'),
      a(2, 'spear-and-bite', 'Spear and Bite', 6, '1d8+6', 2),
      a(3, 'cunning-strikes', 'Cunning Strikes', 7, '1d8+3+1d6+3', 2),
    ],
  },
  {
    id: 'kobold-champion', name: 'Kobold Champion', emoji: '🐲', ac: 15, init: 2, hp: [33, 49, 53],
    attacks: [
      a(1, 'spear-jab', 'Spear Pair', 6, '1d6+6', 2),
      a(2, 'spear-flurry', 'Spear Flurry', 6, '1d6+6', 3),
      a(3, 'pack-tactics', 'Pack Tactics', 7, '1d6+3+1d6+3', 3),
    ],
  },
  {
    id: 'red-wyrmling', name: 'Red Dragon Wyrmling', emoji: '🐉', ac: 17, init: 0, hp: [34, 49, 56],
    attacks: [
      a(1, 'bite', 'Bite', 7, '1d10+7'),
      a(2, 'bite-and-claws', 'Bite and Claws', 7, '1d10+7', 2),
      a(3, 'fire-breath', 'Fire Breath', 8, '8d6'),
    ],
  },
  {
    id: 'white-wyrmling', name: 'White Dragon Wyrmling', emoji: '❄️', ac: 16, init: 0, hp: [45, 57, 66],
    attacks: [
      a(1, 'bite', 'Bite', 7, '1d10+6'),
      a(2, 'bite-and-claws', 'Bite and Claws', 7, '1d10+6', 2),
      a(3, 'frost-breath', 'Frost Breath', 8, '7d6'),
    ],
  },
  {
    id: 'phase-spider', name: 'Phase Spider', emoji: '🕸️', ac: 13, init: 2, hp: [58, 80, 88],
    attacks: [
      a(1, 'bite', 'Bite', 7, '1d10+6'),
      a(2, 'venomous-bite', 'Venomous Bite', 7, '1d10+3+2d6+3'),
      a(3, 'ambush-bite', 'Ambush Bite', 8, '1d10+3+4d6+3'),
    ],
  },
  {
    id: 'ettercap', name: 'Ettercap', emoji: '🪲', ac: 13, init: 2, hp: [86, 108, 110],
    attacks: [
      a(1, 'claws', 'Claws', 5, '1d8+5'),
      a(2, 'claws-and-bite', 'Claws and Bite', 5, '1d8+5', 2),
      a(3, 'web-ambush', 'Web Ambush', 7, '1d8+3+2d6+3', 2),
    ],
  },
  {
    id: 'gargoyle', name: 'Gargoyle', emoji: '🗿', ac: 15, init: 0, hp: [89, 106, 108],
    attacks: [
      a(1, 'claws', 'Claws', 5, '1d6+5'),
      a(2, 'bite-and-claws', 'Bite and Claws', 5, '1d6+5', 2),
      a(3, 'stone-dive', 'Stone Dive', 7, '2d6+6', 2),
    ],
  },
  {
    id: 'doppelganger', name: 'Doppelganger', emoji: '🎭', ac: 14, init: 4, hp: [61, 73, 75],
    attacks: [
      a(1, 'slam', 'Slam', 7, '1d6+7'),
      a(2, 'slam-pair', 'Slam Pair', 7, '1d6+7', 2),
      a(3, 'mimic-strike', 'Mimic Strike', 8, '1d6+4+2d6+3', 2),
    ],
  },
  {
    id: 'wyvern', name: 'Wyvern', emoji: '🦂', ac: 13, init: 0, hp: [43, 56, 58],
    attacks: [
      a(1, 'bite', 'Bite', 8, '2d6+7'),
      a(2, 'bite-and-stinger', 'Bite and Stinger', 8, '2d6+7', 2),
      a(3, 'poison-sting', 'Poison Sting', 8, '2d6+4+3d6+3', 2),
    ],
  },
  {
    id: 'fallen-knight', name: 'Fallen Knight', emoji: '🖤', ac: 18, init: 1, hp: [29, 41, 43],
    attacks: [
      a(1, 'greatsword', 'Greatsword', 7, '2d6+6'),
      a(2, 'greatsword-pair', 'Greatsword Pair', 7, '2d6+6', 2),
      a(3, 'dread-cleave', 'Dread Cleave', 8, '2d6+3+2d6+3', 2),
    ],
  },
  {
    id: 'swamp-hag', name: 'Swamp Hag', emoji: '🧙‍♀️', ac: 14, init: 1, hp: [35, 52, 54],
    attacks: [
      a(1, 'claws', 'Claws', 7, '2d8+6'),
      a(2, 'claws-pair', 'Claws Pair', 7, '2d8+6', 2),
      a(3, 'hex-strike', 'Hex Strike', 8, '2d8+3+2d6+3', 2),
    ],
  },
  {
    id: 'bone-naga', name: 'Bone Naga', emoji: '🐍', ac: 15, init: 2, hp: [25, 39, 58],
    attacks: [
      a(1, 'bite', 'Bite', 7, '1d8+3+2d6+3'),
      a(2, 'bite-and-spit', 'Bite and Spit', 7, '1d8+3+2d6+3', 2),
      a(3, 'lightning-bolt-fang', 'Lightning Bolt Fang', 8, '4d8+3'),
    ],
  },
]
