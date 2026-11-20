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

/** The height a card needs for its own content (head, body, padding, border), ignoring any stretch. */
async function naturalHeight(page: Page, name: string, outer = '.ov-panel'): Promise<number> {
  const el = outer === '.ov-panel' ? panel(page, name) : page.locator(outer)
  return el.evaluate((node) => {
    const cs = getComputedStyle(node)
    let h = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
    for (const c of Array.from(node.children)) {
      const k = getComputedStyle(c)
      if (k.display === 'none') continue
      h += (c as HTMLElement).getBoundingClientRect().height + parseFloat(k.marginTop) + parseFloat(k.marginBottom)
    }
    return h
  })
}

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
    test('desktop: open cards in a row match; a collapsed card is only its title bar (T-92)', async ({ page }) => {
      await openDemo(page, theme, 1400)
      await setOpen(page, 'Prep', true)
      await setOpen(page, 'Run', true)
      // Two open cards in one row are the same height, and expanding again restores that.
      const matched = await height(page, 'Prep')
      expect(await height(page, 'Run')).toBeCloseTo(matched, 0)
      // Collapse Prep: it is only its title bar, and Run drops to its own content height.
      await setOpen(page, 'Prep', false)
      const head = (await panel(page, 'Prep').locator('.ov-panel-head').boundingBox())!
      expect(await height(page, 'Prep')).toBeLessThanOrEqual(head.height + 32)
      expect(await height(page, 'Run')).toBeCloseTo(await naturalHeight(page, 'Run'), 0)
      // Collapse Run too and open Prep: now Run is the short one and Prep keeps its own height.
      await setOpen(page, 'Prep', true)
      await setOpen(page, 'Run', false)
      expect(await height(page, 'Prep')).toBeCloseTo(await naturalHeight(page, 'Prep'), 0)
      expect(await height(page, 'Run')).toBeLessThanOrEqual(head.height + 32)
      await setOpen(page, 'Run', true)
      expect(await height(page, 'Prep')).toBeCloseTo(matched, 0)
      expect(await height(page, 'Run')).toBeCloseTo(matched, 0)
    })

    test('desktop: the second row matches too, and two collapsed cards share a short row', async ({ page }) => {
      await openDemo(page, theme, 1400)
      await setOpen(page, 'World & Lore', true)
      await setOpen(page, 'Reference', true)
      expect(await height(page, 'World & Lore')).toBeCloseTo(await height(page, 'Reference'), 0)
      await setOpen(page, 'World & Lore', false)
      await setOpen(page, 'Reference', false)
      for (const n of ['World & Lore', 'Reference']) {
        const head = (await panel(page, n).locator('.ov-panel-head').boundingBox())!
        expect(await height(page, n), n).toBeLessThanOrEqual(head.height + 32)
      }
    })

    test('desktop: Links and Voice matches its row while both sections are open and shrinks when one is closed', async ({ page }) => {
      await openDemo(page, theme, 1400)
      const card = page.locator('.ov-duo')
      const recent = page.locator('.ov-recent')
      for (const n of ['Links', 'Voice']) await setOpen(page, n, true)
      expect((await card.boundingBox())!.height).toBeCloseTo((await recent.boundingBox())!.height, 0)
      await setOpen(page, 'Links', false)
      expect((await card.boundingBox())!.height).toBeCloseTo(await naturalHeight(page, 'Voice', '.ov-duo'), 0)
      await setOpen(page, 'Voice', false)
      // Both sections closed: just two title bars with their padding, far below the row height.
      expect((await card.boundingBox())!.height).toBeLessThan(130)
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
