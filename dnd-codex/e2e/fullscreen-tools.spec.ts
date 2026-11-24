import { test, expect } from './fixtures'
import type { Locator, Page } from '@playwright/test'

// Full screen must keep the map tools reachable. The demo banner is a fixed bar above the full
// screen overlay, and once covered the player board's toolbar. Demo data only; a real iPhone
// is not covered (there the in-page overlay is all there is, which is what these tests drive).

const SIZES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
]

/** The element is inside the window and is the topmost thing at its centre, so a tap reaches it. */
async function expectReachable(page: Page, el: Locator, label: string): Promise<void> {
  await expect(el, label).toBeVisible()
  const r = await el.evaluate((node) => {
    const b = node.getBoundingClientRect()
    const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
    return { inside: b.x >= 0 && b.y >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, hit: !!top && (node === top || node.contains(top)) }
  })
  expect(r.inside, `${label} is inside the window`).toBe(true)
  expect(r.hit, `${label} is not covered by something else`).toBe(true)
}

for (const size of SIZES) {
  test(`player board full screen keeps measure, spell area, ping and color (${size.name})`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Try the live demo' }).click()
    await page.getByTestId('demo-player-entry').click()
    await page.locator('.session-vtt').waitFor()

    await page.getByRole('button', { name: 'Full screen' }).first().click()
    const board = page.locator('.player-live-board.expanded')
    await expect(board).toBeVisible()

    const bar = board.locator('.player-live-bar')
    const measure = bar.locator('button[title^="Ruler"]')
    const spell = bar.locator('.player-spell-wrap > button')
    const exit = bar.getByRole('button', { name: 'Exit full screen' })
    await expectReachable(page, measure, 'Measure')
    await expectReachable(page, spell, 'Spell area')
    await expectReachable(page, exit, 'Exit full screen')
    await expectReachable(page, board.getByRole('button', { name: /^◎ Ping$/ }), 'Ping')

    // Color: a swatch on wide screens, behind the color button on a phone.
    const colorBtn = bar.getByRole('button', { name: 'Your token color' })
    if (await colorBtn.isVisible()) {
      await expectReachable(page, colorBtn, 'Color button')
      await colorBtn.click()
    }
    const swatch = board.getByRole('radio', { name: /^Color #/ }).nth(2)
    await expectReachable(page, swatch, 'Color swatch')
    await swatch.click()
    await expect(swatch).toHaveAttribute('aria-checked', 'true')

    // The tools work, not just show.
    await measure.click()
    await expect(measure).toHaveAttribute('aria-label', 'Done')
    await measure.click()
    await spell.click()
    await expect(board.getByRole('menuitem').first()).toBeVisible()
    await spell.click()

    // Exit restores the normal layout.
    await exit.click()
    await expect(page.locator('.player-live-board.expanded')).toHaveCount(0)
    await expect(page.locator('html[data-bm-fs]')).toHaveCount(0)
  })
}

for (const size of SIZES) {
  test.describe(`Run mode ${size.name}`, () => {
  test.use({ isMobile: size.width < 900, hasTouch: size.width < 900 })
  test(`Run mode full screen keeps the rail, top bar and Exit (${size.name})`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
    await page.goto('/#/run/demo-campaign-0001')
    // Narrow screens put the map behind Run mode's Battle Map tab.
    const mapTab = page.locator('button[role="tab"]', { hasText: 'Battle Map' })
    await expect(mapTab.or(page.locator('.tabletop-view'))).toBeVisible()
    if (await mapTab.isVisible()) await mapTab.click()
    await expect(page.locator('.tabletop-view')).toBeVisible()

    // A phone's Run mode already is the full screen studio; wider screens enter it from the top bar.
    const studio = page.locator('.bm-studio.expanded')
    const alreadyFull = (await studio.count()) > 0
    if (!alreadyFull) {
      const direct = page.locator('button[aria-label="Full screen"]:visible')
      if (await direct.count()) await direct.click()
      else {
        await page.locator('button[aria-label="More actions"]').click()
        await page.locator('.bm-item', { hasText: 'Full screen' }).click()
      }
    }
    await expect(studio).toBeVisible()

    await expectReachable(page, studio.locator('.bm-rail .bm-tool').first(), 'First rail tool')
    // The top bar's controls: the Exit button, or on a narrow bar the More actions menu that holds it.
    await expectReachable(page, studio.locator('.bm-top button[aria-label="Exit full screen"], .bm-top button[aria-label="More actions"]').first(), 'Top bar control')
    await expectReachable(page, studio.getByRole('button', { name: /^◎ Ping$/ }), 'Ping')

    // Leave through the same control: the normal layout comes back.
    if (!alreadyFull) {
      const out = page.locator('button[aria-label="Exit full screen"]:visible')
      if (await out.count()) await out.first().click()
      else {
        await page.locator('button[aria-label="More actions"]').click()
        await page.locator('.bm-item', { hasText: 'Exit full screen' }).click()
      }
      await expect(page.locator('.bm-studio.expanded')).toHaveCount(0)
    }
  })
  })
}
