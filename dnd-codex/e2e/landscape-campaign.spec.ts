import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Landscape phone, campaign pages (T-97): a one-row campaign header and a two-column Overview that
// keeps edit mode working. Portrait, a touch tablet and a desktop window stay as they were. These
// tests do not cover a real iPhone.

const CAMPAIGN = 'demo-campaign-0001'
const LANDSCAPE = [
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]

test.use({ isMobile: true, hasTouch: true })

async function openDemo(page: Page, size: { width: number; height: number }, hash: string): Promise<void> {
  await page.setViewportSize(size)
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(`/#/${hash}`)
  await expect(page.locator('.camp-head')).toBeVisible()
}

async function noSideScroll(page: Page): Promise<void> {
  const r = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth, main: document.querySelector('.main')!.scrollWidth, mainW: document.querySelector('.main')!.clientWidth }))
  expect(r.doc).toBeLessThanOrEqual(r.vw)
  expect(r.main).toBeLessThanOrEqual(r.mainW)
}

/** The number of distinct left edges among the visible Overview cells. */
const columnCount = (page: Page) =>
  page.evaluate(() => new Set(Array.from(document.querySelectorAll('.ov-cell')).filter((c) => c.getBoundingClientRect().height > 0).map((c) => Math.round(c.getBoundingClientRect().left))).size)

const headHeight = (page: Page) => page.evaluate(() => Math.round(document.querySelector('.camp-head')!.getBoundingClientRect().height))

for (const size of LANDSCAPE) {
  test.describe(`${size.width}x${size.height} landscape`, () => {
    test('the campaign header is one 38px row with every destination reachable', async ({ page }) => {
      await openDemo(page, size, `campaign/${CAMPAIGN}/npcs`)
      expect(await headHeight(page)).toBeLessThanOrEqual(40)
      const all = page.getByRole('link', { name: 'All campaigns' })
      const b = (await all.boundingBox())!
      expect(b.width).toBeGreaterThanOrEqual(37.5)
      expect(b.height).toBeGreaterThanOrEqual(37.5)
      await expect(page.locator('.camp-crumb-name')).toBeVisible()
      await expect(page.locator('.camp-crumb-page')).toHaveText('NPCs')
      const run = (await page.getByRole('link', { name: /Run session/ }).boundingBox())!
      expect(run.height).toBeGreaterThanOrEqual(37.5)
      // The space above the page content: banner, 40px bar and header stay well under a quarter of the screen.
      const above = await page.evaluate(() => document.querySelector('.camp-head')!.getBoundingClientRect().bottom)
      expect(above).toBeLessThanOrEqual(24 + 40 + 8 + 40 + 2)
      await noSideScroll(page)
      await all.click()
      await expect(page).toHaveURL(/#\/$/)
    })

    test('the Overview has two columns, no side scroll, and unchanged saved widths', async ({ page }) => {
      await openDemo(page, size, `campaign/${CAMPAIGN}`)
      await expect(page.locator('.ov-cell').first()).toBeVisible()
      expect(await columnCount(page)).toBe(2)
      // A card saved at full or two-thirds width spans both columns; the saved span stays in the DOM.
      const wide = await page.evaluate(() => {
        const g = document.querySelector('.ov-bento')!.getBoundingClientRect().width
        return Array.from(document.querySelectorAll<HTMLElement>('.ov-cell')).map((c) => ({ span: c.dataset.span, full: c.getBoundingClientRect().width >= g - 1 }))
      })
      for (const c of wide) if (c.span === '12' || c.span === '8') expect(c.full).toBe(true)
      expect(wide.some((c) => !c.full)).toBe(true)
      await noSideScroll(page)
    })
  })
}

test.describe('edit mode in landscape', () => {
  test.use({ viewport: { width: 844, height: 390 } })
  test('move, hide, Counts and Reset still work and widths stay as saved', async ({ page }) => {
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Start a campaign' }).click()
    await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Land ${Date.now()}`)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
    await expect(page.locator('.ov-hubcard')).toHaveCount(4)
    expect(await columnCount(page)).toBe(2)

    const order = () => page.locator('.ov-edit-toolbar-name').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))
    const spans = () => page.locator('.ov-cell').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.span))
    const before = await spans()
    await page.getByRole('button', { name: 'Edit layout' }).click()
    await expect(page.getByRole('region', { name: 'Editing layout' })).toBeVisible()
    expect(await columnCount(page)).toBe(2)
    const names = await order()
    // Move the third card later (a button tap, not a drag: a landscape phone has no drag handles below 961px).
    const target = names[2]
    await page.getByRole('button', { name: new RegExp(`^Move ${target} later`) }).click()
    expect((await order())[3]).toBe(target)
    // Hide a card, then Reset restores the default.
    await page.getByRole('button', { name: new RegExp(`^Hide ${names[0]}$`) }).click()
    expect(await order()).not.toContain(names[0])
    await page.getByRole('button', { name: 'Reset layout' }).click()
    expect(await order()).toEqual(names)
    // Counts: it is hidden by default and comes back from the tray.
    await page.getByRole('button', { name: /Add card|Add a card|Hidden cards/ }).first().click()
    await page.getByRole('button', { name: /Add Counts back/ }).click()
    expect(await order()).toContain('Counts')
    await page.getByRole('button', { name: 'Reset layout' }).click()
    expect(await spans()).toEqual(before)
    await noSideScroll(page)
  })
})

test('portrait phone and a touch tablet keep one Overview column and the old header', async ({ page }) => {
  await openDemo(page, { width: 390, height: 844 }, `campaign/${CAMPAIGN}`)
  await expect(page.locator('.ov-cell').first()).toBeVisible()
  expect(await columnCount(page)).toBe(1)
  await expect(page.locator('.camp-crumb-label')).toBeVisible()
  await noSideScroll(page)
  await page.setViewportSize({ width: 820, height: 1180 })
  expect(await columnCount(page)).toBe(1)
})

test.describe('desktop', () => {
  test.use({ isMobile: false, hasTouch: false })
  test('keeps the span layout and the text back link', async ({ page }) => {
    await openDemo(page, { width: 1024, height: 768 }, `campaign/${CAMPAIGN}`)
    await expect(page.locator('.ov-cell').first()).toBeVisible()
    const w = await page.evaluate(() => {
      const g = document.querySelector('.ov-bento')!.getBoundingClientRect().width
      return Array.from(document.querySelectorAll('.ov-cell')).map((c) => c.getBoundingClientRect().width / g)
    })
    expect(w.some((x) => x < 0.9)).toBe(true) // a card narrower than the full width, as the spans say
    await expect(page.locator('.camp-crumb-label')).toBeVisible()
  })
})
