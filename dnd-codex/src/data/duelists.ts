// Curated duelists for the Daily Duel (T-63). The srdMonsters.json bundle only
// carries HP/AC/DEX, so the game needs explicit attack bonuses and damage dice.
// Heroes are roughly level-5 adventurers; foes are CR 1–3 SRD-style creatures.
// Numbers are tuned so a smart player wins most (not all) duels. After changing
// any attack, HP or signature move, re-run `npm run duel:sim -- report` and, if
// the win rates drift, `npm run duel:sim -- tune --write` (see scripts/duel-sim.mjs).

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
  /** Which on-screen effect plays (see `attackFx`); derived from the name when absent. */
  fx?: 'slash' | 'smash' | 'burst' | 'arc' | 'spear'
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
    id: 'fighter', name: 'Veteran Fighter', emoji: '🛡️', hp: 37, ac: 18, init: 1,
    attacks: [
      { id: 'longsword', name: 'Longsword', kind: 'action', toHit: 7, damage: '1d8+4', times: 2, blurb: 'Two swings' },
      { id: 'shove', name: 'Shield Bash', kind: 'bonus', toHit: 7, damage: '1d4+4' },
    ],
  },
  {
    id: 'rogue', name: 'Cunning Rogue', emoji: '🗡️', hp: 55, ac: 16, init: 4,
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
    id: 'paladin', name: 'Oath Paladin', emoji: '⚔️', hp: 45, ac: 18, init: 0,
    attacks: [
      { id: 'sword', name: 'Smite Longsword', kind: 'action', toHit: 7, damage: '1d8+4+2d8', blurb: 'Radiant smite' },
      { id: 'lay', name: 'Radiant Strike', kind: 'bonus', toHit: 6, damage: '1d6+3' },
    ],
  },
  {
    id: 'ranger', name: 'Wild Ranger', emoji: '🏹', hp: 46, ac: 16, init: 4,
    attacks: [
      { id: 'bow', name: 'Longbow', kind: 'action', toHit: 8, damage: '1d8+4', times: 2, blurb: 'Two arrows' },
      { id: 'mark', name: 'Hunter’s Mark Arrow', kind: 'bonus', toHit: 8, damage: '1d6+2' },
    ],
  },
  {
    id: 'monk', name: 'Flurry Monk', emoji: '👊', hp: 43, ac: 17, init: 4,
    attacks: [
      { id: 'strike', name: 'Unarmed Strikes', kind: 'action', toHit: 7, damage: '1d8+4', times: 2, blurb: 'Two fast hits' },
      { id: 'flurry', name: 'Flurry of Blows', kind: 'bonus', toHit: 7, damage: '1d8+4' },
    ],
  },
  {
    id: 'cleric', name: 'War Cleric', emoji: '🔨', hp: 31, ac: 18, init: 0,
    attacks: [
      { id: 'mace', name: 'Warhammer', kind: 'action', toHit: 6, damage: '1d8+3+1d8', times: 2, blurb: 'Two blessed swings' },
      { id: 'spirit', name: 'Spiritual Weapon', kind: 'bonus', toHit: 6, damage: '1d8+3' },
    ],
  },
  {
    id: 'warlock', name: 'Pact Warlock', emoji: '🔮', hp: 43, ac: 16, init: 2,
    attacks: [
      { id: 'blast', name: 'Eldritch Blast', kind: 'action', toHit: 7, damage: '1d10+4', times: 2, blurb: 'Two beams' },
      { id: 'hex', name: 'Hexblade Strike', kind: 'bonus', toHit: 7, damage: '1d6+3' },
    ],
  },
  {
    id: 'bard', name: 'Blade Bard', emoji: '🎻', hp: 57, ac: 15, init: 2,
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
    id: 'sorcerer', name: 'Storm Sorcerer', emoji: '⚡', hp: 48, ac: 14, init: 2,
    attacks: [
      { id: 'sorcerer-a', name: 'Twinned Firebolt', kind: 'action', toHit: 7, damage: '1d10+4', times: 2, blurb: 'Two bolts' },
      { id: 'sorcerer-b', name: 'Quickened Spark', kind: 'bonus', toHit: 7, damage: '1d8+3' },
    ],
  },
  {
    id: 'wizard', name: 'Battle Wizard', emoji: '📖', hp: 37, ac: 15, init: 2,
    attacks: [
      { id: 'wizard-a', name: 'Scorching Ray', kind: 'action', toHit: 7, damage: '2d6+3', times: 3, blurb: 'Three rays' },
      { id: 'wizard-b', name: 'Shadow Dart', kind: 'bonus', toHit: 6, damage: '1d6+2' },
    ],
  },
  {
    id: 'knight', name: 'Dueling Knight', emoji: '🤺', hp: 37, ac: 18, init: 1,
    attacks: [
      { id: 'knight-a', name: 'Greatsword', kind: 'action', toHit: 7, damage: '2d6+4', times: 2, blurb: 'Two cuts' },
      { id: 'knight-b', name: 'Pommel Strike', kind: 'bonus', toHit: 7, damage: '1d4+4' },
    ],
  },
  {
    id: 'berserker', name: 'Frenzied Berserker', emoji: '😤', hp: 49, ac: 13, init: 1,
    attacks: [
      { id: 'berserker-a', name: 'Handaxe Barrage', kind: 'action', toHit: 7, damage: '1d6+5', times: 3, blurb: 'Three throws' },
      { id: 'berserker-b', name: 'Frenzied Strike', kind: 'bonus', toHit: 7, damage: '1d6+4' },
    ],
  },
  {
    id: 'assassin', name: 'Shadow Assassin', emoji: '🌑', hp: 41, ac: 15, init: 5,
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
    id: 'light-cleric', name: 'Light Cleric', emoji: '☀️', hp: 64, ac: 17, init: 0,
    attacks: [
      { id: 'light-cleric-a', name: 'Radiant Flame', kind: 'action', toHit: 7, damage: '2d8+3', blurb: 'Searing light' },
      { id: 'light-cleric-b', name: 'Warding Smite', kind: 'bonus', toHit: 6, damage: '1d6+3' },
    ],
  },
  {
    id: 'vengeance', name: 'Vengeance Paladin', emoji: '🔥', hp: 43, ac: 18, init: 0,
    attacks: [
      { id: 'vengeance-a', name: 'Greatsword Smite', kind: 'action', toHit: 7, damage: '2d6+4+2d8', blurb: 'Radiant smite' },
      { id: 'vengeance-b', name: 'Vow Strike', kind: 'bonus', toHit: 6, damage: '1d6+3' },
    ],
  },
  {
    id: 'shadow-monk', name: 'Shadow Monk', emoji: '🌘', hp: 39, ac: 17, init: 4,
    attacks: [
      { id: 'shadow-monk-a', name: 'Shadow Strikes', kind: 'action', toHit: 7, damage: '1d8+4', times: 2, blurb: 'Two quick hits' },
      { id: 'shadow-monk-b', name: 'Shadow Flurry', kind: 'bonus', toHit: 7, damage: '1d8+4' },
    ],
  },
  {
    id: 'skald', name: 'Skald Warrior', emoji: '🪕', hp: 38, ac: 16, init: 1,
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
    id: 'goblin-boss', name: 'Goblin Boss', emoji: '👺', ac: 17, init: 2, hp: [33, 56, 63],
    attacks: [
      a(1, 'jab', 'Scimitar Pair', 6, '1d6+4', 2),
      a(2, 'flurry', 'Scimitar Flurry', 6, '1d6+4', 3),
      a(3, 'frenzy', 'Nimble Frenzy', 7, '1d6+4+1d6', 3),
    ],
  },
  {
    id: 'bugbear', name: 'Bugbear Chief', emoji: '🐻', ac: 17, init: 2, hp: [49, 77, 79],
    attacks: [
      a(1, 'swing', 'Morningstar Swing', 4, '2d8+2'),
      a(2, 'pair', 'Morningstar Pair', 4, '2d8+2', 2),
      a(3, 'ambush', 'Brutal Ambush', 5, '2d8+2+2d6', 2),
    ],
  },
  {
    id: 'orc', name: 'Orc War Chief', emoji: '👹', ac: 15, init: 1, hp: [73, 97, 108],
    attacks: [
      a(1, 'chop', 'Axe Chop', 5, '1d12+3'),
      a(2, 'flurry', 'Greataxe Flurry', 5, '1d12+3', 2),
      a(3, 'fury', 'Blood Fury', 6, '1d12+3+1d6', 2),
    ],
  },
  {
    id: 'ogre', name: 'Ogre', emoji: '🧌', ac: 12, init: -1, hp: [51, 80, 110],
    attacks: [
      a(1, 'smash', 'Club Smash', 7, '2d8+6'),
      a(2, 'wild', 'Wild Swings', 6, '2d8+4', 2),
      a(3, 'overhead', 'Crushing Overhead', 8, '3d8+6'),
    ],
  },
  {
    id: 'owlbear', name: 'Owlbear', emoji: '🦉', ac: 13, init: 1, hp: [68, 113, 116],
    attacks: [
      a(1, 'beak', 'Beak', 7, '1d10+5'),
      a(2, 'claws', 'Claws', 7, '2d8+5'),
      a(3, 'hug', 'Rending Bear Hug', 7, '2d8+5', 2),
    ],
  },
  {
    id: 'giant-spider', name: 'Giant Spider', emoji: '🕷️', ac: 15, init: 3, hp: [46, 54, 64],
    attacks: [
      a(1, 'bite', 'Bite', 6, '1d8+3+1d8'),
      a(2, 'venom', 'Venomous Bite', 6, '1d8+3+2d8', 2),
      a(3, 'web', 'Web and Bite', 7, '1d8+3+3d8', 2),
    ],
  },
  {
    id: 'wight', name: 'Wight', emoji: '💀', ac: 15, init: 2, hp: [59, 85, 95],
    attacks: [
      a(1, 'sword', 'Longsword', 5, '1d8+3+1d6'),
      a(2, 'pair', 'Longsword Pair', 5, '1d8+3+1d6', 2),
      a(3, 'drain', 'Life Drain', 6, '1d8+3+2d6', 2),
    ],
  },
  {
    id: 'gnoll-fang', name: 'Gnoll Fang of Yeenoghu', emoji: '🐺', ac: 14, init: 2, hp: [103, 129, 133],
    attacks: [
      a(1, 'spear', 'Spear', 6, '1d8+3'),
      a(2, 'bite', 'Bite and Spear', 6, '1d8+3', 2),
      a(3, 'rampage', 'Rampage', 6, '1d8+3', 3),
    ],
  },
  {
    id: 'ghoul', name: 'Ghoul Pack Leader', emoji: '🧟', ac: 13, init: 2, hp: [88, 111, 127],
    attacks: [
      a(1, 'claw', 'Claw', 5, '2d6+3'),
      a(2, 'claws', 'Paralyzing Claws', 5, '2d6+3', 2),
      a(3, 'frenzy', 'Ravenous Frenzy', 6, '2d6+5', 2),
    ],
  },
  {
    id: 'minotaur-skeleton', name: 'Minotaur Skeleton', emoji: '🐂', ac: 12, init: 0, hp: [63, 114, 131],
    attacks: [
      a(1, 'slam', 'Horn Slam', 6, '2d8+4'),
      a(2, 'gore', 'Gore', 6, '2d12+4'),
      a(3, 'charge', 'Rampaging Charge', 7, '3d12+4'),
    ],
  },
  {
    id: 'hobgoblin-captain', name: 'Hobgoblin Captain', emoji: '⚔️', ac: 17, init: 1, hp: [58, 79, 88],
    attacks: [
      a(1, 'greatsword', 'Greatsword', 5, '2d6+3'),
      a(2, 'pair', 'Greatsword Pair', 5, '2d6+3', 2),
      a(3, 'barrage', 'Disciplined Barrage', 6, '2d6+3+1d6', 2),
    ],
  },
  {
    id: 'troll', name: 'Troll', emoji: '🪨', ac: 14, init: 1, hp: [70, 92, 94],
    attacks: [
      a(1, 'claw', 'Claw', 6, '2d6+3'),
      a(2, 'claws', 'Claws', 6, '2d6+3', 2),
      a(3, 'rend', 'Rend', 7, '2d6+4', 3),
    ],
  },
  {
    id: 'bandit-captain', name: 'Bandit Captain', emoji: '🏴‍☠️', ac: 15, init: 3, hp: [71, 94, 95],
    attacks: [
      a(1, 'scimitar-jab', 'Scimitar Jab', 6, '1d6+6'),
      a(2, 'scimitar-and-dagger', 'Scimitar and Dagger', 6, '1d6+6', 2),
      a(3, 'dirty-tricks', 'Dirty Tricks', 7, '1d6+3+2d6+3', 2),
    ],
  },
  {
    id: 'veteran', name: 'Veteran', emoji: '🎖️', ac: 17, init: 1, hp: [49, 70, 76],
    attacks: [
      a(1, 'longsword', 'Longsword', 6, '1d8+6'),
      a(2, 'longsword-pair', 'Longsword Pair', 6, '1d8+6', 2),
      a(3, 'shield-rush', 'Shield Rush', 7, '1d8+3+1d6+3', 2),
    ],
  },
  {
    id: 'cult-fanatic', name: 'Cult Fanatic', emoji: '🕯️', ac: 13, init: 2, hp: [63, 85, 105],
    attacks: [
      a(1, 'dagger-jab', 'Dagger Jab', 6, '1d4+3+1d6+3'),
      a(2, 'dark-devotion', 'Dark Devotion', 6, '1d4+3+1d6+3', 2),
      a(3, 'inflict-wounds', 'Inflict Wounds', 8, '4d8+3'),
    ],
  },
  {
    id: 'wererat', name: 'Wererat', emoji: '🐀', ac: 12, init: 3, hp: [125, 126, 127],
    attacks: [
      a(1, 'shortsword', 'Shortsword', 5, '1d6+5'),
      a(2, 'shortsword-and-bite', 'Shortsword and Bite', 5, '1d6+2+1d4+3', 2),
      a(3, 'rat-swarm-frenzy', 'Rat Swarm Frenzy', 6, '1d6+3+1d6+3', 3),
    ],
  },
  {
    id: 'werewolf', name: 'Werewolf', emoji: '🌕', ac: 12, init: 1, hp: [92, 121, 126],
    attacks: [
      a(1, 'bite', 'Bite', 6, '1d8+5'),
      a(2, 'claws', 'Claws', 5, '2d4+5', 2),
      a(3, 'savage-mauling', 'Savage Mauling', 7, '2d6+6', 2),
    ],
  },
  {
    id: 'dire-wolf', name: 'Dire Wolf', emoji: '🐕', ac: 14, init: 2, hp: [53, 72, 87],
    attacks: [
      a(1, 'bite', 'Bite', 6, '2d6+6'),
      a(2, 'pounce-and-bite', 'Pounce and Bite', 6, '2d6+6', 2),
      a(3, 'pack-fury', 'Pack Fury', 7, '2d6+7', 2),
    ],
  },
  {
    id: 'giant-boar', name: 'Giant Boar', emoji: '🐗', ac: 12, init: 0, hp: [66, 86, 103],
    attacks: [
      a(1, 'tusk', 'Tusk', 6, '2d6+6'),
      a(2, 'charging-tusk', 'Charging Tusk', 6, '2d6+6', 2),
      a(3, 'gore-rampage', 'Gore Rampage', 7, '3d6+6', 2),
    ],
  },
  {
    id: 'brown-bear', name: 'Brown Bear', emoji: '🐻', ac: 11, init: 0, hp: [86, 141, 144],
    attacks: [
      a(1, 'bite', 'Bite', 6, '1d8+7'),
      a(2, 'claws', 'Claws', 6, '2d6+7'),
      a(3, 'maul', 'Maul', 7, '2d6+7', 2),
    ],
  },
  {
    id: 'mummy', name: 'Mummy', emoji: '🧻', ac: 11, init: -1, hp: [72, 97, 107],
    attacks: [
      a(1, 'rotting-fist', 'Rotting Fist', 6, '2d6+6'),
      a(2, 'fist-pair', 'Fist Pair', 6, '2d6+6', 2),
      a(3, 'mummy-rot-curse', 'Mummy Rot Curse', 7, '3d6+6', 2),
    ],
  },
  {
    id: 'specter', name: 'Specter', emoji: '👻', ac: 12, init: 2, hp: [65, 88, 99],
    attacks: [
      a(1, 'life-drain', 'Life Drain', 5, '3d6+3'),
      a(2, 'draining-touch', 'Draining Touch', 5, '3d6+3', 2),
      a(3, 'soul-siphon', 'Soul Siphon', 7, '4d6+3', 2),
    ],
  },
  {
    id: 'ghast', name: 'Ghast', emoji: '🧟‍♂️', ac: 13, init: 3, hp: [59, 80, 93],
    attacks: [
      a(1, 'claw', 'Claw', 6, '2d6+6'),
      a(2, 'claws', 'Claws', 6, '2d6+6', 2),
      a(3, 'stench-frenzy', 'Stench Frenzy', 7, '2d6+7', 2),
    ],
  },
  {
    id: 'zombie-ogre', name: 'Ogre Zombie', emoji: '🧟‍♀️', ac: 8, init: -2, hp: [67, 89, 129],
    attacks: [
      a(1, 'morningstar', 'Morningstar', 7, '2d8+7'),
      a(2, 'slow-swings', 'Slow Swings', 7, '2d8+7', 2),
      a(3, 'undead-fortitude-smash', 'Undead Fortitude Smash', 8, '3d8+7'),
    ],
  },
  {
    id: 'skeleton-knight', name: 'Skeleton Knight', emoji: '☠️', ac: 16, init: 1, hp: [57, 77, 80],
    attacks: [
      a(1, 'longsword', 'Longsword', 6, '1d8+6'),
      a(2, 'longsword-pair', 'Longsword Pair', 6, '1d8+6', 2),
      a(3, 'rattling-charge', 'Rattling Charge', 7, '1d8+3+2d6+3', 2),
    ],
  },
  {
    id: 'harpy-matriarch', name: 'Harpy Matriarch', emoji: '🦅', ac: 13, init: 1, hp: [89, 115, 118],
    attacks: [
      a(1, 'claws', 'Claws', 5, '2d4+5'),
      a(2, 'claws-and-club', 'Claws and Club', 5, '2d4+5', 2),
      a(3, 'luring-dive', 'Luring Dive', 7, '2d6+6', 2),
    ],
  },
  {
    id: 'manticore', name: 'Manticore', emoji: '🦁', ac: 14, init: 3, hp: [71, 72, 77],
    attacks: [
      a(1, 'bite', 'Bite', 6, '1d8+6'),
      a(2, 'tail-spikes', 'Tail Spikes', 6, '1d8+6', 3),
      a(3, 'spike-volley', 'Spike Volley', 7, '1d8+7', 3),
    ],
  },
  {
    id: 'griffon', name: 'Griffon', emoji: '🪶', ac: 12, init: 2, hp: [75, 88, 93],
    attacks: [
      a(1, 'beak', 'Beak', 7, '1d8+7'),
      a(2, 'beak-and-claws', 'Beak and Claws', 7, '1d8+7', 2),
      a(3, 'dive-attack', 'Dive Attack', 8, '2d8+7', 2),
    ],
  },
  {
    id: 'lizardfolk-chief', name: 'Lizardfolk Chief', emoji: '🦎', ac: 15, init: 0, hp: [60, 83, 94],
    attacks: [
      a(1, 'spear', 'Spear', 6, '1d8+6'),
      a(2, 'spear-and-bite', 'Spear and Bite', 6, '1d8+6', 2),
      a(3, 'cunning-strikes', 'Cunning Strikes', 7, '1d8+3+1d6+3', 2),
    ],
  },
  {
    id: 'kobold-champion', name: 'Kobold Champion', emoji: '🐲', ac: 15, init: 2, hp: [31, 52, 62],
    attacks: [
      a(1, 'spear-jab', 'Spear Pair', 6, '1d6+6', 2),
      a(2, 'spear-flurry', 'Spear Flurry', 6, '1d6+6', 3),
      a(3, 'pack-tactics', 'Pack Tactics', 7, '1d6+3+1d6+3', 3),
    ],
  },
  {
    id: 'red-wyrmling', name: 'Red Dragon Wyrmling', emoji: '🐉', ac: 17, init: 0, hp: [37, 53, 67],
    attacks: [
      a(1, 'bite', 'Bite', 7, '1d10+7'),
      a(2, 'bite-and-claws', 'Bite and Claws', 7, '1d10+7', 2),
      a(3, 'fire-breath', 'Fire Breath', 8, '8d6'),
    ],
  },
  {
    id: 'white-wyrmling', name: 'White Dragon Wyrmling', emoji: '❄️', ac: 16, init: 0, hp: [51, 65, 78],
    attacks: [
      a(1, 'bite', 'Bite', 7, '1d10+6'),
      a(2, 'bite-and-claws', 'Bite and Claws', 7, '1d10+6', 2),
      a(3, 'frost-breath', 'Frost Breath', 8, '7d6'),
    ],
  },
  {
    id: 'phase-spider', name: 'Phase Spider', emoji: '🕸️', ac: 13, init: 2, hp: [65, 95, 106],
    attacks: [
      a(1, 'bite', 'Bite', 7, '1d10+6'),
      a(2, 'venomous-bite', 'Venomous Bite', 7, '1d10+3+2d6+3'),
      a(3, 'ambush-bite', 'Ambush Bite', 8, '1d10+3+4d6+3'),
    ],
  },
  {
    id: 'ettercap', name: 'Ettercap', emoji: '🪲', ac: 13, init: 2, hp: [94, 118, 119],
    attacks: [
      a(1, 'claws', 'Claws', 5, '1d8+5'),
      a(2, 'claws-and-bite', 'Claws and Bite', 5, '1d8+5', 2),
      a(3, 'web-ambush', 'Web Ambush', 7, '1d8+3+2d6+3', 2),
    ],
  },
  {
    id: 'gargoyle', name: 'Gargoyle', emoji: '🗿', ac: 15, init: 0, hp: [90, 116, 117],
    attacks: [
      a(1, 'claws', 'Claws', 5, '1d6+5'),
      a(2, 'bite-and-claws', 'Bite and Claws', 5, '1d6+5', 2),
      a(3, 'stone-dive', 'Stone Dive', 7, '2d6+6', 2),
    ],
  },
  {
    id: 'doppelganger', name: 'Doppelganger', emoji: '🎭', ac: 14, init: 4, hp: [64, 80, 82],
    attacks: [
      a(1, 'slam', 'Slam', 7, '1d6+7'),
      a(2, 'slam-pair', 'Slam Pair', 7, '1d6+7', 2),
      a(3, 'mimic-strike', 'Mimic Strike', 8, '1d6+4+2d6+3', 2),
    ],
  },
  {
    id: 'wyvern', name: 'Wyvern', emoji: '🦂', ac: 13, init: 0, hp: [48, 64, 68],
    attacks: [
      a(1, 'bite', 'Bite', 8, '2d6+7'),
      a(2, 'bite-and-stinger', 'Bite and Stinger', 8, '2d6+7', 2),
      a(3, 'poison-sting', 'Poison Sting', 8, '2d6+4+3d6+3', 2),
    ],
  },
  {
    id: 'fallen-knight', name: 'Fallen Knight', emoji: '🖤', ac: 18, init: 1, hp: [31, 45, 50],
    attacks: [
      a(1, 'greatsword', 'Greatsword', 7, '2d6+6'),
      a(2, 'greatsword-pair', 'Greatsword Pair', 7, '2d6+6', 2),
      a(3, 'dread-cleave', 'Dread Cleave', 8, '2d6+3+2d6+3', 2),
    ],
  },
  {
    id: 'swamp-hag', name: 'Swamp Hag', emoji: '🧙‍♀️', ac: 14, init: 1, hp: [43, 58, 63],
    attacks: [
      a(1, 'claws', 'Claws', 7, '2d8+6'),
      a(2, 'claws-pair', 'Claws Pair', 7, '2d8+6', 2),
      a(3, 'hex-strike', 'Hex Strike', 8, '2d8+3+2d6+3', 2),
    ],
  },
  {
    id: 'bone-naga', name: 'Bone Naga', emoji: '🐍', ac: 15, init: 2, hp: [29, 42, 66],
    attacks: [
      a(1, 'bite', 'Bite', 7, '1d8+3+2d6+3'),
      a(2, 'bite-and-spit', 'Bite and Spit', 7, '1d8+3+2d6+3', 2),
      a(3, 'lightning-bolt-fang', 'Lightning Bolt Fang', 8, '4d8+3'),
    ],
  },
]

