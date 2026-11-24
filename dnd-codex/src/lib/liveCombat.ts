import { activeIds, turnSlots, type Combatant, type CombatState } from './combat'
import { groupNameFor } from './battleGroups'

// What players may see of the DM's combat (T-100). Pure functions: the DM's device
// builds these rows from the local combat and uploads them. Nothing private is ever
// put in a row: hidden combatants are dropped, enemy HP never leaves the device
// (an enemy carries at most a health marker), and a monster group is one row.

export type HealthMarker = 'injured' | 'bloodied' | 'deaths_door'
export type CombatKind = 'pc' | 'ally' | 'enemy'

/** The campaign's opt-in health markers. All off when a setting is missing. */
export interface MarkerSettings {
  injured?: boolean
  bloodied?: boolean
  deathsDoor?: boolean
}

/** Facts about a combatant's token that the combat state does not hold. */
export interface TokenFacts {
  hidden: boolean
  controlledBy: string | null
  friendly: boolean
}

/** One row of the players' initiative order (the shape of `shared_combatants`). */
export interface PublicCombatRow {
  id: string
  controlledBy: string | null
  name: string
  kind: CombatKind
  initiative: number | null
  sortOrder: number
  hp: number | null
  maxHp: number | null
  healthMarker: HealthMarker | null
  conditions: string[]
  groupCount: number | null
}

export interface PublicCombat {
  phase: 'gathering' | 'active'
  round: number
  activeIds: string[]
  rows: PublicCombatRow[]
}

/** The player who controls a combatant: its own assignment, else its token's. */
export function controllerOf(c: Combatant, facts?: TokenFacts): string | null {
  return c.controlledBy ?? facts?.controlledBy ?? null
}

/** True when players must not see this combatant. */
export function isHiddenFromPlayers(c: Combatant, facts?: TokenFacts): boolean {
  return !!c.hiddenFromPlayers || !!facts?.hidden
}

/**
 * The most severe enabled marker whose threshold is met, or null. Needs tracked HP
 * above 0. Injured is 50 percent or below, Bloodied 25 percent or below, and
 * Death's door under 5 percent. A per-combatant `showHealthMarker` overrides the
 * campaign: `false` shows none, `true` shows all three levels.
 */
export function healthMarker(c: Combatant, settings: MarkerSettings): HealthMarker | null {
  if (c.hp == null || c.maxHp == null || c.maxHp <= 0 || c.hp <= 0) return null
  const on =
    c.showHealthMarker === false
      ? { injured: false, bloodied: false, deathsDoor: false }
      : c.showHealthMarker === true
        ? { injured: true, bloodied: true, deathsDoor: true }
        : settings
  const ratio = c.hp / c.maxHp
  if (on.deathsDoor && ratio < 0.05) return 'deaths_door'
  if (on.bloodied && ratio <= 0.25) return 'bloodied'
  if (on.injured && ratio <= 0.5) return 'injured'
  return null
}

/** The `shared_combat` phase for this combat, or null when nothing is shared. */
export function sharePhase(s: CombatState): 'gathering' | 'active' | null {
  if (s.active) return 'active'
  return s.askPlayers ? 'gathering' : null
}

/**
 * Build the privacy-filtered copy of the combat. While gathering, only PCs show
 * (NPCs stay private until combat starts). `groupNames` maps a group key to its
 * display name.
 */
export function publicCombat(
  s: CombatState,
  facts: Map<string, TokenFacts>,
  markers: MarkerSettings,
  groupNames: Map<string, string> = new Map(),
): PublicCombat | null {
  const phase = sharePhase(s)
  if (!phase) return null
  const visible = s.combatants.filter(
    (c) => !isHiddenFromPlayers(c, facts.get(c.id)) && (phase === 'active' || c.isPC),
  )
  const rows: PublicCombatRow[] = []
  const rowIdOf = new Map<string, string>()
  for (const slot of turnSlots(visible)) {
    const lead = slot[0]
    for (const c of slot) rowIdOf.set(c.id, lead.id)
    if (slot.length > 1 && lead.groupTurn) {
      rows.push({
        id: lead.id,
        controlledBy: null,
        name: groupNames.get(lead.groupKey ?? '') ?? groupNameFor(slot.map((c) => c.name)),
        kind: 'enemy',
        initiative: lead.initiative,
        sortOrder: rows.length,
        hp: null,
        maxHp: null,
        healthMarker: null,
        conditions: [],
        groupCount: slot.length,
      })
      continue
    }
    for (const c of slot) {
      const f = facts.get(c.id)
      const controller = controllerOf(c, f)
      const kind: CombatKind = c.isPC ? 'pc' : controller || f?.friendly ? 'ally' : 'enemy'
      const ally = kind !== 'enemy'
      rows.push({
        id: c.id,
        controlledBy: controller,
        name: c.name,
        kind,
        initiative: c.initiative,
        sortOrder: rows.length,
        hp: ally ? c.hp : null,
        maxHp: ally ? c.maxHp : null,
        healthMarker: ally ? null : healthMarker(c, markers),
        conditions: c.conditions,
        groupCount: null,
      })
    }
  }
  const acting = [...activeIds(s)].map((id) => rowIdOf.get(id)).filter((id): id is string => !!id)
  return { phase, round: s.round, activeIds: [...new Set(phase === 'active' ? acting : [])], rows }
}

/** True when adding these combatants shows an NPC to players: any non-PC not hidden. */
export function revealsNpc(rows: Combatant[], facts?: Map<string, TokenFacts>): boolean {
  return rows.some((c) => !c.isPC && !isHiddenFromPlayers(c, facts?.get(c.id)))
}

/** Combatants that would be visible once the order opens to players (for Start combat). */
export function visibleNpcs(s: CombatState, facts?: Map<string, TokenFacts>): Combatant[] {
  return s.combatants.filter((c) => !c.isPC && !isHiddenFromPlayers(c, facts?.get(c.id)))
}

/** A PC already in the order for this player: same controller and name (case-insensitive). */
export function duplicatePc(s: CombatState, name: string, playerId: string | null): Combatant | undefined {
  if (!playerId) return undefined
  const n = name.trim().toLowerCase()
  return s.combatants.find((c) => c.isPC && c.controlledBy === playerId && c.name.trim().toLowerCase() === n)
}
