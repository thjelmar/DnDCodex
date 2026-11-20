// The Overview card registry (T-87). Every block on the campaign Overview is a card
// with a stable id that is never reused. A layout is an ordered list of cards, each
// with a width in 12-column units, plus the ids the user hid. Heights are automatic.
// This module is pure (no React, no storage) so it is cheap to test and to load.

export type CardId =
  | 'world'
  | 'next'
  | 'prep'
  | 'run'
  | 'lore'
  | 'reference'
  | 'recent-sessions'
  | 'prep-checklist'
  | 'recently-edited'
  | 'links-voice'

/** Widths a card can take on a wide screen: one third, one half, two thirds, full. */
export type Span = 4 | 6 | 8 | 12
export const SPANS: Span[] = [4, 6, 8, 12]

export interface CardDef {
  id: CardId
  title: string
  defaultSpan: Span
  /** The narrowest width the card is allowed to take. */
  minSpan: Span
  /** True for a card that starts in the tray instead of on the page. */
  defaultHidden?: boolean
  /** One line for the tray of hidden cards. */
  blurb: string
  /** Legacy class on the card's cell, kept so existing styles and tests find it. */
  cellClass?: string
}

/** The catalogue, in the default reading order. */
export const CARDS: CardDef[] = [
  { id: 'world', title: 'World overview', blurb: 'The campaign world description.', defaultSpan: 12, minSpan: 6 },
  { id: 'next', title: 'Next session', blurb: "The next session's date, time and RSVP summary.", defaultSpan: 12, minSpan: 6 },
  { id: 'prep', title: 'Prep', blurb: 'Last session recap, planning, and prep counts.', defaultSpan: 6, minSpan: 4 },
  { id: 'run', title: 'Run', blurb: 'Start Run Mode and see the latest battle map.', defaultSpan: 6, minSpan: 4 },
  { id: 'lore', title: 'World & Lore', blurb: 'NPCs, locations, world notes and families.', defaultSpan: 6, minSpan: 4 },
  { id: 'reference', title: 'Reference', blurb: 'Newest items, roll tables and tags.', defaultSpan: 6, minSpan: 4 },
  { id: 'recent-sessions', title: 'Recent sessions', blurb: 'The last few sessions you logged.', defaultSpan: 8, minSpan: 4 },
  { id: 'links-voice', title: 'Links and Voice', blurb: 'Your external links and the Discord voice channel.', defaultSpan: 4, minSpan: 4, cellClass: 'ov-side' },
  { id: 'prep-checklist', title: 'Prep checklist', blurb: 'A checklist that ticks itself as you prepare.', defaultSpan: 6, minSpan: 4, cellClass: 'ov-extras' },
  { id: 'recently-edited', title: 'Recently edited', blurb: 'The latest changes across the campaign.', defaultSpan: 6, minSpan: 4, cellClass: 'ov-extras' },
]

const BY_ID = new Map<string, CardDef>(CARDS.map((c) => [c.id, c]))

export function cardDef(id: string): CardDef | undefined {
  return BY_ID.get(id)
}

export interface LayoutCard {
  id: CardId
  span: Span
}

/** What a user saves. Phase B stores this; until then everyone gets the default. */
export interface SavedLayout {
  version: number
  cards: { id: string; span: number }[]
  hidden: string[]
  /** Every card id that existed when the layout was last saved. */
  knownIds: string[]
}

/** The layout the Overview renders: visible cards in order, and the tray. */
export interface ResolvedLayout {
  cards: LayoutCard[]
  hidden: CardId[]
}

export const LAYOUT_VERSION = 1

/** The one layout record's key, in Dexie and in the cloud (`user_records.id` is a uuid). */
export const OVERVIEW_LAYOUT_ID = '0b6f2f5e-7a1c-4c3e-9d52-6f1a8e4c0001'

export const DEFAULT_LAYOUT: ResolvedLayout = {
  cards: CARDS.filter((c) => !c.defaultHidden).map((c) => ({ id: c.id, span: c.defaultSpan })),
  hidden: CARDS.filter((c) => c.defaultHidden).map((c) => c.id),
}

const clampSpan = (def: CardDef, span: number): Span => {
  const s = SPANS.includes(span as Span) ? (span as Span) : def.defaultSpan
  return s < def.minSpan ? def.minSpan : s
}

/**
 * Turns a saved layout (or none) into what the page renders. Never writes.
 *  - no saved layout, or one from a newer version: the default
 *  - ids no longer in the catalogue are dropped; duplicates keep the first
 *  - spans are snapped to a valid step and raised to the card's minimum
 *  - a catalogue card the saved layout has never seen is inserted after the nearest
 *    earlier catalogue card that is still shown (or first), or put in the tray when
 *    the card starts hidden
 *  - a card the user hid stays hidden
 */
export function reconcile(saved: SavedLayout | null | undefined): ResolvedLayout {
  if (!saved || saved.version !== LAYOUT_VERSION || !Array.isArray(saved.cards)) {
    return { cards: [...DEFAULT_LAYOUT.cards], hidden: [...DEFAULT_LAYOUT.hidden] }
  }
  const seen = new Set<string>()
  const cards: LayoutCard[] = []
  for (const c of saved.cards) {
    const def = BY_ID.get(c.id)
    if (!def || seen.has(c.id)) continue
    seen.add(c.id)
    cards.push({ id: def.id, span: clampSpan(def, c.span) })
  }
  const hidden: CardId[] = []
  for (const id of saved.hidden ?? []) {
    const def = BY_ID.get(id)
    if (!def || seen.has(id)) continue
    seen.add(id)
    hidden.push(def.id)
  }
  const known = new Set(saved.knownIds ?? [])
  CARDS.forEach((def, i) => {
    if (seen.has(def.id) || known.has(def.id)) return
    seen.add(def.id)
    if (def.defaultHidden) {
      hidden.push(def.id)
      return
    }
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const k = cards.findIndex((c) => c.id === CARDS[j].id)
      if (k >= 0) {
        at = k + 1
        break
      }
    }
    cards.splice(at, 0, { id: def.id, span: def.defaultSpan })
  })
  return { cards, hidden }
}

/** True when two layouts show the same cards, in the same order, at the same widths. */
export function sameLayout(a: ResolvedLayout, b: ResolvedLayout): boolean {
  return (
    a.cards.length === b.cards.length &&
    a.hidden.length === b.hidden.length &&
    a.cards.every((c, i) => c.id === b.cards[i].id && c.span === b.cards[i].span) &&
    a.hidden.every((h, i) => h === b.hidden[i])
  )
}
