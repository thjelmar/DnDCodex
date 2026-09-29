import type { SceneGrid, SceneToken } from '../db/types'

// Pure geometry for the battle-map board. Board space = map-image pixels; tokens
// live in grid cells so re-calibrating the grid carries them along.

export const MAP_MAX_DIM = 3072
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4
/** Smallest on-screen square for the opening view, so tokens are clickable. */
export const MIN_CELL_SCREEN = 22
/** Largest token footprint, in cells per side. */
export const MAX_TOKEN_SIZE = 8

export const TOKEN_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#ca8a04', '#7c3aed', '#db2777', '#0891b2', '#475569']

export const TOKEN_SIZES: { cells: number; label: string }[] = [
  { cells: 1, label: 'Medium (1×1)' },
  { cells: 2, label: 'Large (2×2)' },
  { cells: 3, label: 'Huge (3×3)' },
  { cells: 4, label: 'Gargantuan (4×4)' },
  // Bigger still for set pieces (dragons, vehicles, colossi).
  ...[5, 6, 7, 8].map((n) => ({ cells: n, label: `${n}×${n}` })),
]

export function clampZoom(k: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))
}

/** Top-left pixel of a cell. */
export function cellToPx(grid: SceneGrid, col: number, row: number): { x: number; y: number } {
  return { x: grid.offsetX + col * grid.cellPx, y: grid.offsetY + row * grid.cellPx }
}

/** The cell a token of `size` should snap to, given its dragged center point. */
export function snapCenterToCell(grid: SceneGrid, cx: number, cy: number, size: number): { col: number; row: number } {
  const half = (size * grid.cellPx) / 2
  return {
    col: Math.round((cx - half - grid.offsetX) / grid.cellPx),
    row: Math.round((cy - half - grid.offsetY) / grid.cellPx),
  }
}

/** Center pixel of a token. */
export function tokenCenter(grid: SceneGrid, t: SceneToken): { x: number; y: number } {
  const p = cellToPx(grid, t.col, t.row)
  const half = (t.size * grid.cellPx) / 2
  return { x: p.x + half, y: p.y + half }
}

/** Keep offsets in [0, cellPx) so the grid pattern is well-defined. */
export function normalizeOffset(offset: number, cellPx: number): number {
  return ((offset % cellPx) + cellPx) % cellPx
}

/** A sensible starting grid for a freshly uploaded map: ~25 cells across. */
export function defaultGrid(width: number): SceneGrid {
  return {
    cellPx: Math.max(20, Math.round(width / 25)),
    offsetX: 0,
    offsetY: 0,
    show: true,
    color: '#000000',
  }
}

/**
 * Grid from a user-drawn box (the "align" gesture). The box spans `squares`
 * squares across; its height decides how many it spans down. Boxing several
 * squares divides the hand-drawing error by that many. Sizes stay fractional:
 * rounding a 102.4px square to 102 drifts ~12px across a 30-square map.
 */
export function gridFromBox(
  prev: SceneGrid,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  squares = 1,
): SceneGrid | null {
  const w = Math.abs(x2 - x1)
  const h = Math.abs(y2 - y1)
  const across = Math.max(1, Math.round(squares))
  const guess = w / across
  if (guess < 8) return null
  const down = Math.max(1, Math.round(h / guess))
  const cellPx = round2((w / across + h / down) / 2)
  return {
    ...prev,
    cellPx,
    offsetX: round2(normalizeOffset(Math.min(x1, x2), cellPx)),
    offsetY: round2(normalizeOffset(Math.min(y1, y2), cellPx)),
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Evenly spaced grid lines across the board, as one SVG path. */
export function gridPath(grid: SceneGrid, width: number, height: number): string {
  const parts: string[] = []
  for (let x = normalizeOffset(grid.offsetX, grid.cellPx); x <= width; x += grid.cellPx) parts.push(`M${x} 0V${height}`)
  for (let y = normalizeOffset(grid.offsetY, grid.cellPx); y <= height; y += grid.cellPx) parts.push(`M0 ${y}H${width}`)
  return parts.join('')
}

/** Short initials for a token without a portrait. */
export function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  // Keep a trailing number ("Goblin 3" → "G3") so packs stay distinguishable.
  const last = words[words.length - 1]
  if (words.length > 1 && /^\d+$/.test(last)) return words[0][0].toUpperCase() + last
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}
