import type { SceneGrid, SceneTemplate, SceneToken } from '../db/types'

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

/** Center pixel of a single grid cell (for magnetic snapping / the ruler). */
export function cellCenterPx(grid: SceneGrid, col: number, row: number): { x: number; y: number } {
  return { x: grid.offsetX + (col + 0.5) * grid.cellPx, y: grid.offsetY + (row + 0.5) * grid.cellPx }
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

// ── Fog of war ───────────────────────────────────────────────────────────────

/** Key for a grid cell, used in the fog's revealed set. */
export function cellKey(col: number, row: number): string {
  return `${col},${row}`
}

/** The grid cell containing a board-space point. */
export function pxToCell(grid: SceneGrid, x: number, y: number): { col: number; row: number } {
  return {
    col: Math.floor((x - grid.offsetX) / grid.cellPx),
    row: Math.floor((y - grid.offsetY) / grid.cellPx),
  }
}

/** Every cell key overlapping the board (for "reveal the whole map"). */
export function boardCellKeys(grid: SceneGrid, width: number, height: number): string[] {
  const c0 = Math.floor((0 - grid.offsetX) / grid.cellPx)
  const c1 = Math.floor((width - 1 - grid.offsetX) / grid.cellPx)
  const r0 = Math.floor((0 - grid.offsetY) / grid.cellPx)
  const r1 = Math.floor((height - 1 - grid.offsetY) / grid.cellPx)
  const keys: string[] = []
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) keys.push(cellKey(c, r))
  return keys
}

// ── Token collision ──────────────────────────────────────────────────────────

/** Do two token footprints (top-left cell + square size) overlap? */
export function footprintsOverlap(
  aCol: number, aRow: number, aSize: number,
  bCol: number, bRow: number, bSize: number,
): boolean {
  return aCol < bCol + bSize && bCol < aCol + aSize && aRow < bRow + bSize && bRow < aRow + aSize
}

/** True if a size×size footprint at (col,row) hits no OTHER token. */
export function cellIsFree(tokens: SceneToken[], movingId: string, col: number, row: number, size: number): boolean {
  return !tokens.some((t) => t.id !== movingId && footprintsOverlap(col, row, size, t.col, t.row, t.size))
}

/**
 * The free cell nearest (col,row) for a token of `size`, so dropping a token on
 * an occupied cell nudges it to open space instead of stacking (which would pile
 * one token's label/HP/conditions on top of another's). Searches outward ring by
 * ring, nearest first; returns the target unchanged if nothing free is close.
 */
export function nearestFreeCell(
  tokens: SceneToken[], movingId: string, col: number, row: number, size: number, maxRadius = 12,
): { col: number; row: number } {
  if (cellIsFree(tokens, movingId, col, row, size)) return { col, row }
  for (let r = 1; r <= maxRadius; r++) {
    const ring: [number, number][] = []
    for (let dc = -r; dc <= r; dc++)
      for (let dr = -r; dr <= r; dr++) if (Math.max(Math.abs(dc), Math.abs(dr)) === r) ring.push([dc, dr])
    ring.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]))
    for (const [dc, dr] of ring) if (cellIsFree(tokens, movingId, col + dc, row + dr, size)) return { col: col + dc, row: row + dr }
  }
  return { col, row }
}

/** True if any of a token's footprint cells is revealed (so players see it). */
export function tokenRevealed(t: SceneToken, revealed: Set<string>): boolean {
  for (let dc = 0; dc < t.size; dc++)
    for (let dr = 0; dr < t.size; dr++) if (revealed.has(cellKey(t.col + dc, t.row + dr))) return true
  return false
}

// ── Measurement & area templates ───────────────────────────────────────────

/** Feet represented by one grid square (D&D's standard 5-foot square). */
export const FT_PER_CELL = 5

/**
 * Distance between two board-space points, in feet, using 5e's movement rule
 * ("count the longer axis"): a diagonal costs the same as a straight step, so
 * the distance is the longer of the horizontal/vertical spans. Rounded to a
 * whole square (5 ft) so the ruler reads in game terms.
 */