// ── Signature moves (T-65) ───────────────────────────────────────────────────
// Each hero has one move that works once per duel. The player picks when to
// spend it. `cost` says what it uses: a bonus action, or nothing ("free").

export type SignatureKind =
  | 'surge' //     take one more action this turn (needs your action spent)
  | 'heal' //      regain hit points
  | 'empower' //   +N damage on every hit for the rest of the duel
  | 'ward' //      the next hit against you deals half damage
  | 'strike' //    your next hit deals extra dice
  | 'advantage' // your next attack roll has advantage
  | 'hinder' //    the foe's next turn is at disadvantage

export interface Signature {
  id: string
  name: string
  /** One line for the button. */
  blurb: string
  kind: SignatureKind
  cost: 'free' | 'bonus'
  /** heal: the healing dice ("2d8+4"); strike: the extra damage dice ("2d8"). */
  dice?: string
  /** empower: the flat damage added to every hit. */
  bonus?: number
}

export const SIGNATURES: Record<string, Signature> = {
  fighter: { id: 'action-surge', name: 'Action Surge', blurb: 'Take another action this turn', kind: 'surge', cost: 'free' },
  rogue: { id: 'steady-aim', name: 'Steady Aim', blurb: 'Your next attack has advantage', kind: 'advantage', cost: 'bonus' },
  barbarian: { id: 'rage', name: 'Rage', blurb: '+3 damage on every hit', kind: 'empower', cost: 'bonus', bonus: 3 },
  paladin: { id: 'divine-smite', name: 'Divine Smite', blurb: 'Your next hit deals +2d8', kind: 'strike', cost: 'free', dice: '2d8' },
  ranger: { id: 'favored-quarry', name: 'Favored Quarry', blurb: '+2 damage on every hit', kind: 'empower', cost: 'bonus', bonus: 2 },
  monk: { id: 'stunning-strike', name: 'Stunning Strike', blurb: 'The foe’s next turn is at disadvantage', kind: 'hinder', cost: 'free' },
  cleric: { id: 'preserve-life', name: 'Preserve Life', blurb: 'Heal 2d8+4', kind: 'heal', cost: 'bonus', dice: '2d8+4' },
  warlock: { id: 'hex', name: 'Hex', blurb: '+3 damage on every hit', kind: 'empower', cost: 'bonus', bonus: 3 },
  bard: { id: 'bardic-inspiration', name: 'Bardic Inspiration', blurb: 'Your next attack has advantage', kind: 'advantage', cost: 'free' },
  druid: { id: 'wild-mending', name: 'Wild Mending', blurb: 'Heal 2d8+4', kind: 'heal', cost: 'bonus', dice: '2d8+4' },
  sorcerer: { id: 'quickened-spell', name: 'Quickened Spell', blurb: 'Take another action this turn', kind: 'surge', cost: 'free' },
  wizard: { id: 'shield', name: 'Shield', blurb: 'The next hit on you deals half damage', kind: 'ward', cost: 'free' },
  knight: { id: 'parry', name: 'Parry', blurb: 'The next hit on you deals half damage', kind: 'ward', cost: 'free' },
  berserker: { id: 'reckless-attack', name: 'Reckless Attack', blurb: 'Your next attack has advantage', kind: 'advantage', cost: 'free' },
  assassin: { id: 'death-strike', name: 'Death Strike', blurb: 'Your next hit deals +4d6', kind: 'strike', cost: 'free', dice: '4d6' },
  warden: { id: 'beast-mending', name: 'Beast Mending', blurb: 'Heal 2d6+4', kind: 'heal', cost: 'bonus', dice: '2d6+4' },
  'light-cleric': { id: 'warding-flare', name: 'Warding Flare', blurb: 'The foe’s next turn is at disadvantage', kind: 'hinder', cost: 'free' },
  vengeance: { id: 'vow-of-enmity', name: 'Vow of Enmity', blurb: 'Your next attack has advantage', kind: 'advantage', cost: 'bonus' },
  'shadow-monk': { id: 'shadow-step', name: 'Shadow Step', blurb: 'The next hit on you deals half damage', kind: 'ward', cost: 'free' },
  skald: { id: 'inspiring-rally', name: 'Inspiring Rally', blurb: 'Heal 1d10+6', kind: 'heal', cost: 'bonus', dice: '1d10+6' },
}

