import { newId } from '../db/db'
import { rollDice } from './dice'
import type { Id } from '../db/types'

// The at-the-table combat/initiative tracker's data + pure logic. State is kept
// entirely client-side (a single active combat in localStorage) — combat is
// transient and DM-only, so it never syncs or enters the JSON backup. The
// encounter builder is the feeder: a saved encounter "runs" into this tracker.

/** The 5e conditions a DM tracks on a combatant (plus concentration). */
export const CONDITIONS = [
  'Blinded', 'Charmed', 'Concentration', 'Deafened', 'Frightened', 'Grappled',
  'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone',
  'Restrained', 'Stunned', 'Unconscious', 'Exhaustion',
] as const

export interface Combatant {
  id: Id
  name: string
  /** Player character (rendered distinctly, kept even at 0 HP). */
  isPC: boolean
  /** Rolled initiative; null until rolled/entered. */
  initiative: number | null
  /** DEX modifier — drives the initiative roll and tie-breaks. */
  dexMod: number
  /** Current HP; null when the DM isn't tracking HP for this row. */
  hp: number | null
  maxHp: number | null
  ac: number | null
  conditions: string[]
  /** Rows sharing a group roll one initiative together (a monster pack). */
  groupKey?: string | null
}

export interface CombatState {
  active: boolean
  round: number
  /** Index into `combatants` (already in initiative order) of whose turn it is. */
  turnIndex: number
  name: string
  /** The campaign whose NPCs the "Add from NPCs" picker draws from. */
  campaignId: Id | null
  combatants: Combatant[]
}

const KEY = 'codex.combat'

export function emptyCombat(): CombatState {
  return { active: false, round: 1, turnIndex: 0, name: 'Combat', campaignId: null, combatants: [] }
}

export function loadCombat(): CombatState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...emptyCombat(), ...(JSON.parse(raw) as Partial<CombatState>) }
  } catch {
    /* corrupt/blocked storage — start fresh */
  }
  return emptyCombat()
}

export function saveCombat(state: CombatState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* private mode / quota — the in-memory state still works this session */
  }
}

/** A single d20 + DEX modifier. */
export function rollInitiative(dexMod: number): number {
  return rollDice(1, 20)[0] + dexMod
}

/**
 * Sort combatants into initiative order: highest initiative first, ties broken
 * by DEX modifier then name. Rows without an initiative sink to the bottom.
 */
export function sortByInitiative(list: Combatant[]): Combatant[] {
  return [...list].sort((a, b) => {
    const ai = a.initiative ?? Number.NEGATIVE_INFINITY
    const bi = b.initiative ?? Number.NEGATIVE_INFINITY
    if (bi !== ai) return bi - ai
    if (b.dexMod !== a.dexMod) return b.dexMod - a.dexMod
    return a.name.localeCompare(b.name)
  })
}

/**
 * Roll initiative for every combatant, giving members of the same group (a
 * monster pack from one encounter line) a single shared roll, and rolling solo
 * rows individually.
 */
export function rollAllInitiative(list: Combatant[]): Combatant[] {
  const groupRolls = new Map<string, number>()
  return list.map((c) => {
    if (c.groupKey) {
      let roll = groupRolls.get(c.groupKey)
      if (roll == null) {
        roll = rollInitiative(c.dexMod)
        groupRolls.set(c.groupKey, roll)
      }
      return { ...c, initiative: roll }
    }
    return { ...c, initiative: rollInitiative(c.dexMod) }
  })
}

/** Parse the leading integer out of a stat-block string like "170 (31d8+31)". */
export function parseLeadingInt(text: string | null | undefined): number | null {
  if (!text) return null
  const m = String(text).match(/-?\d+/)
  return m ? Number(m[0]) : null
}

/** Build a fresh combatant, defaulting HP to full and no conditions. */
export function makeCombatant(input: {
  name: string
  isPC?: boolean
  initiative?: number | null
  dexMod?: number
  hp?: number | null
  ac?: number | null
  groupKey?: string | null
}): Combatant {
  const maxHp = input.hp ?? null
  return {
    id: newId(),
    name: input.name.trim() || 'Combatant',
    isPC: input.isPC ?? false,
    initiative: input.initiative ?? null,
    dexMod: input.dexMod ?? 0,
    hp: maxHp,
    maxHp,
    ac: input.ac ?? null,
    conditions: [],
    groupKey: input.groupKey ?? null,
  }
}
