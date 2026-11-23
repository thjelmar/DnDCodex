import { newId } from '../db/db'
import type { Id, SceneGroup, SceneToken } from '../db/types'
import { removeCombatants, resortKeepTurn, rollInitiative, type Combatant, type CombatState } from './combat'

// Monster groups on the battle map (T-95, phase 4). Pure functions: each takes the
// scene's tokens and groups plus the shared combat state and returns the next
// versions, so the page applies them in one step.
//
// Rules:
// - Grouping is prep only. Nobody joins initiative until the DM adds them.
// - A group in initiative is ONE turn slot: one combatant per member, sharing
//   `groupKey === group.id` and `groupTurn` (see lib/combat.ts).
// - A defeated member (0 HP) leaves the group and the turn order on its own. A
//   group of one becomes a normal slot, and an empty group disappears.

export interface GroupState {
  tokens: SceneToken[]
  groups: SceneGroup[]
  combat: CombatState
}

/** Builds the combatant a token stands for (from its NPC when it has one). */
export type MakeMember = (t: SceneToken) => Combatant

const memberIds = (tokens: SceneToken[], groupId: Id) => tokens.filter((t) => t.groupId === groupId).map((t) => t.id)

/** "Thug", "Thug 2" -> "Thugs". A name that already ends in s stays as it is. */
export function groupNameFor(labels: string[]): string {
  const base = (labels[0] ?? '').replace(/\s*\d+$/, '').trim()
  if (!base) return 'Group'
  return /s$/i.test(base) ? base : `${base}s`
}

/** The combatant a token is linked to, if it still exists in the combat. */
export function combatantOf(combat: CombatState, t: SceneToken): Combatant | undefined {
  return t.combatantId ? combat.combatants.find((c) => c.id === t.combatantId) : undefined
}

/** True when any member of the group is in the turn order. */
export function groupInInitiative(tokens: SceneToken[], group: SceneGroup, combat: CombatState): boolean {
  return tokens.some((t) => t.groupId === group.id && combatantOf(combat, t))
}

/** A member's starting HP: its own edit, else the group's value. */
export function memberHp(group: SceneGroup, tokenId: Id): number | null {
  return group.hpBy?.[tokenId] ?? group.hp
}

/** Put every member of the group into the turn order as one slot. Members already
 *  in the order stay and join the slot. A group with no initiative yet rolls one
 *  when combat is running, so it never sits at the bottom unrolled. */
export function addGroupToInitiative(s: GroupState, groupId: Id, make: MakeMember): GroupState {
  const group = s.groups.find((g) => g.id === groupId)
  if (!group) return s
  const members = s.tokens.filter((t) => t.groupId === groupId)
  let init = group.init
  let list = s.combat.combatants
  const linked = new Map<Id, Id>()
  const fresh: Combatant[] = []
  for (const t of members) {
    const hp = memberHp(group, t.id)
    const patch: Partial<Combatant> = { groupKey: group.id, groupTurn: true, ...(hp != null ? { hp, maxHp: hp, damageTaken: 0 } : {}) }
    const existing = combatantOf(s.combat, t)
    if (existing) {
      list = list.map((c) => (c.id === existing.id ? { ...c, ...patch } : c))
    } else {
      const base = make(t)
      fresh.push({ ...base, name: t.label || base.name, ...patch })
      linked.set(t.id, base.id)
    }
  }
  if (init == null && s.combat.active) {
    const first = fresh[0] ?? list.find((c) => c.groupKey === group.id)
    init = rollInitiative(first?.dexMod ?? 0)
  }
  const stamp = (c: Combatant) => (c.groupKey === group.id ? { ...c, initiative: init } : c)
  const combatants = [...list, ...fresh].map(stamp)
  return {
    tokens: s.tokens.map((t) => (linked.has(t.id) ? { ...t, combatantId: linked.get(t.id)! } : t)),
    groups: s.groups.map((g) => (g.id === groupId ? { ...g, init } : g)),
    combat: resortKeepTurn({ ...s.combat, combatants }),
  }
}

/** Take the whole group out of the turn order. The group stays, as prep. */
export function removeGroupFromInitiative(s: GroupState, groupId: Id): GroupState {
  const ids = new Set(s.combat.combatants.filter((c) => c.groupKey === groupId && c.groupTurn).map((c) => c.id))
  return {
    ...s,
    tokens: s.tokens.map((t) => (t.combatantId && ids.has(t.combatantId) ? { ...t, combatantId: null } : t)),
    combat: removeCombatants(s.combat, ids),
  }
}

/** Link the chosen monsters into a new group. Prep only: if some of them are
 *  already in the turn order, the whole group joins at that place; otherwise
 *  nothing changes in the order. */