// ── Daily twists (T-65) ──────────────────────────────────────────────────────
// One rule bends the day's duel. It is picked by the date seed, like the
// matchup, so everyone gets the same one. Half help the hero, half hinder.

export type TwistId =
  | 'blessed' | 'brittle' | 'fey-luck' | 'mending'
  | 'troll-blood' | 'armored' | 'vicious' | 'frail'

export interface Twist {
  id: TwistId
  name: string
  text: string
  favors: 'hero' | 'foe'
}

export const TWISTS: Twist[] = [
  { id: 'blessed', name: 'Blessed', text: 'You have +2 to every attack roll.', favors: 'hero' },
  { id: 'brittle', name: 'Brittle Hide', text: 'Every hit on the foe deals 3 extra damage.', favors: 'hero' },
  { id: 'fey-luck', name: 'Fey Luck', text: 'You reroll every natural 1 on your attack rolls.', favors: 'hero' },
  { id: 'mending', name: 'Mending Light', text: 'You regain 3 HP at the start of each round.', favors: 'hero' },
  { id: 'troll-blood', name: 'Troll’s Blood', text: 'The foe regains 4 HP at the end of every round.', favors: 'foe' },
  { id: 'armored', name: 'Plated Foe', text: 'The foe has +2 Armor Class.', favors: 'foe' },
  { id: 'vicious', name: 'Vicious Foe', text: 'Every hit from the foe deals 2 extra damage.', favors: 'foe' },
  { id: 'frail', name: 'Frayed Gear', text: 'Your Armor Class is 2 lower.', favors: 'foe' },
]

