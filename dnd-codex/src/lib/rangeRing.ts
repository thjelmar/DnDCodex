// Movement range ring (T-103): the squares a token can reach in one move. It is
// a guide, not a rule: walls, terrain and other tokens do not block it.

/** Feet per square. The ruler and the area templates assume the same value. */
export const FT_PER_SQUARE = 5

export type RingDiagonals = 'standard' | '5-10-5'

/** Whole squares a speed covers: 30 ft is 6 squares. */
export function ringSquares(speedFt: number | null | undefined): number {
  if (speedFt == null || !Number.isFinite(speedFt) || speedFt < FT_PER_SQUARE) return 0
  return Math.floor(speedFt / FT_PER_SQUARE)
}

/** Cost, in squares, to reach a cell `dx` columns and `dy` rows away. */
export function stepCost(dx: number, dy: number, rule: RingDiagonals): number {
  const hi = Math.max(dx, dy)
  const lo = Math.min(dx, dy)
  // Standard: every square costs 5 ft, diagonals included (same as the ruler).
  // 5-10-5: every second diagonal costs 10 ft.
  return rule === '5-10-5' ? hi + Math.floor(lo / 2) : hi
}

/**
 * Cells within `squares` of a token's footprint, as [col, row] pairs. The token's
 * own cells are included. The distance is measured from the footprint's nearest
 * edge, so a Large token reaches as far from its edge as a Medium one.
 */
export function ringCells(
  token: { col: number; row: number; size: number },
  squares: number,
  rule: RingDiagonals = 'standard',
  /** Board size in cells; cells outside it are left out. */
  bounds?: { cols: number; rows: number },
): [number, number][] {
  const out: [number, number][] = []
  if (squares <= 0) return out
  const { col, row, size } = token
  for (let c = col - squares; c <= col + size - 1 + squares; c++) {
    for (let r = row - squares; r <= row + size - 1 + squares; r++) {
      if (bounds && (c < 0 || r < 0 || c >= bounds.cols || r >= bounds.rows)) continue
      const dx = Math.max(0, col - c, c - (col + size - 1))
      const dy = Math.max(0, row - r, r - (row + size - 1))
      if (stepCost(dx, dy, rule) <= squares) out.push([c, r])
    }
  }
  return out
}
