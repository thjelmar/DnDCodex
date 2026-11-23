import type { Span } from '../../lib/overviewCards'

// The geometry behind pointer drag and the resize handle (T-90). Pure functions on plain
// numbers, so the maths is unit-tested without a browser.

export interface CellRect {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface DropTarget {
  /** Where the dragged card lands among the OTHER cards, in reading order (0 = first). */
  index: number
  /** The card the drop is relative to, or null when there are no other cards. */
  refId: string | null
  before: boolean
  /** True when the reference card fills its row, so "before" means above. */
  fullRow: boolean
}

const distance = (r: CellRect, px: number, py: number) => {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w))
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h))
  return Math.hypot(dx, dy)
}

/**
 * Picks the drop position for a pointer. `others` are the cards other than the dragged
 * one, in reading order. The nearest card (0 when the pointer is inside it) is the
 * reference; the pointer goes before it in its left half (above, in its top half when the
 * card fills the row) and after it otherwise.
 */
export function dropTarget(others: CellRect[], px: number, py: number, containerWidth: number): DropTarget {
  if (others.length === 0) return { index: 0, refId: null, before: true, fullRow: true }
  let best = 0
  let bestD = Infinity
  others.forEach((r, i) => {
    const d = distance(r, px, py)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  const r = others[best]
  const fullRow = r.w >= containerWidth * 0.9
  const before = fullRow ? py < r.y + r.h / 2 : px < r.x + r.w / 2
  return { index: best + (before ? 0 : 1), refId: r.id, before, fullRow }
}

/** The drop indicator's box (a 4 px bar in the 14 px gap beside, or above or below, the reference card). */
export function indicatorBox(ref: CellRect, t: Pick<DropTarget, 'before' | 'fullRow'>): { x: number; y: number; w: number; h: number } {
  if (t.fullRow) return { x: ref.x, y: t.before ? ref.y - 9 : ref.y + ref.h + 5, w: ref.w, h: 4 }
  return { x: t.before ? ref.x - 9 : ref.x + ref.w + 5, y: ref.y, w: 4, h: ref.h }
}

/** One 12-column column's width, from the grid's width and column gap. */
export function columnWidth(containerWidth: number, gap: number, cols = 12): number {
  return (containerWidth - gap * (cols - 1)) / cols
}

/**
 * The allowed width nearest to a card's dragged width. `cardWidth` is the distance from
 * the card's left edge to the pointer. Ties go to the narrower width.
 */
export function snapSpan(cardWidth: number, colW: number, gap: number, allowed: Span[]): Span {
  const cols = (cardWidth + gap) / (colW + gap)
  let best = allowed[0]
  let bestD = Infinity
  for (const s of allowed) {
    const d = Math.abs(cols - s)
    if (d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}
