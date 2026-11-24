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

/** A short code + color for each condition, for the pips drawn on tokens
 *  (Owlbear-style status badges). Full name shows on hover. */
export const CONDITION_META: Record<string, { code: string; color: string }> = {
  Blinded: { code: 'Bl', color: '#475569' },
  Charmed: { code: 'Ch', color: '#db2777' },
  Concentration: { code: 'Co', color: '#0891b2' },
  Deafened: { code: 'Df', color: '#64748b' },
  Frightened: { code: 'Fr', color: '#b45309' },
  Grappled: { code: 'Gr', color: '#78716c' },
  Incapacitated: { code: 'In', color: '#7c3aed' },
  Invisible: { code: 'Iv', color: '#38bdf8' },
  Paralyzed: { code: 'Pz', color: '#ca8a04' },
  Petrified: { code: 'Pt', color: '#57534e' },
  Poisoned: { code: 'Po', color: '#16a34a' },
  Prone: { code: 'Pr', color: '#a16207' },
  Restrained: { code: 'Rs', color: '#9a3412' },
  Stunned: { code: 'St', color: '#eab308' },
  Unconscious: { code: 'Un', color: '#dc2626' },
  Exhaustion: { code: 'Ex', color: '#9333ea' },
}

export function conditionMeta(name: string): { code: string; color: string } {
  return CONDITION_META[name] ?? { code: name.slice(0, 2), color: '#64748b' }
}

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
  /** Set on a battle map monster group: its members share ONE turn slot (they are
   *  kept side by side in the order and Next steps over them together). A plain
   *  `groupKey` pack from the encounter runner keeps one turn per row. */
  groupTurn?: boolean
  /** Running total damage taken (net of healing, floored at 0). Lets players
   *  see how hurt an enemy is without ever seeing its HP pool. */
  damageTaken?: number
  /** The DM hides this combatant from players: it keeps its turn but never reaches
   *  the players' initiative strip (T-100). A hidden token hides its combatant too. */
  hiddenFromPlayers?: boolean
  /** The player (member id) who may edit this combatant's initiative and remove it,
   *  for a character they joined or an NPC the DM assigned (a mount, a vehicle).
   *  Unset falls back to the linked token's `controlledBy`. */
  controlledBy?: string | null
  /** Health marker override for players. Unset follows the campaign setting;
   *  `false` never shows a marker; `true` shows all three levels (T-100). */
  showHealthMarker?: boolean | null
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
  /** The DM opened initiative to players ("Ask players for initiative"): players
   *  can join, and NPCs stay private until combat starts (T-100). */
  askPlayers?: boolean
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

// ── Shared store ─────────────────────────────────────────────────────────────
// One combat, shared live across every view in the tab (tracker, Run panel, the
// battle-map overlay, the live push) via useSyncExternalStore. Writes persist to
// localStorage and notify all subscribers; a `storage` event syncs other tabs.

let current: CombatState = loadCombat()
const listeners = new Set<() => void>()

export function getCombat(): CombatState {
  return current
}

export function subscribeCombat(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Replace the combat (value or updater), persist it, and notify subscribers. */
export function setCombat(next: CombatState | ((s: CombatState) => CombatState)): void {
  const value = typeof next === 'function' ? (next as (s: CombatState) => CombatState)(current) : next
  if (value === current) return
  current = value
  saveCombat(current)
  listeners.forEach((l) => l())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    current = loadCombat()
    listeners.forEach((l) => l())
  })
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
  const sorted = [...list].sort((a, b) => {
    const ai = a.initiative ?? Number.NEGATIVE_INFINITY
    const bi = b.initiative ?? Number.NEGATIVE_INFINITY
    if (bi !== ai) return bi - ai
    if (b.dexMod !== a.dexMod) return b.dexMod - a.dexMod
    return a.name.localeCompare(b.name)
  })
  // Members of a battle map group share one slot, so keep them side by side,
  // at the place of the first member the sort found.
  const out: Combatant[] = []
  const placed = new Set<string>()
  for (const c of sorted) {
    if (placed.has(c.id)) continue
    out.push(c)
    placed.add(c.id)
    if (c.groupTurn && c.groupKey) {
      for (const m of sorted) {
        if (!placed.has(m.id) && m.groupTurn && m.groupKey === c.groupKey) {
          out.push(m)
          placed.add(m.id)
        }
      }
    }
  }
  return out
}

/** True when `b` is in the same turn slot as `a` (same battle map group). */
function sameSlot(a: Combatant | undefined, b: Combatant | undefined): boolean {
  return !!a && !!b && !!a.groupTurn && !!b.groupTurn && !!a.groupKey && a.groupKey === b.groupKey
}

/** The combatants taking the current turn: one, or every member of the current group slot. */
export function activeIds(state: CombatState): Set<string> {
  const out = new Set<string>()
  if (!state.active) return out
  const cur = state.combatants[state.turnIndex]
  if (!cur) return out
  out.add(cur.id)
  if (cur.groupTurn && cur.groupKey) for (const c of state.combatants) if (sameSlot(cur, c)) out.add(c.id)
  return out
}

/** Turn slots in order: a battle map group is one slot of several combatants. */
export function turnSlots(list: Combatant[]): Combatant[][] {
  const slots: Combatant[][] = []
  for (const c of list) {
    const last = slots[slots.length - 1]
    if (last && sameSlot(last[0], c)) last.push(c)
    else slots.push([c])
  }
  return slots
}

/** Move the turn one slot forward or back, counting the round. `turnIndex`
 *  always lands on the first member of a slot. */
export function stepTurn(s: CombatState, dir: 1 | -1): CombatState {
  const list = s.combatants
  if (list.length === 0) return s
  let ti = s.turnIndex
  let round = s.round
  if (dir === 1) {
    const cur = list[ti]
    ti += 1
    while (ti < list.length && sameSlot(cur, list[ti])) ti += 1
    if (ti >= list.length) {
      ti = 0
      round += 1
    }
  } else {
    ti -= 1
    if (ti < 0) {
      ti = list.length - 1
      round = Math.max(1, round - 1)
    }
    while (ti > 0 && sameSlot(list[ti], list[ti - 1])) ti -= 1
  }
  return { ...s, turnIndex: ti, round }
}

/** Remove combatants by id, keeping the turn on the same slot (or the next one). */
export function removeCombatants(s: CombatState, ids: Set<string>): CombatState {
  const list = s.combatants.filter((c) => !ids.has(c.id))
  let ti = s.turnIndex - s.combatants.slice(0, s.turnIndex).filter((c) => ids.has(c.id)).length
  if (ti >= list.length) ti = Math.max(0, list.length - 1)
  return { ...s, combatants: list, turnIndex: ti }
}

/** Re-sort into initiative order while keeping the turn on the same slot. */
export function resortKeepTurn(s: CombatState): CombatState {
  const cur = s.combatants[s.turnIndex]
  const list = sortByInitiative(s.combatants)
  let ti = cur ? list.findIndex((c) => c.id === cur.id) : 0
  if (ti < 0) ti = 0
  while (ti > 0 && sameSlot(list[ti], list[ti - 1])) ti -= 1
  return { ...s, combatants: list, turnIndex: ti }
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
  groupTurn?: boolean
  controlledBy?: string | null
  hiddenFromPlayers?: boolean
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
    ...(input.groupTurn ? { groupTurn: true } : {}),
    ...(input.controlledBy ? { controlledBy: input.controlledBy } : {}),
    ...(input.hiddenFromPlayers ? { hiddenFromPlayers: true } : {}),
    damageTaken: 0,
  }
}
