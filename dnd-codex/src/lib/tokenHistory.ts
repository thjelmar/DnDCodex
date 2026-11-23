import type { Id, SceneGroup, SceneToken } from '../db/types'
import { removeCombatants, type Combatant } from './combat'
import type { GroupState } from './battleGroups'

// Undo for deleting a battle map token (T-99). Deleting a token also removes the
// combatant it stands for. The record keeps just enough to put back the token, the
// combatant at its place in the turn order, and the monster group if it dissolved.
// Later HP, condition and turn changes to other combatants stay as they are.

export interface DeletedToken {
  token: SceneToken
  tokenIndex: number
  /** The linked combatant, if the token had one that is still in the combat. */
  combatant: Combatant | null
  combatantIndex: number
  /** The token's monster group, if it had one. */
  group: SceneGroup | null
  groupIndex: number
  /** The group's other tokens and combatants, so a dissolved group comes back whole. */
  siblingTokens: { id: Id; groupId: Id | null }[]
  siblingCombatants: Combatant[]
}

/** Delete one token and its combatant. Returns the next state and a record for undo. */
export function deleteToken(s: GroupState, id: Id): { next: GroupState; record: DeletedToken } | null {
  const tokenIndex = s.tokens.findIndex((t) => t.id === id)
  if (tokenIndex < 0) return null
  const token = s.tokens[tokenIndex]
  const combatantIndex = token.combatantId ? s.combat.combatants.findIndex((c) => c.id === token.combatantId) : -1
  const combatant = combatantIndex >= 0 ? s.combat.combatants[combatantIndex] : null
  const groupIndex = token.groupId ? s.groups.findIndex((g) => g.id === token.groupId) : -1
  const group = groupIndex >= 0 ? s.groups[groupIndex] : null
  const record: DeletedToken = {
    token,
    tokenIndex,
    combatant,
    combatantIndex,
    group,
    groupIndex,
    siblingTokens: group ? s.tokens.filter((t) => t.groupId === group.id && t.id !== id).map((t) => ({ id: t.id, groupId: t.groupId ?? null })) : [],
    siblingCombatants: group ? s.combat.combatants.filter((c) => c.groupKey === group.id && c.id !== combatant?.id) : [],
  }
  return {
    record,
    next: {
      ...s,
      tokens: s.tokens.filter((t) => t.id !== id),
      combat: combatant ? removeCombatants(s.combat, new Set([combatant.id])) : s.combat,
    },
  }
}

/** Put a deleted token back, with its combatant at the same place in the turn order. */
export function restoreToken(s: GroupState, r: DeletedToken): GroupState {
  let { tokens, groups } = s
  let combat = s.combat
  if (!tokens.some((t) => t.id === r.token.id)) {
    const at = Math.min(r.tokenIndex, tokens.length)
    tokens = [...tokens.slice(0, at), r.token, ...tokens.slice(at)]
  }
  // The group dissolves when it drops below two members. Bring it back whole.
  if (r.group && !groups.some((g) => g.id === r.group!.id)) {
    const at = Math.min(Math.max(r.groupIndex, 0), groups.length)
    groups = [...groups.slice(0, at), r.group, ...groups.slice(at)]
    const sibs = new Map(r.siblingTokens.map((t) => [t.id, t.groupId]))
    tokens = tokens.map((t) => (sibs.has(t.id) ? { ...t, groupId: sibs.get(t.id) ?? null } : t))
    const old = new Map(r.siblingCombatants.map((c) => [c.id, c]))
    combat = {
      ...combat,
      combatants: combat.combatants.map((c) => {
        const o = old.get(c.id)
        return o ? { ...c, groupKey: o.groupKey ?? null, groupTurn: o.groupTurn, initiative: o.initiative } : c
      }),
    }
  }
  if (r.combatant && !combat.combatants.some((c) => c.id === r.combatant!.id)) {
    const list = combat.combatants
    const at = Math.min(Math.max(r.combatantIndex, 0), list.length)
    // The turn stays on whoever has it now: inserting at or before it shifts it down one.
    const turnIndex = combat.active && list.length > 0 && at <= combat.turnIndex ? combat.turnIndex + 1 : combat.turnIndex
    combat = { ...combat, combatants: [...list.slice(0, at), r.combatant, ...list.slice(at)], turnIndex }
  }
  return { tokens, groups, combat }
}