export function measureFeet(grid: SceneGrid, x1: number, y1: number, x2: number, y2: number): number {
  const dc = Math.abs(x2 - x1) / grid.cellPx
  const dr = Math.abs(y2 - y1) / grid.cellPx
  return Math.round(Math.max(dc, dr)) * FT_PER_CELL
}

/** Board-space origin (px) of a template — circle center, cone apex, line start. */
export function templateOriginPx(grid: SceneGrid, tpl: SceneTemplate): { x: number; y: number } {
  return { x: grid.offsetX + tpl.col * grid.cellPx, y: grid.offsetY + tpl.row * grid.cellPx }
}

/** A template's principal size (radius or length) in board px. */
function templateSizePx(grid: SceneGrid, tpl: SceneTemplate): number {
  return (tpl.sizeFt / FT_PER_CELL) * grid.cellPx
}

/** Line templates are one square (5 ft) wide by default, matching 5e line spells. */
export const TEMPLATE_LINE_WIDTH_FT = 5

/** Geometry a template renders as, in board px: a circle or a filled polygon. */
export type TemplateGeom =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'poly'; points: [number, number][] }

/**
 * The shape a template covers, in board px. A cone follows 5e's "width equals
 * distance from origin" rule (an isosceles triangle whose base equals its
 * length); a line is a rectangle of TEMPLATE_LINE_WIDTH_FT.
 */
export function templateGeom(grid: SceneGrid, tpl: SceneTemplate): TemplateGeom {
  const o = templateOriginPx(grid, tpl)
  const len = templateSizePx(grid, tpl)
  if (tpl.shape === 'circle') return { kind: 'circle', cx: o.x, cy: o.y, r: len }
  const dir = tpl.dir ?? 0
  const ax = Math.cos(dir)
  const ay = Math.sin(dir)
  const px = -ay // unit perpendicular
  const py = ax
  const ex = o.x + ax * len
  const ey = o.y + ay * len
  if (tpl.shape === 'cone') {
    const half = len / 2 // base width == length
    return { kind: 'poly', points: [[o.x, o.y], [ex + px * half, ey + py * half], [ex - px * half, ey - py * half]] }
  }
  // line
  const half = ((TEMPLATE_LINE_WIDTH_FT / FT_PER_CELL) * grid.cellPx) / 2
  return {
    kind: 'poly',
    points: [
      [o.x + px * half, o.y + py * half],
      [ex + px * half, ey + py * half],
      [ex - px * half, ey - py * half],
      [o.x - px * half, o.y - py * half],
    ],
  }
}

function pointInPoly(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** The grid cells a template covers (center-in-shape), as "col,row" keys — the
 *  D&D "which squares are affected" highlight. */
export function templateCells(grid: SceneGrid, width: number, height: number, tpl: SceneTemplate): string[] {
  const geom = templateGeom(grid, tpl)
  // Bounding box of the shape, clamped to the board, then test each cell center.
  let minX: number, minY: number, maxX: number, maxY: number
  if (geom.kind === 'circle') {
    minX = geom.cx - geom.r
    maxX = geom.cx + geom.r
    minY = geom.cy - geom.r
    maxY = geom.cy + geom.r
  } else {
    const xs = geom.points.map((p) => p[0])
    const ys = geom.points.map((p) => p[1])
    minX = Math.min(...xs)
    maxX = Math.max(...xs)
    minY = Math.min(...ys)
    maxY = Math.max(...ys)
  }
  const c0 = Math.max(0, Math.floor((minX - grid.offsetX) / grid.cellPx))
  const c1 = Math.floor((Math.min(maxX, width) - grid.offsetX) / grid.cellPx)
  const r0 = Math.max(0, Math.floor((minY - grid.offsetY) / grid.cellPx))
  const r1 = Math.floor((Math.min(maxY, height) - grid.offsetY) / grid.cellPx)
  const keys: string[] = []
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const cx = grid.offsetX + (c + 0.5) * grid.cellPx
      const cy = grid.offsetY + (r + 0.5) * grid.cellPx
      const hit = geom.kind === 'circle' ? Math.hypot(cx - geom.cx, cy - geom.cy) <= geom.r : pointInPoly(cx, cy, geom.points)
      if (hit) keys.push(cellKey(c, r))
    }
  }
  return keys
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
