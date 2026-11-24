import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// T-109: dice live in the panel, Full screen is the same labelled button on the DM and player
// sides, the zoom bar stays in the visible map, and a popped-out or closed panel gives its space
// back. Demo data only (no sign-in, no Supabase).

const panel = (page: Page) => page.getByTestId('bm-inspector')
const mapBox = (page: Page) => page.locator('.bm-map').boundingBox()

async function openRun(page: Page, size = { width: 1440, height: 900 }): Promise<void> {
  await page.setViewportSize(size)
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto('/#/run/demo-campaign-0001')
  await expect(page.locator('.tabletop-view')).toBeVisible()
}

test('dice are in the panel and the bottom right of the map holds only the zoom bar', async ({ page }) => {
  await openRun(page)
  await expect(page.getByRole('button', { name: /dice bar/i })).toHaveCount(0)
  await panel(page).getByRole('tab', { name: 'Dice' }).click()
  await expect(panel(page).getByRole('button', { name: 'd20', exact: true })).toBeVisible()
  const zoom = (await page.locator('.bm-map .tabletop-zoom').boundingBox())!
  const others = await page.locator('.bm-map button').evaluateAll((els, z) => {
    return els
      .filter((e) => !e.closest('.tabletop-zoom') && !e.closest('.tabletop-token'))
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.left < z.x + z.width && r.right > z.x && r.top < z.y + z.height && r.bottom > z.y).length
  }, zoom)
  expect(others).toBe(0)
})

test('Full screen is the last tool in the left rail on the DM and player sides', async ({ page }) => {
  await openRun(page)
  const dm = page.getByTestId('map-fullscreen')
  await expect(dm).toHaveAttribute('aria-label', 'Full screen')
  const dmBox = (await dm.boundingBox())!
  const dmRail = (await page.locator('.bm-rail').boundingBox())!
  expect(dmBox.x).toBeGreaterThanOrEqual(dmRail.x)
  expect(dmBox.x + dmBox.width).toBeLessThanOrEqual(dmRail.x + dmRail.width)
  const lastDm = await page.locator('.bm-rail button:visible').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  expect(lastDm.filter((t) => t === 'map-fullscreen')).toHaveLength(1)

  await page.goto('/#/')
  await page.getByTestId('demo-player-entry').click()
  await expect(page.locator('.session-vtt')).toBeVisible()
  const pl = page.getByTestId('map-fullscreen')
  await expect(pl).toHaveAttribute('aria-label', 'Full screen')
  const plBox = (await pl.boundingBox())!
  const plBar = (await page.locator('.player-live-bar').boundingBox())!
  // Both sit in the map's slim tool rail: left side of the map, same button size.
  expect(plBox.x).toBeLessThan(plBar.x + plBar.width / 2)
  expect(Math.abs(plBox.width - dmBox.width)).toBeLessThan(10)
  expect(Math.abs(plBox.height - dmBox.height)).toBeLessThan(10)


})

test('the zoom bar stays inside the visible map with the panel docked, floating and closed', async ({ page }) => {
  await openRun(page)
  const inside = async () => {
    const m = (await mapBox(page))!
    const z = (await page.locator('.bm-map .tabletop-zoom').boundingBox())!
    expect(z.x).toBeGreaterThanOrEqual(m.x)
    expect(z.x + z.width).toBeLessThanOrEqual(m.x + m.width)
    expect(z.y + z.height).toBeLessThanOrEqual(m.y + m.height)
  }
  await inside()
  const dock = (await panel(page).boundingBox())!
  expect((await page.locator('.tabletop-zoom').boundingBox())!.x + 1).toBeLessThan(dock.x)
  await page.setViewportSize({ width: 1200, height: 800 })
  await inside()
  // Floating: the panel overlays the map; if it reaches the bar, the bar moves left of it.
  await panel(page).getByRole('button', { name: 'Float the panel over the map' }).click()
  await expect(panel(page)).toHaveClass(/bm-insp-float/)
  await inside()
  await page.keyboard.press('i')
  await inside()
})

test('closing the panel gives the map its full width back, and floating does not reserve space', async ({ page }) => {
  await openRun(page)
  const docked = (await mapBox(page))!
  await panel(page).getByRole('button', { name: 'Float the panel over the map' }).click()
  const floating = (await mapBox(page))!
  expect(floating.width).toBeGreaterThan(docked.width + 200)
  await panel(page).getByRole('button', { name: 'Dock the panel' }).click()
  expect((await mapBox(page))!.width).toBeCloseTo(docked.width, 0)
  await page.keyboard.press('i')
  await expect(panel(page)).toHaveCount(0)
  expect((await mapBox(page))!.width).toBeGreaterThan(docked.width + 200)
})

test('popping the panel out gives its space back to the map', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The popup path is covered in Chromium; WebKit blocks it in automation.')
  await page.addInitScript(() => delete (window as unknown as Record<string, unknown>).documentPictureInPicture)
  await openRun(page)
  const docked = (await mapBox(page))!
  const popupPromise = page.waitForEvent('popup')
  await panel(page).getByRole('button', { name: 'Open the panel in its own window' }).click()
  await popupPromise
  await expect(page.getByTestId('bm-inspector-stub')).toBeVisible()
  expect((await mapBox(page))!.width).toBeGreaterThan(docked.width + 200)
  const z = (await page.locator('.bm-map .tabletop-zoom').boundingBox())!
  const m = (await mapBox(page))!
  expect(z.x + z.width).toBeLessThanOrEqual(m.x + m.width)
})

for (const size of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone portrait', width: 390, height: 844 }, { name: 'phone landscape', width: 844, height: 390 }]) {
  test(`the player map keeps a left tool rail in full screen (${size.name})`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Try the live demo' }).click()
    await page.getByTestId('demo-player-entry').click()
    await expect(page.locator('.session-vtt')).toBeVisible()
    await page.locator('.player-live-board button[aria-label="Full screen"]').first().click()
    const board = page.locator('.player-live-board.expanded')
    await expect(board).toBeVisible()
    const bar = (await board.locator('.player-live-bar').boundingBox())!
    const map = (await board.locator('.tabletop-view').boundingBox())!
    expect(bar.width).toBeLessThan(80)
    expect(bar.x).toBeLessThan(20)
    expect(bar.height).toBeGreaterThan(bar.width)
    expect(bar.x + bar.width).toBeLessThanOrEqual(map.x + 1)
    expect(bar.y + bar.height).toBeLessThanOrEqual(size.height)
    // Banner stays above the rail on wide screens (PR #174).
    const banner = await page.locator('.demo-banner').boundingBox()
    if (banner && size.height > 500) expect(bar.y).toBeGreaterThanOrEqual(banner.y + banner.height - 1)
    await expect(board.locator('.player-live-bar').getByRole('button', { name: 'Exit full screen' })).toBeVisible()
  })
}
