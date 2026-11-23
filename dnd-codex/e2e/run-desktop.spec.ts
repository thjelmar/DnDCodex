import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Run mode on a desktop and a tablet (T-98): the map is the page. One top bar, the studio's tool
// rail and board, and one tabbed panel docked on the right (a drawer at 1050px and narrower).
// Demo data only. The phone keeps its own layout (run-map-phone.spec.ts).

const CAMPAIGN = 'demo-campaign-0001'

async function openRun(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size)
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(`/#/run/${CAMPAIGN}`)
  await expect(page.locator('.tabletop-view')).toBeVisible()
}

test.describe('Run mode desktop 1440x900', () => {
  test('the map is the hero: one top bar, no app sidebar, a docked panel', async ({ page }) => {
    await openRun(page, { width: 1440, height: 900 })
    await expect(page.locator('.sidebar')).toBeHidden()
    await expect(page.locator('.run-grid')).toHaveCount(0)
    await expect(page.locator('.bm-top')).toHaveCount(1)
    const r = await page.evaluate(() => {
      const b = (s: string) => document.querySelector(s)!.getBoundingClientRect()
      return { map: b('.tabletop-view'), top: b('.bm-top'), insp: b('.bm-insp'), vw: innerWidth, vh: innerHeight }
    })
    expect(r.top.height).toBeLessThanOrEqual(48)
    // The map fills the room between the rail and the panel, and sits above the fold.
    expect(r.map.width).toBeGreaterThanOrEqual(r.vw - 360 - 48 - 4)
    expect(r.map.bottom).toBeLessThanOrEqual(r.vh + 1)
    expect(r.insp.width).toBeCloseTo(360, 0)
    await expect(page.getByRole('link', { name: 'Exit run mode' })).toBeVisible()
  })

  test('one of each control in the top bar', async ({ page }) => {
    await openRun(page, { width: 1440, height: 900 })
    const top = page.locator('.bm-top')
    for (const name of ['Full screen', 'Run panel', 'Switch session', 'Switch battle map', 'Exit run mode']) {
      await expect(top.getByRole('button', { name }).or(top.getByRole('link', { name })), name).toHaveCount(1)
    }
  })

  test('the panel has Combat, Notes, Handouts, Dice and Scene tabs, one at a time', async ({ page }) => {
    await openRun(page, { width: 1440, height: 900 })
    const insp = page.locator('.bm-insp-docked')
    await expect(insp.getByRole('tab')).toHaveText(['Combat', 'Notes', 'Handouts', 'Dice', 'Scene'])
    await expect(insp.getByText('Start combat')).toBeVisible()
    await insp.getByRole('tab', { name: 'Handouts' }).click()
    await expect(insp.getByText('Start combat')).toHaveCount(0)
    await expect(insp.getByRole('button', { name: /Upload/ })).toBeVisible()
    await insp.getByRole('tab', { name: 'Dice' }).click()
    await expect(insp.getByRole('button', { name: 'd20', exact: true })).toBeVisible()
    await insp.getByRole('tab', { name: 'Scene' }).click()
    await expect(insp.getByRole('group', { name: 'Scene section' }).getByRole('button')).toHaveText(['Tokens', 'Grid', 'Map'])
    await expect(page.locator('.bm-filter')).toBeVisible()
    await insp.getByRole('button', { name: 'Grid' }).click()
    await expect(page.locator('.bm-filter')).toHaveCount(0)
  })

  test('session notes autosave from the Notes tab (a local campaign, since the demo does not save)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Start a campaign' }).click()
    await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Run notes ${Date.now()}`)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
    const campaignId = new URL(page.url()).hash.split('/')[2]
    await page.goto(`/#/campaign/${campaignId}/sessions`)
    await page.getByRole('button', { name: 'New Session' }).click()
    await expect(page.getByText('Session 1').first()).toBeVisible()
    // No map yet: the top bar and the tabs are still there, with a New battle map button.
    await page.goto(`/#/run/${campaignId}`)
    await expect(page.getByTestId('run-top')).toBeVisible()
    const panel = page.getByRole('complementary', { name: 'Run panel' })
    await panel.getByRole('tab', { name: 'Notes' }).click()
    await panel.locator('.ProseMirror').first().click()
    const text = `Run notes ${Date.now()}`
    await page.keyboard.type(text)
    await page.waitForTimeout(900)
    await page.reload()
    await page.getByRole('complementary', { name: 'Run panel' }).getByRole('tab', { name: 'Notes' }).click()
    await expect(page.getByRole('complementary', { name: 'Run panel' })).toContainText(text)
  })

  test('In play opens as a flyout from the rail and closes with Escape; the map keeps its width', async ({ page }) => {
    await openRun(page, { width: 1440, height: 900 })
    const before = (await page.locator('.tabletop-view').boundingBox())!
    await page.getByRole('button', { name: 'In play' }).click()
    const fly = page.getByTestId('run-inplay')
    await expect(fly).toBeVisible()
    await expect(fly.getByPlaceholder('Pin an NPC, place, item…')).toBeVisible()
    expect((await page.locator('.tabletop-view').boundingBox())!.width).toBeCloseTo(before.width, 0)
    await page.keyboard.press('Escape')
    await expect(fly).toBeHidden()
    await page.keyboard.press('[')
    await expect(fly).toBeVisible()
  })

  test('the panel hides and shows with its button and the I key', async ({ page }) => {
    await openRun(page, { width: 1440, height: 900 })
    await page.getByRole('button', { name: 'Run panel' }).click()
    await expect(page.locator('.bm-insp')).toHaveCount(0)
    await page.keyboard.press('i')
    await expect(page.locator('.bm-insp-docked')).toBeVisible()
  })
})

test.describe('Run mode tablet 1024x768', () => {
  test('the panel is a drawer over a full-width map, closed until asked for', async ({ page }) => {
    await openRun(page, { width: 1024, height: 768 })
    await expect(page.locator('.bm-insp')).toHaveCount(0)
    const map = (await page.locator('.tabletop-view').boundingBox())!
    expect(map.width).toBeGreaterThanOrEqual(1024 - 48 - 2)
    await page.getByRole('button', { name: 'Run panel' }).click()
    const drawer = page.locator('.bm-insp-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('tab')).toHaveText(['Combat', 'Notes', 'Handouts', 'Dice', 'Scene'])
    // The map keeps its width under the drawer.
    expect((await page.locator('.tabletop-view').boundingBox())!.width).toBeCloseTo(map.width, 0)
    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    expect(noScroll).toBe(true)
  })

  test('combat and the map are on screen together, with no scrolling', async ({ page }) => {
    await openRun(page, { width: 1024, height: 768 })
    await page.getByRole('button', { name: 'Run panel' }).click()
    await expect(page.locator('.bm-insp-drawer').getByText('Start combat')).toBeVisible()
    const box = (await page.locator('.tabletop-view').boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(768 + 1)
    await expect(page.locator('.bm-insp-drawer')).toBeInViewport()
  })
})
