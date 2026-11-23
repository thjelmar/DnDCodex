import { test, expect } from '@playwright/test'
import { CARDS, DEFAULT_LAYOUT, LAYOUT_VERSION, reconcile, type SavedLayout } from '../src/lib/overviewCards'

// The Overview card registry and layout reconcile rules (T-87). Pure logic, no browser.

const ids = (l: { cards: { id: string }[] }) => l.cards.map((c) => c.id)
const saved = (over: Partial<SavedLayout> = {}): SavedLayout => ({
  version: LAYOUT_VERSION,
  cards: DEFAULT_LAYOUT.cards.map((c) => ({ ...c })),
  hidden: [],
  knownIds: CARDS.map((c) => c.id),
  ...over,
})

test.describe('overview layout model', () => {
  test('the default shows every non-hidden card once, with valid spans', () => {
    expect(new Set(ids(DEFAULT_LAYOUT)).size).toBe(DEFAULT_LAYOUT.cards.length)
    for (const c of DEFAULT_LAYOUT.cards) expect([4, 6, 8, 12]).toContain(c.span)
    expect(reconcile(null)).toEqual(DEFAULT_LAYOUT)
  })

  test('a saved layout round-trips unchanged', () => {
    const s = saved({ cards: [{ id: 'run', span: 12 }, ...DEFAULT_LAYOUT.cards.filter((c) => c.id !== 'run')] })
    expect(ids(reconcile(s))[0]).toBe('run')
    expect(reconcile(s).cards[0].span).toBe(12)
  })

  test('removed ids are dropped and duplicates keep the first', () => {
    const s = saved({ cards: [{ id: 'gone', span: 6 }, { id: 'run', span: 6 }, { id: 'run', span: 12 }], knownIds: [...CARDS.map((c) => c.id), 'gone'] })
    const r = reconcile(s)
    expect(ids(r)).not.toContain('gone')
    expect(ids(r).filter((i) => i === 'run')).toHaveLength(1)
    expect(r.cards.find((c) => c.id === 'run')!.span).toBe(6)
  })

  test('spans snap to a valid step and rise to the card minimum', () => {
    const r = reconcile(saved({ cards: [{ id: 'world', span: 4 }, { id: 'run', span: 5 }, { id: 'prep', span: 99 }] }))
    expect(r.cards.find((c) => c.id === 'world')!.span).toBe(6) // minSpan 6
    expect(r.cards.find((c) => c.id === 'run')!.span).toBe(6) // invalid, so the default
    expect(r.cards.find((c) => c.id === 'prep')!.span).toBe(6)
  })

  test('a card the layout has never seen is added after its nearest earlier card', () => {
    const s = saved({
      cards: DEFAULT_LAYOUT.cards.filter((c) => c.id !== 'links-voice'),
      knownIds: CARDS.map((c) => c.id).filter((i) => i !== 'links-voice'),
    })
    const r = reconcile(s)
    const order = ids(r)
    expect(order[order.indexOf('links-voice') - 1]).toBe('recent-sessions')
  })

  test('a hidden card stays hidden, and a new card is not mistaken for a hidden one', () => {
    const s = saved({ cards: DEFAULT_LAYOUT.cards.filter((c) => c.id !== 'run'), hidden: ['run'] })
    const r = reconcile(s)
    expect(ids(r)).not.toContain('run')
    expect(r.hidden).toEqual(['run', 'counts'])
  })

  test('a layout from a newer version is ignored', () => {
    expect(reconcile({ ...saved(), version: 99 as 1 })).toEqual(DEFAULT_LAYOUT)
  })

  test('the counts card starts in the tray: default layout, and a layout saved before it existed', () => {
    expect(ids(DEFAULT_LAYOUT)).not.toContain('counts')
    expect(DEFAULT_LAYOUT.hidden).toEqual(['counts'])
    expect(reconcile(null).hidden).toEqual(['counts'])
    // Saved before the card existed: it does not know 'counts', so the card arrives in the tray, not on the page.
    const old = saved({
      cards: DEFAULT_LAYOUT.cards.map((c) => ({ ...c })),
      knownIds: CARDS.map((c) => c.id).filter((i) => i !== 'counts'),
    })
    const r = reconcile(old)
    expect(ids(r)).not.toContain('counts')
    expect(r.hidden).toEqual(['counts'])
  })

  test('a saved layout that includes the counts card shows it, and a card left out of both lists goes to the tray', () => {
    const withCounts = saved({ cards: [{ id: 'counts', span: 12 }, ...DEFAULT_LAYOUT.cards] })
    expect(ids(reconcile(withCounts))[0]).toBe('counts')
    expect(reconcile(withCounts).hidden).toEqual([])
    // Known to the record but placed nowhere (hand-written or damaged): reachable in the tray, never lost.
    const lost = saved({ cards: DEFAULT_LAYOUT.cards.filter((c) => c.id !== 'run'), hidden: [] })
    expect(reconcile(lost).hidden.sort()).toEqual(['counts', 'run'])
  })

  test('a counts card the user hid stays hidden, and a width below its minimum is raised', () => {
    const r = reconcile(saved({ cards: [{ id: 'counts', span: 4 }, ...DEFAULT_LAYOUT.cards] }))
    expect(r.cards[0]).toEqual({ id: 'counts', span: 6 })
    const hidden = reconcile(saved({ hidden: ['counts'] }))
    expect(ids(hidden)).not.toContain('counts')
  })
})
