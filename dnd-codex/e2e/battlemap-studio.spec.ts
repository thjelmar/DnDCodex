import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Battle map studio layout (T-95, phase 1): one top bar, a tool rail, an
// edge-to-edge board and a tabbed inspector. Runs on the demo campaign (local data only).

const MAP_PATH = '/#/campaign/demo-campaign-0001/battlemap'

async function openStudio(page: Page, width = 1440, height = 900): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(MAP_PATH)
  await page.locator('.battlemap-maps .list-row').first().click()
  await expect(page.getByTestId('bm-studio')).toBeVisible()
}

const insp = (page: Page) => page.getByTestId('bm-inspector')

test.describe('battle map studio', () => {
  test('one 48px top bar with exactly one of every control', async ({ page }) => {
    await openStudio(page)
    const bar = page.locator('.bm-top')
    expect((await bar.boundingBox())!.height).toBe(48)
    await expect(page.getByTestId('bm-studio').locator('.bm-top')).toHaveCount(1)
    for (const name of ['Switch battle map', 'New battle map', 'Battle map name', 'Inspector', 'Full screen', 'More actions']) {
      await expect(bar.getByRole('button', { name, exact: true }).or(bar.getByLabel(name, { exact: true })), name).toHaveCount(1)
    }
    await expect(bar.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(1)
    await expect(bar.getByRole('button', { name: /Preview/ })).toHaveCount(1)
    await expect(bar.getByRole('link', { name: /Run session/ })).toHaveCount(1)
    await expect(page.getByRole('button', { name: /Run session/ })).toHaveCount(0)
    // The classic header controls are gone.
    await expect(page.getByRole('button', { name: /Preview as player/ })).toHaveCount(1)
    await expect(page.locator('.battlemap-editor')).toHaveCount(0)
  })

  test('the overflow menu offers Upload map and Delete', async ({ page }) => {
    await openStudio(page)
    await page.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('menuitem', { name: /Upload map|Replace map/ })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Delete map/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
  })

  test('the tool rail groups the tools and marks the active one', async ({ page }) => {
    await openStudio(page)
    const tool = (id: string) => page.getByTestId(`tool-${id}`)
    await expect(tool('select')).toHaveAttribute('aria-pressed', 'true')
    await tool('fog').click()
    await expect(tool('fog')).toHaveAttribute('aria-pressed', 'true')
    await expect(tool('select')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.bm-flyout').getByRole('button', { name: 'Reveal', exact: true })).toBeVisible()
    await page.keyboard.press('v')
    await expect(tool('select')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.bm-flyout')).toHaveCount(0)
    await page.keyboard.press('m')
    await expect(tool('measure')).toHaveAttribute('aria-pressed', 'true')
    await tool('templates').click()
    await expect(tool('templates')).toHaveAttribute('aria-pressed', 'true')
    await expect(tool('measure')).toHaveAttribute('aria-pressed', 'false')
  })

  test('Add token and Add object open flyouts that add tokens', async ({ page }) => {
    await openStudio(page)
    const count = () => page.locator('.bm-insp-body .bm-row').count()
    const before = await count()
    await page.getByRole('button', { name: 'Add object', exact: true }).click()
    await page.getByRole('menuitem', { name: /Crate/ }).click()
    await expect.poll(count).toBe(before + 1)
    await page.getByRole('button', { name: 'Add token', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Custom token' }).click()
    await expect.poll(count).toBe(before + 2)
  })

  test('the board fills the area and the inspector docks at 300px', async ({ page }) => {
    await openStudio(page)
    const map = (await page.locator('.bm-map').boundingBox())!
    const view = (await page.locator('.tabletop-view').boundingBox())!
    expect(Math.round(view.width)).toBe(Math.round(map.width))
    expect(Math.round(view.height)).toBe(Math.round(map.height))
    expect((await insp(page).boundingBox())!.width).toBe(300)
    for (const tab of ['Tokens', 'Grid', 'Map']) await expect(insp(page).getByRole('tab', { name: tab })).toBeVisible()
    for (const group of ['Heroes', 'Foes', 'Objects']) await expect(insp(page).getByText(group, { exact: true })).toBeVisible()
    await insp(page).getByRole('tab', { name: 'Grid' }).click()
    await expect(insp(page).getByText('Show grid')).toBeVisible()
    await insp(page).getByRole('tab', { name: 'Map' }).click()
    await expect(insp(page).getByText(/squares/)).toBeVisible()
  })

  test('the eye hides a token from players and the I key toggles the inspector', async ({ page }) => {
    await openStudio(page)
    const eye = insp(page).getByRole('button', { name: /^Hide Bram from players/ })
    await eye.click()
    await expect(insp(page).getByRole('button', { name: /^Show Bram to players/ })).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('i')
    await expect(insp(page)).toHaveCount(0)
    await page.keyboard.press('i')
    await expect(insp(page)).toBeVisible()
    // Typing in a field never triggers a shortcut.
    await insp(page).getByLabel('Filter tokens').fill('ifm')
    await expect(insp(page)).toBeVisible()
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')
  })

  test('the inspector floats, drags and docks again', async ({ page }) => {
    await openStudio(page)
    await insp(page).getByRole('button', { name: 'Float the inspector over the map' }).click()
    await expect(insp(page)).toHaveClass(/bm-insp-float/)
    const hd = insp(page).locator('.bm-insp-hd')
    const before = (await insp(page).boundingBox())!
    const h = (await hd.boundingBox())!
    await page.mouse.move(h.x + 20, h.y + 10)
    await page.mouse.down()
    await page.mouse.move(h.x - 180, h.y + 90, { steps: 5 })
    await page.mouse.up()
    const after = (await insp(page).boundingBox())!
    expect(after.x).toBeLessThan(before.x - 100)
    expect(after.y).toBeGreaterThan(before.y + 50)
    await insp(page).getByRole('button', { name: 'Dock the inspector' }).click()
    await expect(insp(page)).toHaveClass(/bm-insp-docked/)
  })

  test('full screen starts with the inspector closed; I opens a drawer and Esc closes it', async ({ page }) => {
    await openStudio(page)
    await page.keyboard.press('f')
    await expect(page.locator('.bm-studio.expanded')).toBeVisible()
    await expect(insp(page)).toHaveCount(0)
    await page.keyboard.press('i')
    await expect(insp(page)).toHaveClass(/bm-insp-drawer/)
    await page.keyboard.press('Escape')
    await expect(insp(page)).toHaveCount(0)
    await expect(page.locator('.bm-studio.expanded')).toBeVisible()
    await page.getByRole('button', { name: 'Exit full screen' }).click()
    await expect(page.locator('.bm-studio.expanded')).toHaveCount(0)
    await expect(insp(page)).toHaveClass(/bm-insp-docked/)
  })

  test('Preview as player hides the DM tools', async ({ page }) => {
    await openStudio(page)
    await page.getByRole('button', { name: /Preview/ }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Player preview' })).toBeVisible()
    await expect(page.getByTestId('tool-fog')).toBeDisabled()
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(page.getByTestId('tool-fog')).toBeEnabled()
  })

  test('phone width: the inspector is a drawer and touch targets are 38px or larger', async ({ page }) => {
    await openStudio(page, 375, 812)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    await expect(insp(page)).toHaveCount(0)
    for (const id of ['select', 'measure', 'fog', 'templates']) {
      const b = (await page.getByTestId(`tool-${id}`).boundingBox())!
      expect(b.width).toBeGreaterThanOrEqual(38)
      expect(b.height).toBeGreaterThanOrEqual(38)
    }
    await page.getByRole('button', { name: 'Inspector', exact: true }).click()
    await expect(insp(page)).toHaveClass(/bm-insp-drawer/)
    for (const tab of ['Tokens', 'Grid', 'Map']) {
      expect((await insp(page).getByRole('tab', { name: tab }).boundingBox())!.height).toBeGreaterThanOrEqual(38)
    }
    await page.keyboard.press('Escape')
    await expect(insp(page)).toHaveCount(0)
  })

  test('no console errors and no Supabase requests', async ({ page, supabaseRequests }) => {
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    await openStudio(page)
    await page.keyboard.press('f')
    await page.keyboard.press('i')
    await page.keyboard.press('Escape')
    expect(errors).toEqual([])
    expect(supabaseRequests).toEqual([])
  })
})
