import type { Tier } from '../data/duelists'

// Daily Duel twist lean (T-66). Yesterday's win rate, compared with the tier's
// balance target, leans today's twist toward the hero or the foe. The same
// numbers live in supabase/migrations/0041_daily_duel_tally.sql (get_duel_lean);
// keep the two in step. The targets come from the balance simulation in
// dnd-codex/scripts/duel-sim.entry.ts (a smart player's win rate per tier).

export type Lean = 'hero' | 'foe'

export const TIER_TARGET: Record<Tier, number> = { easy: 0.95, standard: 0.65, hard: 0.39 }
/** Fewer finished duels than this and there is no lean. */
export const MIN_DUELS = 20
/** How far the win rate may drift from the target before the twist leans. */
export const LEAN_MARGIN = 0.12

/** Mirrors the SQL: 'foe' when the day was too easy, 'hero' when too hard, else null. */
export function leanFor(tier: Tier, wins: number, played: number): Lean | null {
  if (played < MIN_DUELS) return null
  const diff = wins / played - TIER_TARGET[tier]
  if (diff > LEAN_MARGIN) return 'foe'
  if (diff < -LEAN_MARGIN) return 'hero'
  return null
}
