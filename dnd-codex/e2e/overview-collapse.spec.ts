import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Collapsing an Overview card shrinks the whole card to its title bar (T-84), and an
// open neighbour keeps its own height. Runs on the demo campaign (local data only).

const DEMO_PATH = '/#/campaign/demo-campaign-0001'

async function openDemo(page: Page, theme: 'dark' | 'light', width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript((t) => {
    sessionStorage.setItem('codex-demo', '1')
    document.documentElement.dataset.theme = t
  }, theme)
  await page.goto(DEMO_PATH)
  await expect(page.locator('.ov-hubcard')).toHaveCount(4)
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
}

const panel = (page: Page, name: string) =>
  page.locator('.ov-panel', { has: page.getByRole('heading', { name, exact: true }) })
const toggle = (page: Page, name: string) => panel(page, name).getByRole('button', { name, exact: true })
const height = async (page: Page, name: string) => (await panel(page, name).boundingBox())!.height

/** Open the panel if needed, then return its open height. */
async function setOpen(page: Page, name: string, open: boolean): Promise<void> {
  const t = toggle(page, name)
  if ((await t.getAttribute('aria-expanded')) !== String(open)) await t.click()
  await expect(t).toHaveAttribute('aria-expanded', String(open))
}

// Links and Voice are one card with two sections (T-85); e2e/overview-links-voice.spec.ts
// covers each section collapsing on its own.
for (const theme of ['dark', 'light'] as const) {
  test.describe(`collapse shrinks the whole card (${theme})`, () => {
    test('desktop: a collapsed hub card is only its title bar and its neighbour keeps its height', async ({ page }) => {
      await openDemo(page, theme, 1400)
      await setOpen(page, 'Prep', true)
      await setOpen(page, 'Run', true)
      const prepOpen = await height(page, 'Prep')
      const runOpen = await height(page, 'Run')
      await setOpen(page, 'Prep', false)
      const prepShut = await height(page, 'Prep')
      const head = (await panel(page, 'Prep').locator('.ov-panel-head').boundingBox())!
      // Title bar plus the 14px padding and 1px border on each side.
      expect(prepShut).toBeLessThanOrEqual(head.height + 32)
      expect(prepShut).toBeLessThan(prepOpen / 2)
      expect(await height(page, 'Run')).toBeCloseTo(runOpen, 0)
      // Expanding restores the card.
      await setOpen(page, 'Prep', true)
      expect(await height(page, 'Prep')).toBeCloseTo(prepOpen, 0)
    })

    test('desktop: every collapsible card shrinks to its title bar', async ({ page }) => {
      await openDemo(page, theme, 1400)
      for (const name of ['Prep', 'Run', 'World & Lore', 'Reference', 'World overview']) {
        await setOpen(page, name, true)
        const open = await height(page, name)
        await setOpen(page, name, false)
        const shut = await height(page, name)
        const head = (await panel(page, name).locator('.ov-panel-head').boundingBox())!
        expect(shut, name).toBeLessThanOrEqual(head.height + 32)
        expect(shut, name).toBeLessThan(open)
      }
    })

    test('phone: a collapsed card is its title bar and nothing scrolls sideways', async ({ page }) => {
      await openDemo(page, theme, 375)
      for (const name of ['Prep', 'Run', 'World & Lore', 'Reference', 'World overview']) {
        await setOpen(page, name, true)
        await setOpen(page, name, false)
        const head = (await panel(page, name).locator('.ov-panel-head').boundingBox())!
        expect(await height(page, name), name).toBeLessThanOrEqual(head.height + 32)
      }
      const overflow = await page.evaluate(() => {
        const el = document.querySelector('.main') as HTMLElement
        return el.scrollWidth - el.clientWidth
      })
      expect(overflow).toBeLessThanOrEqual(0)
    })
  })
}