// ── Token icons (T-65) ───────────────────────────────────────────────────────
// A bundled game-icons.net glyph (see src/lib/tokenIconCatalog.ts and the
// Credits page) for each duelist's token on the Daily Duel page.

export const DUELIST_ICONS: Record<string, string> = {
  // Heroes
  fighter: 'crested-helmet', rogue: 'rogue', barbarian: 'barbarian', paladin: 'cross-shield',
  ranger: 'archer', monk: 'monk-face', cleric: 'holy-grail', warlock: 'warlock-hood',
  bard: 'lyre', druid: 'bear-head', sorcerer: 'fire-silhouette', wizard: 'wizard-face',
  knight: 'visored-helm', berserker: 'horned-helm', assassin: 'assassin-pocket', warden: 'hunter-eyes',
  'light-cleric': 'spiked-halo', vengeance: 'sword-brandish', 'shadow-monk': 'ninja-mask', skald: 'drum',
  // Foes
  'goblin-boss': 'goblin-head', bugbear: 'brute', orc: 'orc-head', ogre: 'ogre', owlbear: 'bear-head',
  'giant-spider': 'spider-web', wight: 'shambling-zombie', 'gnoll-fang': 'bestial-fangs',
  ghoul: 'shambling-zombie', 'minotaur-skeleton': 'minotaur', 'hobgoblin-captain': 'horned-helm',
  troll: 'giant', 'bandit-captain': 'bandit', veteran: 'static-guard', 'cult-fanatic': 'executioner-hood',
  wererat: 'rat', werewolf: 'werewolf', 'dire-wolf': 'wolf-head', 'giant-boar': 'boar-tusks',
  'brown-bear': 'bear-head', mummy: 'mummy-head', specter: 'ghost', ghast: 'skull-crossed-bones',
  'zombie-ogre': 'shambling-zombie', 'skeleton-knight': 'skeleton-inside', 'harpy-matriarch': 'bat-wing',
  manticore: 'lion', griffon: 'griffin-symbol', 'lizardfolk-chief': 'lizardman', 'kobold-champion': 'goblin-head',
  'red-wyrmling': 'dragon-head', 'white-wyrmling': 'wyvern', 'phase-spider': 'spider-eye', ettercap: 'spider-web',
  gargoyle: 'gargoyle', doppelganger: 'spy', wyvern: 'wyvern', 'fallen-knight': 'visored-helm',
  'swamp-hag': 'witch-flight', 'bone-naga': 'rattlesnake',
}
