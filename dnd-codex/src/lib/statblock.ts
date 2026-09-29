import type { AbilityKey, StatBlock } from '../db/types'
import type { Monster } from './monsters'
import { crToXp, crLabel } from './monsters'

// Helpers for the structured NPC stat block: all the derived numbers (ability
// modifiers, saving throws, proficiency bonus, XP) so the editor and renderer
// stay in sync and the DM never hand-maths a modifier.

export const ABILITIES: { key: AbilityKey; label: string }[] = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
]

/** A fresh, empty stat block (average commoner ability scores). */
export function emptyStatBlock(): StatBlock {
  return {
    size: '',
    creatureType: '',
    alignment: '',
    ac: '',
    hp: '',
    speed: '',
    initiative: '',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProficiencies: [],
    pb: '',
    skills: '',
    resistances: '',
    immunities: '',
    vulnerabilities: '',
    senses: '',
    languages: '',
    cr: '',
    habitat: '',
    gear: '',
    treasure: '',
    traits: [],
    actions: [],
    bonusActions: [],
    reactions: [],
    legendaryActions: [],
  }
}

/** Ability modifier for a score: floor((score - 10) / 2). */
export function abilityMod(score: number): number {
  return Math.floor((Number(score) - 10) / 2)
}

/** Render a number with an explicit sign, e.g. 3 → "+3", -1 → "-1". */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

/**
 * Parse a CR string ("12", "1/2", "1/8") to a number. Returns null if it isn't
 * a recognizable CR, so callers can hide derived XP/PB.
 */
export function parseCr(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  if (t === '1/8') return 0.125
  if (t === '1/4') return 0.25
  if (t === '1/2') return 0.5
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Standard 5e proficiency bonus for a challenge rating. */
export function pbFromCr(cr: number): number {
  if (cr <= 4) return 2
  if (cr <= 8) return 3
  if (cr <= 12) return 4
  if (cr <= 16) return 5
  if (cr <= 20) return 6
  if (cr <= 24) return 7
  if (cr <= 28) return 8
  return 9
}

/** The effective proficiency bonus: an explicit override, else derived from CR. */
export function effectivePb(block: StatBlock): number {
  const override = Number(block.pb)
  if (block.pb.trim() && Number.isFinite(override)) return override
  const cr = parseCr(block.cr)
  return cr == null ? 2 : pbFromCr(cr)
}

/** Saving-throw bonus for an ability: its modifier plus PB if proficient. */
export function saveValue(block: StatBlock, key: AbilityKey): number {
  const mod = abilityMod(block.abilities[key])
  return block.saveProficiencies.includes(key) ? mod + effectivePb(block) : mod
}

/** XP for the block's CR (0 if the CR isn't recognized). */
export function statBlockXp(block: StatBlock): number {
  const cr = parseCr(block.cr)
  return cr == null ? 0 : crToXp(cr)
}

/** "12 (8,400 XP)" style label for the CR line; empty if no CR. */
export function crXpLabel(block: StatBlock): string {
  const cr = parseCr(block.cr)
  if (cr == null) return block.cr.trim()
  const xp = crToXp(cr)
  return xp ? `${crLabel(cr)} (${xp.toLocaleString()} XP)` : crLabel(cr)
}

/**
 * Seed a stat block from a bundled/live monster record. Only the basics are
 * known (size, type, CR, HP, AC, DEX) — the rest is left for the DM to fill in.
 * Existing DEX drives an initiative suggestion.
 */
export function statBlockFromMonster(m: Monster): StatBlock {
  const block = emptyStatBlock()
  block.size = m.size || ''
  block.creatureType = m.type || ''
  block.cr = crLabel(m.cr)
  block.ac = m.ac != null ? String(m.ac) : ''
  block.hp = m.hp != null ? String(m.hp) : ''
  if (m.dex != null) {
    block.abilities.dex = m.dex
    block.initiative = signed(abilityMod(m.dex))
  }
  return block
}
