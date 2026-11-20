import { test, expect } from '@playwright/test'
import { derivePrepChecklist, hasText } from '../src/lib/prepChecklist'
import { deriveRecentActivity } from '../src/lib/recentActivity'

// The Overview's prep checklist and recently-edited feed (T-70). Both derive from
// records already in the campaign, so the logic is plain functions (no browser)
// and the page is checked once end to end.

const TODAY = '2026-11-20'
const base = { campaign: { nextSessionDate: null, description: '' }, sessions: [], npcs: [], locations: [], today: TODAY }

test.describe('prep checklist logic', () => {
  test('an empty campaign needs a date, a first session, and an overview', () => {
    const items = derivePrepChecklist(base)
    expect(items.map((i) => [i.key, i.done])).toEqual([
      ['schedule', false],
      ['recap', false],
      ['overview', false],
    ])
    expect(items.find((i) => i.key === 'recap')!.label).toBe('Log your first session')
  })

  test('a past session date does not count as scheduled', () => {
    const past = derivePrepChecklist({ ...base, campaign: { nextSessionDate: '2026-11-01', description: '' } })
    const future = derivePrepChecklist({ ...base, campaign: { nextSessionDate: '2026-11-27', description: '' } })
    expect(past[0].done).toBe(false)
    expect(future[0].done).toBe(true)
  })

  test('the recap item follows the latest session by date', () => {
    const items = derivePrepChecklist({
      ...base,
      sessions: [
        { id: 'a', title: 'Old', date: '2026-10-01', notes: 'had a recap' },
        { id: 'b', title: 'Newest', date: '2026-11-10', notes: '<p> </p>' },
      ],
    })
    const recap = items.find((i) => i.key === 'recap')!
    expect(recap.label).toBe('Write the recap for Newest')
    expect(recap.done).toBe(false)
    expect(recap.to).toBe('sessions?sel=b')
  })

  test('hostile NPCs without a stat block are listed, and tick once they have one', () => {
    const npcs = [
      { id: '1', name: 'Mordrek', disposition: 'hostile', statBlock: '' },
      { id: '2', name: 'Sable', disposition: 'friendly', statBlock: '' },
      { id: '3', name: 'Ghoul', disposition: 'hostile', statBlock: '', statBlockData: { ac: 12 } },
    ]
    const open = derivePrepChecklist({ ...base, npcs }).find((i) => i.key === 'statblocks')!
    expect(open.done).toBe(false)
    expect(open.label).toBe('Add stat blocks for 1 hostile NPC')
    expect(open.detail).toBe('Mordrek')
    expect(open.to).toBe('npcs?sel=1')

    const fixed = derivePrepChecklist({
      ...base,
      npcs: npcs.map((n) => (n.id === '1' ? { ...n, statBlock: 'AC 14, HP 30' } : n)),
    }).find((i) => i.key === 'statblocks')!
    expect(fixed.done).toBe(true)
  })

  test('no hostile NPCs and no locations means those items are not shown', () => {
    const keys = derivePrepChecklist({ ...base, npcs: [{ id: '2', name: 'Sable', disposition: 'friendly', statBlock: '' }] }).map(
      (i) => i.key,
    )
    expect(keys).not.toContain('statblocks')
    expect(keys).not.toContain('locations')
  })

  test('blank locations are counted, with names capped at three', () => {
    const locations = ['A', 'B', 'C', 'D', 'E'].map((n, i) => ({ id: String(i), name: n, description: '<p></p>' }))
    const item = derivePrepChecklist({ ...base, locations }).find((i) => i.key === 'locations')!
    expect(item.label).toBe('Describe 5 locations')
    expect(item.detail).toBe('A, B, C and 2 more')
    expect(item.to).toBe('locations')
  })

  test('the world overview item opens the edit dialog, and an image-only overview counts as written', () => {
    const open = derivePrepChecklist(base).find((i) => i.key === 'overview')!
    expect(open.to).toBe('?edit=1')
    const pic = derivePrepChecklist({
      ...base,
      campaign: { nextSessionDate: null, description: '<p><img src="data:image/png;base64,AAAA"></p>' },
    }).find((i) => i.key === 'overview')!
    expect(pic.done).toBe(true)
  })

  test('hasText ignores markup and blank space', () => {
    expect(hasText('<p>&nbsp; </p>')).toBe(false)
    expect(hasText('  ')).toBe(false)
    expect(hasText('<p>Hi</p>')).toBe(true)
    expect(hasText(undefined)).toBe(false)
    // A description that is only a picture or an embed is not blank.
    expect(hasText('<p><img src="data:image/png;base64,AAAA"></p>')).toBe(true)
    expect(hasText('<iframe src="https://example.com"></iframe>')).toBe(true)
    expect(hasText('<video src="a.mp4"></video>')).toBe(true)
    expect(hasText('<p><span> </span></p>')).toBe(false)
  })
})

test.describe('recent activity logic', () => {
  const r = (id: string, name: string, createdAt: string, updatedAt: string) => ({ id, name, createdAt, updatedAt })

  test('merges tables, newest first, capped', () => {
    const feed = deriveRecentActivity(
      {
        npc: [r('n1', 'Bram', '2026-11-01T10:00:00.000Z', '2026-11-18T10:00:00.000Z')],
        location: [r('l1', 'Keep', '2026-11-02T10:00:00.000Z', '2026-11-19T10:00:00.000Z')],
        session: [r('s1', 'Session 1', '2026-11-03T10:00:00.000Z', '2026-11-17T10:00:00.000Z')],
      },
      2,
    )
    expect(feed.map((e) => e.name)).toEqual(['Keep', 'Bram'])
    expect(feed[0].to).toBe('locations?sel=l1')
  })

  test('a record saved just after creation reads as added, a later change as edited', () => {
    const feed = deriveRecentActivity({
      item: [
        r('i1', 'Signet', '2026-11-19T10:00:00.000Z', '2026-11-19T10:00:00.500Z'),
        r('i2', 'Blade', '2026-11-01T10:00:00.000Z', '2026-11-19T11:00:00.000Z'),
      ],
    })
    expect(feed.find((e) => e.id === 'i1')!.action).toBe('added')
    expect(feed.find((e) => e.id === 'i2')!.action).toBe('edited')
  })

  test('a nameless record shows as Untitled', () => {
    const feed = deriveRecentActivity({ note: [r('x', '', '2026-11-19T10:00:00.000Z', '2026-11-19T10:00:00.000Z')] })
    expect(feed[0].name).toBe('Untitled')
  })

  test('empty groups give an empty feed', () => {
    expect(deriveRecentActivity({})).toEqual([])
  })
})
