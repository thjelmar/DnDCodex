import { SPANS, cardDef, type CardId, type ResolvedLayout, type Span } from '../../lib/overviewCards'

// Pure edits on a layout (T-89). Each returns a new layout, or the same object when the
// edit changes nothing (a move past either end, a width past its limits), so the caller
// can skip a save and an announcement.

/** The widths a card may take: its own minimum up to full width. */
export function spansFor(id: CardId): Span[] {
  const min = cardDef(id)?.minSpan ?? 4
  return SPANS.filter((s) => s >= min)
}

export type MoveTo = number | 'first' | 'last'

/** Moves a card by a number of places (negative is earlier), or to the start or end. */
export function moveCard(layout: ResolvedLayout, id: CardId, to: MoveTo | { by: number }): ResolvedLayout {
  const from = layout.cards.findIndex((c) => c.id === id)
  if (from < 0) return layout
  let target: number
  if (to === 'first') target = 0
  else if (to === 'last') target = layout.cards.length - 1
  else if (typeof to === 'object') target = from + to.by
  else target = to
  target = Math.max(0, Math.min(layout.cards.length - 1, target))
  if (target === from) return layout
  const cards = [...layout.cards]
  const [moved] = cards.splice(from, 1)
  cards.splice(target, 0, moved)
  return { ...layout, cards }
}

/** Steps a card's width to the next narrower (-1) or wider (+1) allowed width. */
export function stepSpan(layout: ResolvedLayout, id: CardId, dir: -1 | 1): ResolvedLayout {
  const i = layout.cards.findIndex((c) => c.id === id)
  if (i < 0) return layout
  const allowed = spansFor(id)
  const at = allowed.indexOf(layout.cards[i].span)
  const next = allowed[Math.max(0, Math.min(allowed.length - 1, (at < 0 ? 0 : at) + dir))]
  if (next === layout.cards[i].span) return layout
  const cards = layout.cards.map((c, k) => (k === i ? { ...c, span: next } : c))
  return { ...layout, cards }
}

/** Removes a card from the page and puts it in the tray. */
export function hideCard(layout: ResolvedLayout, id: CardId): ResolvedLayout {
  if (!layout.cards.some((c) => c.id === id)) return layout
  return {
    cards: layout.cards.filter((c) => c.id !== id),
    hidden: layout.hidden.includes(id) ? layout.hidden : [...layout.hidden, id],
  }
}

/** Puts a card from the tray at the end of the page, at its default width. */
export function addCard(layout: ResolvedLayout, id: CardId): ResolvedLayout {
  const def = cardDef(id)
  if (!def || layout.cards.some((c) => c.id === id)) return layout
  return {
    cards: [...layout.cards, { id, span: def.defaultSpan }],
    hidden: layout.hidden.filter((h) => h !== id),
  }
}
