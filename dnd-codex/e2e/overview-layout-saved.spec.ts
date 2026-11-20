import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// A saved Overview layout (T-88): stored per user in Dexie, honored on load, repaired
// when stale, and reset to the default by deleting the record. There is no edit UI yet,
// so the tests write the record through the app's own modules (Vite serves them in dev).
// Signed out and in the demo nothing reaches Supabase and no sync outbox row is queued.

declare global {
  interface Window {
    // Dev-server module loader added by the init script below. Vite serves /src/*.ts, so the
    // test can call the app's own db and repo functions on the same module instances.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __load: (path: string) => Promise<any>
  }
}

const DEMO_PATH = '/#/campaign/demo-campaign-0001'

type Layout = { cards: { id: string; span: number }[]; hidden: string[] }

async function createCampaign(page: Page): Promise<void> {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start a campaign' }).click()
  await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Saved Layout ${Date.now()}`)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
  await expect(page.locator('.ov-hubcard')).toHaveCount(4)
}

const save = (page: Page, layout: Layout) =>
  page.evaluate(async (l) => {
    const repo = await window.__load('/src/db/repo.ts')
    await repo.saveOverviewLayout(l as never)
  }, layout)

/** The cards on the page in DOM order, with each one's grid column span. */
const onPage = (page: Page) =>
  page.locator('.ov-bento > .ov-cell').evaluateAll((els) =>
    els.map((e) => ({
      title: (e.querySelector('h3')?.textContent ?? '').trim(),
      span: getComputedStyle(e).gridColumnStart,
      end: getComputedStyle(e).gridColumnEnd,
    })),
  )

const stored = (page: Page) =>
  page.evaluate(async () => {
    const { db } = await window.__load('/src/db/db.ts')
    return { layout: (await db.overviewLayout.toArray())[0] ?? null, outbox: await db.pendingGlobal.count() }
  })

test.describe('saved Overview layout', () => {
  test.use({ viewport: { width: 1440, height: 1000 } })
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__load = (p: string) => import(/* @vite-ignore */ p)
    })
  })

  test('a saved order and widths are honored, survive a reload, and keep Tab order equal to visual order', async ({ page, supabaseRequests }) => {
    await createCampaign(page)
    await save(page, {
      cards: [
        { id: 'recent-sessions', span: 12 },
        { id: 'run', span: 4 },
        { id: 'prep', span: 8 },
        { id: 'world', span: 6 },
      ],
      hidden: ['next', 'lore', 'reference', 'prep-checklist', 'recently-edited', 'links-voice'],
    })
    await page.reload()
    await expect(page.locator('.ov-bento > .ov-cell')).toHaveCount(4)

    const cards = await onPage(page)
    expect(cards.map((c) => c.title)).toEqual(['Recent sessions', 'Run', 'Prep', 'World overview'])
    expect(cards.map((c) => c.span)).toEqual(['span 12', 'span 4', 'span 8', 'span 6'])

    // Row-major flow: each card starts below, or to the right of, the one before it.
    const boxes = await page.locator('.ov-bento > .ov-cell').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect()
        return { x: r.x, y: r.y }
      }),
    )
    for (let i = 1; i < boxes.length; i++) {
      const sameRow = Math.abs(boxes[i].y - boxes[i - 1].y) < 2
      expect(sameRow ? boxes[i].x > boxes[i - 1].x : boxes[i].y > boxes[i - 1].y).toBe(true)
    }

    // Tab order follows the DOM order, which is the visual order.
    const seen: string[] = []
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    for (let i = 0; i < 120 && seen.length < 4; i++) {
      await page.keyboard.press('Tab')
      const t = await page.evaluate(() => {
        const cell = document.activeElement?.closest('.ov-bento > .ov-cell')
        return cell ? (cell.querySelector('h3')?.textContent ?? '').trim() : ''
      })
      if (t && !seen.includes(t)) seen.push(t)
    }
    expect(seen).toEqual(['Recent sessions', 'Run', 'Prep', 'World overview'])

    // Signed out: the record is local, and nothing is queued for sync or sent to Supabase.
    const s = await stored(page)
    expect(s.layout?.version).toBe(1)
    expect(s.outbox).toBe(0)
    expect(supabaseRequests).toEqual([])
  })

  test('on a phone every card is full width, in the saved order', async ({ page }) => {
    await createCampaign(page)
    await save(page, {
      cards: [{ id: 'recent-sessions', span: 4 }, { id: 'world', span: 6 }],
      hidden: [],
    })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload()
    await expect(page.locator('.ov-bento > .ov-cell').first()).toBeVisible()
    const cards = await onPage(page)
    expect(cards.slice(0, 2).map((c) => c.title)).toEqual(['Recent sessions', 'World overview'])
    expect(cards.every((c) => c.end === '-1')).toBe(true)
  })

  test('a stale layout is repaired on read: unknown ids dropped, new cards appear, hidden stay hidden', async ({ page }) => {
    await createCampaign(page)
    // Raw record, as an older or newer app version could have written it: an unknown
    // card, a duplicate, an invalid width, and no knowledge of 'links-voice'.
    await page.evaluate(async () => {
      const { db } = await window.__load('/src/db/db.ts')
      await db.overviewLayout.put({
        id: '0b6f2f5e-7a1c-4c3e-9d52-6f1a8e4c0001',
        version: 1,
        cards: [
          { id: 'ghost-card', span: 6 },
          { id: 'world', span: 99 },
          { id: 'world', span: 4 },
          { id: 'recent-sessions', span: 8 },
        ],
        hidden: ['run', 'another-ghost'],
        knownIds: ['world', 'next', 'prep', 'run', 'lore', 'reference', 'recent-sessions', 'prep-checklist', 'recently-edited'],
        updatedAt: new Date().toISOString(),
      })
    })
    await page.reload()
    await expect(page.locator('.ov-bento > .ov-cell').first()).toBeVisible()
    const cards = await onPage(page)
    const titles = cards.map((c) => c.title)
    expect(titles).not.toContain('Run') // hidden by the user
    expect(titles.filter((t) => t === 'World overview')).toHaveLength(1)
    expect(cards[0]).toMatchObject({ title: 'World overview', span: 'span 12' }) // 99 snapped to the default
    expect(titles).toContain('Links') // new since the record was saved: shown
    // The page only reads: opening it did not rewrite the record.
    expect((await stored(page)).layout!.cards.map((c: { id: string }) => c.id)).toContain('ghost-card')
  })

  test('a layout from a newer version is ignored, and Reset brings the default back', async ({ page }) => {
    await createCampaign(page)
    await save(page, { cards: [{ id: 'run', span: 12 }], hidden: [] })
    await page.reload()
    await expect(page.locator('.ov-bento > .ov-cell')).toHaveCount(1)

    await page.evaluate(async () => {
      const { db } = await window.__load('/src/db/db.ts')
      await db.overviewLayout.update('0b6f2f5e-7a1c-4c3e-9d52-6f1a8e4c0001', { version: 99 })
    })
    await expect(page.locator('.ov-bento > .ov-cell')).toHaveCount(10) // default, live

    await save(page, { cards: [{ id: 'run', span: 12 }], hidden: [] })
    await expect(page.locator('.ov-bento > .ov-cell')).toHaveCount(1)
    await page.evaluate(async () => {
      const repo = await window.__load('/src/db/repo.ts')
      await repo.resetOverviewLayout()
    })
    await expect(page.locator('.ov-bento > .ov-cell')).toHaveCount(10)
    expect((await stored(page)).layout).toBeNull()
  })

  test('the World overview editor is not remounted when the saved order changes', async ({ page }) => {
    await createCampaign(page)
    await page.evaluate(async () => {
      const repo = await window.__load('/src/db/repo.ts')
      const camp = location.hash.split('/')[2]
      await repo.updateCampaign(camp, { description: '<p>Hello world</p>' })
    })
    await page.reload()
    await expect(page.locator('.ov-world')).toContainText('Hello world')
    await page.locator('.ov-world').evaluate((el) => el.setAttribute('data-marker', 'same-node'))
    await save(page, {
      cards: [{ id: 'recent-sessions', span: 12 }, { id: 'world', span: 12 }],
      hidden: [],
    })
    await expect(page.locator('.ov-bento > .ov-cell')).toHaveCount(2)
    await expect(page.locator('.ov-world')).toHaveAttribute('data-marker', 'same-node')
  })

  test('the demo honors a layout written to its own database and makes no Supabase request', async ({ page, supabaseRequests }) => {
    await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
    await page.goto(DEMO_PATH)
    await expect(page.locator('.ov-hubcard')).toHaveCount(4)
    await page.evaluate(async () => {
      const { db } = await window.__load('/src/db/db.ts')
      await db.overviewLayout.put({
        id: '0b6f2f5e-7a1c-4c3e-9d52-6f1a8e4c0001', version: 1, cards: [{ id: 'run', span: 12 }, { id: 'world', span: 6 }],
        hidden: [], knownIds: ['world', 'next', 'prep', 'run', 'lore', 'reference', 'recent-sessions', 'prep-checklist', 'recently-edited', 'links-voice'],
        updatedAt: new Date().toISOString(),
      })
    })
    await expect(page.locator('.ov-bento > .ov-cell')).toHaveCount(2)
    // Saving through the app is a silent no-op in the demo, like every passive save.
    await save(page, { cards: [{ id: 'prep', span: 12 }], hidden: [] })
    expect((await stored(page)).layout!.cards.map((c: { id: string }) => c.id)).toEqual(['run', 'world'])
    expect(supabaseRequests).toEqual([])
  })
})
