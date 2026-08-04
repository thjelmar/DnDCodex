import type { RollTable, RollTableEntry } from '../db/types'

// Roll-table math. Each entry carries a `weight` (>= 1) that determines how many
// consecutive die numbers it occupies. The table's effective die is the sum of
// weights, so a table whose weights total 20 rolls like a d20, and an entry with
// weight 3 is three times as likely as a weight-1 entry — while still rendering
// as an authentic "1–3 / 4 / 5–20" style range table.

export interface EntryRange {
  entry: RollTableEntry
  start: number
  end: number
}

function normalizedWeight(entry: RollTableEntry): number {
  return Math.max(1, Math.floor(entry.weight || 1))
}

/** Total number of die faces (sum of weights). */
export function tableSize(entries: RollTableEntry[]): number {
  return entries.reduce((sum, e) => sum + normalizedWeight(e), 0)
}

/** The contiguous die range each entry occupies, in order. */
export function computeRanges(entries: RollTableEntry[]): EntryRange[] {
  let cursor = 1
  return entries.map((entry) => {
    const w = normalizedWeight(entry)
    const start = cursor
    const end = cursor + w - 1
    cursor = end + 1
    return { entry, start, end }
  })
}

/** "5" for a single face, "5–8" for a span. */
export function formatRange(range: EntryRange): string {
  return range.start === range.end ? `${range.start}` : `${range.start}–${range.end}`
}

export interface RollResult {
  roll: number
  size: number
  entry: RollTableEntry
}

/** Rolls the table's die and returns the matching entry, or null if empty. */
export function rollOnTable(table: RollTable): RollResult | null {
  const size = tableSize(table.entries)
  if (size <= 0 || table.entries.length === 0) return null
  const roll = 1 + Math.floor(Math.random() * size)
  const ranges = computeRanges(table.entries)
  const hit =
    ranges.find((r) => roll >= r.start && roll <= r.end) ?? ranges[ranges.length - 1]
  return { roll, size, entry: hit.entry }
}
