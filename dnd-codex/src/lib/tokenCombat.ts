import type { Combatant } from './combat'
import type { SceneToken, TokenCombat } from '../db/types'

// Turns a token's linked combatant into the overlay drawn on the board. The
// `forPlayers` flag applies the privacy rule: players see an ally's real HP but,
// for enemies, only the cumulative damage taken — never the enemy's HP pool.

/** A token whose real HP players may see: a PC, a player-controlled token, or
 *  one the DM has explicitly marked friendly. */
export function isAllyToken(t: SceneToken, c: Combatant): boolean {
  return c.isPC || t.controlledBy != null || t.friendly === true
}

export function tokenCombat(t: SceneToken, c: Combatant, activeId: string | null, forPlayers: boolean): TokenCombat {
  const base: TokenCombat = { active: c.id === activeId, conditions: c.conditions }
  // The DM sees everything; ally tokens show HP to players too.
  if (!forPlayers || isAllyToken(t, c)) {
    return { ...base, hp: c.hp, maxHp: c.maxHp, damageTaken: c.damageTaken ?? 0 }
  }
  // Enemies, to players: how much damage they've taken, not their HP.
  return { ...base, damageTaken: c.damageTaken ?? 0 }
}
