import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// The optional Counts card and the Preferences reset (T-91).

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __load: (path: string) => Promise<any>
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__load = (p: string) => import(/* @vite-ignore */ p)
  })
})

const DEMO = '/#/campaign/demo-campaign-0001'
async function openDemo(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(DEMO)
  await expect(page.locator('.ov-hubcard')).toHaveCount(4)
}
async function createCampaign(page: Page) {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start a campaign' }).click()
  await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Counts ${Date.now()}`)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
  await expect(page.locator('.ov-hubcard')).toHaveCount(4)
}
const addCounts = async (page: Page) => {
  await page.getByRole('button', { name: 'Edit layout' }).click()
  await page.getByRole('button', { name: /^Add card/ }).click()
  await page.getByRole('button', { name: 'Add Counts back' }).click()
  await expect(page.locator('.ov-counts')).toBeVisible()
}
const stored = (page: Page) =>
  page.evaluate(async () => {
    const { db } = await window.__load('/src/db/db.ts')
    const r = (await db.overviewLayout.toArray())[0]
    return r ? { cards: r.cards.map((c: { id: string }) => c.id), hidden: r.hidden } : null
  })
const tiles = (page: Page) =>
  page.locator('.ov-counts .ov-tile').evaluateAll((els) =>
    els.map((e) => [e.querySelector('.ov-tile-label')?.textContent, Number(e.querySelector('.ov-tile-value')?.textContent), e.getAttribute('href')]),
  )

test.describe('Counts card', () => {
  test.use({ viewport: { width: 1440, height: 1600 } })

  test('is not on the page by default, is in the tray, and shows six counts that match the data', async ({ page }) => {
    await openDemo(page)
    await expect(page.locator('.ov-counts')).toHaveCount(0)
    await page.getByRole('button', { name: 'Edit layout' }).click()
    await page.getByRole('button', { name: /^Add card \(1\)/ }).click()
    await expect(page.locator('#ov-edit-tray')).toContainText('Sessions, world notes, NPCs')
    await page.getByRole('button', { name: 'Add Counts back' }).click()
    await expect(page.locator('.ov-counts')).toBeVisible()
    await expect(page.getByRole('group', { name: 'Counts layout controls' })).toBeVisible()

    const truth = await page.evaluate(async () => {
      const { db } = await window.__load('/src/db/db.ts')
      const id = location.hash.split('/')[2]
      const n = (t: string) => db.table(t).where('campaignId').equals(id).count()
      return [await n('sessions'), await n('notes'), await n('npcs'), await n('locations'), await n('items'), await n('rollTables')]
    })
    const shown = await tiles(page)
    expect(shown.map((t) => t[0])).toEqual(['Sessions', 'World notes', 'NPCs', 'Locations', 'Items', 'Roll tables'])
    expect(shown.map((t) => t[1])).toEqual(truth)
    expect(truth.some((n: number) => n > 0)).toBe(true)
    expect(shown.map((t) => (t[2] as string).replace(/^.*\//, ''))).toEqual(['sessions', 'notes', 'npcs', 'locations', 'items', 'tables'])
  })

  test('a count links to its page', async ({ page }) => {
    await openDemo(page)
    await addCounts(page)
    await page.getByRole('button', { name: 'Done' }).click()
    await page.locator('.ov-counts .ov-tile', { hasText: 'NPCs' }).click()
    await expect(page).toHaveURL(/#\/campaign\/[^/]+\/npcs/)
  })

  test('add it, it saves through a reload, and Reset hides it again', async ({ page, supabaseRequests }) => {
    await createCampaign(page)
    await addCounts(page)
    await expect.poll(async () => (await stored(page))?.cards.at(-1)).toBe('counts')
    expect((await tiles(page)).map((t) => t[1])).toEqual([0, 0, 0, 0, 0, 0])
    await page.getByRole('button', { name: 'Done' }).click()
    await page.reload()
    await expect(page.locator('.ov-counts')).toBeVisible()
    await page.getByRole('button', { name: 'Edit layout' }).click()
    await page.getByRole('button', { name: 'Reset layout' }).click()
    await expect(page.locator('.ov-counts')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Add card \(1\)/ })).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()
    await page.reload()
    await expect(page.locator('.ov-hubcard')).toHaveCount(4)
    await expect(page.locator('.ov-counts')).toHaveCount(0)
    expect(supabaseRequests.filter((u) => /user_records/.test(u))).toEqual([]) // signed out: nothing synced
  })

  test('shares a row at equal height and keeps Tab order equal to visual order', async ({ page }) => {
    await createCampaign(page)
    await page.evaluate(async () => {
      const repo = await window.__load('/src/db/repo.ts')
      await repo.saveOverviewLayout({
        cards: [{ id: 'world', span: 12 }, { id: 'counts', span: 6 }, { id: 'prep', span: 6 }, { id: 'recent-sessions', span: 12 }],
        hidden: [],
      })
    })
    await expect(page.locator('.ov-bento > .ov-cell')).toHaveCount(4)
    const c = (await page.locator('.ov-cell', { has: page.locator('.ov-counts') }).boundingBox())!
    const p = (await page.locator('.ov-cell', { has: page.locator('.ov-hubcard') }).boundingBox())!
    expect(Math.abs(c.y - p.y)).toBeLessThan(2)
    expect(Math.abs(c.height - p.height)).toBeLessThan(2) // equal height (T-92)
    expect(c.x).toBeLessThan(p.x)
    // Tab order: the counts tiles come before the Prep card's controls, as they do on screen.
    const seen: string[] = []
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    for (let i = 0; i < 120 && seen.length < 3; i++) {
      await page.keyboard.press('Tab')
      const z = await page.evaluate(() => {
        const a = document.activeElement
        return a?.closest('.ov-counts') ? 'counts' : a?.closest('.ov-hubcard') ? 'prep' : a?.closest('.ov-recent') ? 'recent' : ''
      })
      if (z && !seen.includes(z)) seen.push(z)
    }
    expect(seen).toEqual(['counts', 'prep', 'recent'])
    // Collapsing it shrinks it to its title bar beside an open neighbour.
    await page.locator('.ov-counts .ov-panel-toggle').click()
    const collapsed = (await page.locator('.ov-cell', { has: page.locator('.ov-counts') }).boundingBox())!
    expect(collapsed.height).toBeLessThan(p.height - 20)
  })

  for (const theme of ['dark', 'light'] as const) {
    test(`phone: one column, no sideways scroll (${theme})`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('codex.theme', t), theme)
      await page.setViewportSize({ width: 375, height: 812 })
      await createCampaign(page)
      await addCounts(page)
      const overflow = await page.evaluate(() => { const el = document.querySelector('.main') as HTMLElement; return el.scrollWidth - el.clientWidth })
      expect(overflow).toBeLessThanOrEqual(0)
      const box = (await page.locator('.ov-counts').boundingBox())!
      const bento = (await page.locator('.ov-bento').boundingBox())!
      expect(box.width).toBeGreaterThan(bento.width - 2)
    })
  }
})

test.describe('Preferences: reset campaign home layout', () => {
  test.use({ viewport: { width: 1440, height: 1200 } })
  const openPrefs = async (page: Page) => {
    await page.getByRole('button', { name: 'Preferences' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
  }

  test('resets a customized layout, offers Undo, and the Overview follows', async ({ page }) => {
    await createCampaign(page)
    await page.evaluate(async () => {
      const repo = await window.__load('/src/db/repo.ts')
      await repo.saveOverviewLayout({ cards: [{ id: 'recent-sessions', span: 12 }, { id: 'run', span: 6 }], hidden: ['world'] })
    })
    await expect(page.locator('.ov-bento > .ov-cell')).toHaveCount(2)
    await openPrefs(page)
    const reset = page.getByRole('button', { name: 'Reset campaign home layout' })
    await expect(reset).toBeEnabled()
    await reset.click()
    await expect(page.getByRole('dialog').getByRole('status').filter({ hasText: 'Layout reset' })).toBeVisible()
    expect(await stored(page)).toBeNull()
    await expect(reset).toBeDisabled()
    await expect(page.locator('.ov-bento > .ov-cell')).toHaveCount(10)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('.ov-bento > .ov-cell')).toHaveCount(2)
    expect((await stored(page))?.cards).toEqual(['recent-sessions', 'run'])
  })

  test('with no saved layout the button is disabled, and in the demo it does nothing and sends nothing', async ({ page, supabaseRequests }) => {
    await openDemo(page)
    await openPrefs(page)
    const reset = page.getByRole('button', { name: 'Reset campaign home layout' })
    await expect(reset).toBeDisabled()
    await expect(page.getByRole('dialog')).toContainText('You are using the default layout')
    await expect(page.getByRole('dialog')).toContainText('Puts the cards on every campaign')
    expect(supabaseRequests).toEqual([])
  })
})