export function createGroup(s: GroupState, tokenIds: Id[], make: MakeMember, hpOf: (t: SceneToken) => number | null): GroupState {
  const members = s.tokens.filter((t) => tokenIds.includes(t.id))
  if (members.length < 2) return s
  const already = members.map((t) => combatantOf(s.combat, t)).filter((c): c is Combatant => !!c)
  const first = members[0]
  const group: SceneGroup = {
    id: newId(),
    name: groupNameFor(members.map((t) => t.label)),
    init: already[0]?.initiative ?? null,
    hp: already[0]?.maxHp ?? hpOf(first),
    hpBy: null,
  }
  const next: GroupState = {
    tokens: s.tokens.map((t) => (tokenIds.includes(t.id) ? { ...t, groupId: group.id } : t)),
    groups: [...s.groups, group],
    combat: s.combat,
  }
  return already.length ? addGroupToInitiative(next, group.id, make) : next
}

/** Dissolve a group. Members already in the order become separate slots again. */
export function ungroup(s: GroupState, groupId: Id): GroupState {
  const combatants = s.combat.combatants.map((c) => {
    if (c.groupKey !== groupId) return c
    const { groupTurn: _t, ...rest } = c
    void _t
    return { ...rest, groupKey: null }
  })
  return {
    tokens: s.tokens.map((t) => (t.groupId === groupId ? { ...t, groupId: null } : t)),
    groups: s.groups.filter((g) => g.id !== groupId),
    combat: resortKeepTurn({ ...s.combat, combatants }),
  }
}

/** Set the group's one initiative (typed or rolled). */
export function setGroupInit(s: GroupState, groupId: Id, init: number | null): GroupState {
  const combatants = s.combat.combatants.map((c) => (c.groupKey === groupId ? { ...c, initiative: init } : c))
  return {
    ...s,
    groups: s.groups.map((g) => (g.id === groupId ? { ...g, init } : g)),
    combat: resortKeepTurn({ ...s.combat, combatants }),
  }
}

/** Roll the group's initiative once: d20 plus the first member's modifier. */
export function rollGroupInit(s: GroupState, groupId: Id, dexMod: number): GroupState {
  return setGroupInit(s, groupId, rollInitiative(dexMod))
}

/** Set starting HP for every member (`tokenId` omitted) or for one member. */
export function setGroupHp(s: GroupState, groupId: Id, hp: number | null, tokenId?: Id): GroupState {
  const group = s.groups.find((g) => g.id === groupId)
  if (!group) return s
  const targets = new Set(tokenId ? [tokenId] : memberIds(s.tokens, groupId))
  const next: SceneGroup = tokenId
    ? { ...group, hpBy: { ...(group.hpBy ?? {}), ...(hp != null ? { [tokenId]: hp } : {}) } }
    : { ...group, hp, hpBy: null }
  const ids = new Set(s.tokens.filter((t) => targets.has(t.id) && t.combatantId).map((t) => t.combatantId as string))
  return {
    ...s,
    groups: s.groups.map((g) => (g.id === groupId ? next : g)),
    combat: hp == null ? s.combat : { ...s.combat, combatants: s.combat.combatants.map((c) => (ids.has(c.id) ? { ...c, hp, maxHp: hp, damageTaken: 0 } : c)) },
  }
}

/**
 * Keep groups and the turn order consistent. A grouped monster at 0 HP leaves
 * the group and the order. A group left with fewer than two members dissolves:
 * its last member becomes a normal slot. Returns null when nothing changed.
 */
export function reconcileGroups(s: GroupState): GroupState | null {
  const defeated = new Set<Id>()
  for (const t of s.tokens) {
    if (!t.groupId) continue
    const c = combatantOf(s.combat, t)
    if (c && c.hp != null && c.hp <= 0 && !c.isPC) defeated.add(t.id)
  }
  let tokens = s.tokens
  let combat = s.combat
  if (defeated.size) {
    const ids = new Set(tokens.filter((t) => defeated.has(t.id) && t.combatantId).map((t) => t.combatantId as string))
    combat = removeCombatants(combat, ids)
    tokens = tokens.map((t) => (defeated.has(t.id) ? { ...t, groupId: null, combatantId: null } : t))
  }
  const counts = new Map<Id, number>()
  for (const t of tokens) if (t.groupId) counts.set(t.groupId, (counts.get(t.groupId) ?? 0) + 1)
  const gone = new Set(s.groups.filter((g) => (counts.get(g.id) ?? 0) < 2).map((g) => g.id))
  // A turn slot whose group no longer exists is plain combatants again.
  const live = new Set(s.groups.filter((g) => !gone.has(g.id)).map((g) => g.id))
  const orphans = combat.combatants.some((c) => c.groupTurn && (!c.groupKey || !live.has(c.groupKey)))
  if (!defeated.size && !gone.size && !orphans) return null
  if (gone.size) tokens = tokens.map((t) => (t.groupId && gone.has(t.groupId) ? { ...t, groupId: null } : t))
  if (orphans || gone.size) {
    combat = resortKeepTurn({
      ...combat,
      combatants: combat.combatants.map((c) => {
        if (!c.groupTurn || (c.groupKey && live.has(c.groupKey))) return c
        const { groupTurn: _t, ...rest } = c
        void _t
        return { ...rest, groupKey: null }
      }),
    })
  }
  return { tokens, groups: s.groups.filter((g) => !gone.has(g.id)), combat }
}
