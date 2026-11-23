import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// The core of Overview pointer drag in WebKit, Safari's engine (T-90): move a card, resize
// by its edge, and cancel with Escape. Chromium runs the full set in overview-edit-drag.spec.ts.
// Run by the "webkit" project. Needs `npx playwright install webkit`.

test.use({ viewport: { width: 1440, height: 2600 } })

async function setup(page: Page) {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start a campaign' }).click()
  await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Drag WebKit ${Date.now()}`)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.locator('.ov-hubcard')).toHaveCount(4)
  await page.getByRole('button', { name: 'Edit layout' }).click()
  await expect(page.getByRole('region', { name: 'Editing layout' })).toBeVisible()
}
const titles = (page: Page) => page.locator('.ov-edit-toolbar-name').evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()))
const centre = async (l: ReturnType<Page['locator']>) => {
  const b = (await l.boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
const cellOf = (page: Page, name: string) =>
  page.locator('.ov-cell').filter({ has: page.getByRole('group', { name: `${name} layout controls` }) })
const span = (page: Page, name: string) => cellOf(page, name).evaluate((e) => getComputedStyle(e).gridColumnStart)

test('WebKit: drag a card to the top, saved through a reload', async ({ page }) => {
  await setup(page)
  const from = await centre(page.getByRole('button', { name: /^Drag Run to a new place/ }))
  const world = (await cellOf(page, 'World overview').boundingBox())!
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(world.x + 200, world.y + 10, { steps: 10 })
  await expect(page.locator('.ov-drop-indicator')).toBeVisible()
  await page.mouse.up()
  await expect.poll(async () => (await titles(page))[0]).toBe('Run')
  await page.reload()
  await expect(page.locator('.ov-hubcard')).toHaveCount(4)
  const first = await page.locator('.ov-bento > .ov-cell').first().locator('h3').first().textContent()
  expect(first?.trim()).toBe('Run')
})

test('WebKit: Escape cancels a drag, and the resize handle snaps and saves', async ({ page }) => {
  await setup(page)
  const from = await centre(page.getByRole('button', { name: /^Drag Run to a new place/ }))
  const world = (await cellOf(page, 'World overview').boundingBox())!
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(world.x + 200, world.y + 10, { steps: 6 })
  await expect(page.locator('.ov-drag-ghost')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.ov-drag-ghost')).toHaveCount(0)
  await page.mouse.up()
  expect((await titles(page))[3]).toBe('Run')

  const h = await centre(page.getByRole('button', { name: /^Resize Recent sessions,/ }))
  const grid = (await page.locator('.ov-bento').boundingBox())!
  const cell = (await cellOf(page, 'Recent sessions').boundingBox())!
  const colW = (grid.width - 14 * 11) / 12
  await page.mouse.move(h.x, h.y)
  await page.mouse.down()
  await page.mouse.move(cell.x + 6 * colW + 5 * 14, h.y, { steps: 8 })
  await expect.poll(() => span(page, 'Recent sessions')).toBe('span 6')
  await page.mouse.up()
  await expect(page.locator('.ov-drag-ghost')).toHaveCount(0)
  // Saved, not just previewed: it survives a reload.
  await page.reload()
  await expect(page.locator('.ov-hubcard')).toHaveCount(4)
  const w = await page.locator('.ov-bento > .ov-cell', { hasText: 'Recent sessions' }).first().evaluate((e) => getComputedStyle(e).gridColumnStart)
  expect(w).toBe('span 6')
})
