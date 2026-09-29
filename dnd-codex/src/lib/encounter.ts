import { crToXp } from './monsters'

// 2024 DMG encounter-difficulty math ("Low / Moderate / High" XP budgets).
//
// Unlike 2014, the 2024 rules use a flat XP budget per character by level, with
// NO "encounter multiplier" for the number of monsters — an encounter's cost is
// simply the sum of its monsters' XP. We compute the party budget, sum the
// encounter's XP, and rate it against the three thresholds.

export type Difficulty = 'low' | 'moderate' | 'high'

/** XP budget PER CHARACTER, by character level (1–20). */
const XP_BUDGET_PER_PC: Record<number, [low: number, moderate: number, high: number]> = {
  1: [50, 75, 100],
  2: [100, 150, 200],
  3: [150, 225, 400],
  4: [250, 375, 500],
  5: [500, 750, 1100],
  6: [600, 1000, 1400],
  7: [750, 1300, 1700],
  8: [1000, 1700, 2100],
  9: [1300, 2000, 2600],
  10: [1600, 2300, 3100],
  11: [1900, 2900, 4100],
  12: [2200, 3700, 4700],
  13: [2600, 4200, 5400],
  14: [2900, 4900, 6200],
  15: [3300, 5400, 7800],
  16: [3800, 6100, 9800],
  17: [4500, 7200, 11700],
  18: [5000, 8700, 14200],
  19: [5500, 10700, 17200],
  20: [6400, 13200, 22000],
}

export interface PartyBudget {
  low: number
  moderate: number
  high: number
}

/** Total party XP budget for a group of `players` all at `level`. */
export function partyBudget(players: number, level: number): PartyBudget {
  const row = XP_BUDGET_PER_PC[clampLevel(level)] ?? XP_BUDGET_PER_PC[1]
  const n = Math.max(0, Math.floor(players))
  return { low: row[0] * n, moderate: row[1] * n, high: row[2] * n }
}

export function clampLevel(level: number): number {
  return Math.min(20, Math.max(1, Math.floor(level)))
}

export interface EncounterCombatantLike {
  cr: number
  count: number
}

/** Total XP of an encounter = sum of each monster's XP × its count. */
export function encounterXp(combatants: EncounterCombatantLike[]): number {
  return combatants.reduce((sum, c) => sum + crToXp(c.cr) * Math.max(0, c.count), 0)
}

export type Rating = 'none' | 'low' | 'moderate' | 'high' | 'deadly'

/** Rate an encounter's total XP against the party's budgets. */
export function rateEncounter(totalXp: number, budget: PartyBudget): Rating {
  if (totalXp <= 0) return 'none'
  if (totalXp <= budget.low) return 'low'
  if (totalXp <= budget.moderate) return 'moderate'
  if (totalXp <= budget.high) return 'high'
  return 'deadly'
}

export const RATING_LABEL: Record<Rating, string> = {
  none: 'Empty',
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  deadly: 'Deadly',
}

export const RATING_COLOR: Record<Rating, string> = {
  none: 'var(--text-dim)',
  low: '#16a34a',
  moderate: '#ca8a04',
  high: '#ea580c',
  deadly: '#dc2626',
}
