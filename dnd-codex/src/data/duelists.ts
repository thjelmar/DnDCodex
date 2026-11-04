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

export const FOES: Duelist[] = [
  {
    id: 'goblin-boss', name: 'Goblin Boss', emoji: '👺', hp: 48, ac: 17, init: 2,
    attacks: [{ id: 'scimitar', name: 'Scimitar', kind: 'action', toHit: 6, damage: '1d6+4', times: 3 }],
  },
  {
    id: 'bugbear', name: 'Bugbear Chief', emoji: '🐻', hp: 65, ac: 17, init: 2,
    attacks: [{ id: 'morningstar', name: 'Morningstar', kind: 'action', toHit: 4, damage: '2d8+2', times: 2 }],
  },
  {
    id: 'orc', name: 'Orc War Chief', emoji: '👹', hp: 72, ac: 15, init: 1,
    attacks: [{ id: 'greataxe', name: 'Greataxe', kind: 'action', toHit: 5, damage: '1d12+3', times: 2 }],
  },
  {
    id: 'ogre', name: 'Ogre', emoji: '🧌', hp: 80, ac: 12, init: -1,
    attacks: [{ id: 'club', name: 'Greatclub', kind: 'action', toHit: 7, damage: '2d8+6' }],
  },
  {
    id: 'owlbear', name: 'Owlbear', emoji: '🦉', hp: 59, ac: 13, init: 1,
    attacks: [
      { id: 'beak', name: 'Beak', kind: 'action', toHit: 7, damage: '1d10+5' },
      { id: 'claws', name: 'Claws', kind: 'action', toHit: 7, damage: '2d8+5' },
    ],
  },
  {
    id: 'giant-spider', name: 'Giant Spider', emoji: '🕷️', hp: 50, ac: 15, init: 3,
    attacks: [{ id: 'bite', name: 'Venomous Bite', kind: 'action', toHit: 6, damage: '1d8+3+2d8', times: 2 }],
  },
  {
    id: 'wight', name: 'Wight', emoji: '💀', hp: 58, ac: 15, init: 2,
    attacks: [{ id: 'sword', name: 'Longsword', kind: 'action', toHit: 5, damage: '1d8+3+1d6', times: 2 }],
  },
  {
    id: 'gnoll-fang', name: 'Gnoll Fang of Yeenoghu', emoji: '🐺', hp: 65, ac: 14, init: 2,
    attacks: [{ id: 'rampage', name: 'Bite and Spear', kind: 'action', toHit: 6, damage: '1d8+3', times: 3 }],
  },
  {
    id: 'ghoul', name: 'Ghoul Pack Leader', emoji: '🧟', hp: 58, ac: 13, init: 2,
    attacks: [{ id: 'claws', name: 'Paralyzing Claws', kind: 'action', toHit: 5, damage: '2d6+3', times: 2 }],
  },
  {
    id: 'minotaur-skeleton', name: 'Minotaur Skeleton', emoji: '🐂', hp: 67, ac: 12, init: 0,
    attacks: [{ id: 'gore', name: 'Gore', kind: 'action', toHit: 6, damage: '2d12+4' }],
  },
  {
    id: 'hobgoblin-captain', name: 'Hobgoblin Captain', emoji: '⚔️', hp: 52, ac: 17, init: 1,
    attacks: [{ id: 'greatsword', name: 'Greatsword', kind: 'action', toHit: 5, damage: '2d6+3', times: 2 }],
  },
  {
    id: 'troll', name: 'Troll', emoji: '🪨', hp: 62, ac: 14, init: 1,
    attacks: [
      { id: 'bite', name: 'Bite', kind: 'action', toHit: 6, damage: '1d6+3' },
      { id: 'claw', name: 'Claws', kind: 'action', toHit: 6, damage: '2d6+3', times: 2 },
    ],
  },
]
