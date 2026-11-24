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
    for (const group of ['Characters', 'Enemies', 'Props']) await expect(insp(page).getByText(group, { exact: true })).toBeVisible()
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
    // Maps and New map move into the overflow menu, so the bar never scrolls sideways.
    await expect(page.getByRole('button', { name: 'Switch battle map' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'New battle map' })).toHaveCount(0)
    await page.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'New map' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Full screen' })).toBeVisible()
    const bar = (await page.locator('.bm-top').evaluate((el) => [el.scrollWidth, el.clientWidth])) as number[]
    expect(bar[0]).toBeLessThanOrEqual(bar[1])
  })

  test('Characters, NPCs, Enemies and Props follow the token type, and a Type selector changes it', async ({ page }) => {
    await openStudio(page)
    const group = (name: string) => insp(page).locator('.bm-group', { has: page.getByText(name, { exact: true }) })
    await expect(group('Characters').getByRole('button', { name: 'Vara', exact: true })).toBeVisible()
    await expect(group('Characters').getByRole('button', { name: 'Pip', exact: true })).toBeVisible()
    await expect(group('Enemies').getByRole('button', { name: 'Mordrek', exact: true })).toBeVisible()
    await expect(group('Props').getByRole('button', { name: 'Crate', exact: true })).toBeVisible()
    await group('Props').getByRole('button', { name: 'Crate', exact: true }).click()
    await insp(page).getByLabel('Type').selectOption('enemy')
    await expect(group('Enemies').getByRole('button', { name: 'Crate', exact: true })).toBeVisible()
    await insp(page).getByLabel('Type').selectOption('npc')
    await expect(group('NPCs').getByRole('button', { name: 'Crate', exact: true })).toBeVisible()
    await insp(page).getByLabel('Type').selectOption('')
    await expect(group('Props').getByRole('button', { name: 'Crate', exact: true })).toBeVisible()
  })

  test('chips narrow the list, sections fold, and the bulk menu hides and shows a whole section', async ({ page }) => {
    await openStudio(page)
    const sec = (k: string) => insp(page).getByTestId(`bm-section-${k}`)
    const chip = (n: string) => insp(page).getByRole('group', { name: 'Filter by category' }).getByRole('button', { name: new RegExp(`^${n}`) })
    await chip('Enemies').click()
    await expect(sec('enemy')).toBeVisible()
    await expect(sec('character')).toHaveCount(0)
    await chip('All').click()
    // Fold Enemies: its rows go, its header stays.
    await sec('enemy').getByRole('button', { name: 'Enemies 3', exact: true }).click()
    await expect(sec('enemy').getByRole('button', { name: 'Mordrek', exact: true })).toHaveCount(0)
    await sec('enemy').getByRole('button', { name: 'Enemies 3', exact: true }).click()
    await expect(sec('enemy').getByRole('button', { name: 'Mordrek', exact: true })).toBeVisible()
    // Hide all, then show all.
    await sec('enemy').getByRole('button', { name: 'Enemies actions' }).click()
    await page.getByRole('menuitem', { name: 'Hide all from players' }).click()
    await expect(sec('enemy').getByRole('button', { name: /^Show .* to players$/ })).toHaveCount(3)
    await sec('enemy').getByRole('button', { name: 'Enemies actions' }).click()
    await page.getByRole('menuitem', { name: 'Show all to players' }).click()
    await expect(sec('enemy').getByRole('button', { name: /^Hide .* from players$/ })).toHaveCount(3)
  })

  test('the token card shows what a token has, takes a manual speed, and opens the stat block', async ({ page }) => {
    await openStudio(page)
    const card = page.getByTestId('bm-token-card')
    await expect(card).toHaveCount(0)
    await insp(page).getByRole('button', { name: 'Crate', exact: true }).click()
    await expect(card).toContainText('Crate')
    await expect(card).toContainText('Prop')
    await expect(card.getByRole('button', { name: 'Open stat block' })).toHaveCount(0)
    await card.getByLabel('Speed in feet').fill('30')
    await card.getByLabel('Speed in feet').blur()
    await expect(card).toContainText('30 ft')
    await insp(page).getByRole('button', { name: 'Mordrek', exact: true }).click()
    await expect(card).toContainText('Mordrek')
    await expect(card).toContainText('Enemy')
    await card.getByRole('button', { name: 'Open stat block' }).click()
    await expect(page.getByRole('dialog').or(page.locator('.peek')).first()).toBeVisible()
  })

  test('grid opacity changes the grid layer, and the Dim light tint shows at half strength for the DM', async ({ page }) => {
    await openStudio(page)
    const gridPath = page.locator('.tabletop-view svg path[vector-effect="non-scaling-stroke"]').first()
    await expect(page.getByTestId('board-light')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Grid' }).click()
    await page.getByLabel('Grid opacity').fill('100')
    await expect(gridPath).toHaveAttribute('stroke-opacity', '1')
    await page.getByRole('tab', { name: 'Map' }).click()
    await page.getByRole('group', { name: 'Ambient light' }).getByRole('button', { name: 'Dim' }).click()
    const tint = page.getByTestId('board-light')
    await expect(tint).toHaveAttribute('data-light', 'dim')
    await expect(tint).toHaveAttribute('data-viewer', 'dm')
    await expect(tint).toHaveAttribute('fill-opacity', '0.175')
    await page.getByRole('group', { name: 'Ambient light' }).getByRole('button', { name: 'Bright' }).click()
    await expect(page.getByTestId('board-light')).toHaveCount(0)
  })

  test('the range ring follows the selected token\'s speed, and R toggles it', async ({ page }) => {
    await openStudio(page)
    const ring = page.getByTestId('range-ring')
    await insp(page).getByRole('button', { name: 'Crate', exact: true }).click()
    await expect(ring).toHaveCount(0) // no speed, no ring
    const card = page.getByTestId('bm-token-card')
    await card.getByLabel('Speed in feet').fill('30')
    await card.getByLabel('Speed in feet').blur()
    await expect(ring).toHaveAttribute('data-squares', '6')
    await page.locator('.tabletop-view').press('r')
    await expect(ring).toHaveCount(0)
    await expect(page.getByTestId('tool-range')).toHaveAttribute('aria-pressed', 'false')
    await page.getByTestId('tool-range').click()
    await expect(ring).toHaveAttribute('data-squares', '6')
    await card.getByLabel('Speed in feet').fill('')
    await card.getByLabel('Speed in feet').blur()
    await expect(ring).toHaveCount(0)
  })

  test('a prop gets terrain markers and a footprint: tag, hatch, cover chip, and a card tag', async ({ page }) => {
    await openStudio(page)
    await insp(page).getByRole('button', { name: 'Crate', exact: true }).click()
    await expect(page.getByTestId('terrain-zone')).toHaveCount(0) // unmarked props draw nothing
    const terrain = page.getByTestId('bm-terrain')
    await terrain.getByLabel('Difficult terrain').check()
    await terrain.getByRole('button', { name: '½ cover' }).click()
    await terrain.getByLabel('Footprint width in cells').fill('3')
    await terrain.getByLabel('Footprint width in cells').blur()
    const zone = page.getByTestId('terrain-zone')
    await expect(zone).toHaveCount(1)
    await expect(zone.locator('rect.bm-zone')).toHaveAttribute('data-difficult', 'true')
    await expect(page.getByTestId('cover-chip')).toHaveAttribute('data-cover', 'half')
    await expect(page.getByTestId('bm-terrain-tag')).toHaveText('Difficult · ½ cover')
    await expect(page.getByTestId('bm-card-tags')).toContainText('½ cover')
    await terrain.getByLabel('Blocks movement').check()
    await expect(zone.locator('rect.bm-zone')).toHaveAttribute('data-blocks', 'true')
    // Clearing every marker removes the tag and the chip.
    await terrain.getByLabel('Difficult terrain').uncheck()
    await terrain.getByRole('button', { name: 'No cover' }).click()
    await terrain.getByLabel('Blocks movement').uncheck()
    await expect(page.getByTestId('cover-chip')).toHaveCount(0)
    await expect(page.getByTestId('bm-terrain-tag')).toHaveCount(0)
  })

  test('characters and enemies have no terrain controls', async ({ page }) => {
    await openStudio(page)
    await insp(page).getByRole('button', { name: 'Mordrek', exact: true }).click()
    await expect(page.getByTestId('bm-terrain')).toHaveCount(0)
  })

  test('template presets arm a shape and size, and a spell name labels the placed area', async ({ page }) => {
    await openStudio(page)
    await page.getByTestId('tool-templates').click()
    const place = async (fx: number, fy: number, drag = true) => {
      const b = (await page.locator('.tabletop-view').boundingBox())!
      await page.mouse.move(b.x + b.width * fx, b.y + b.height * fy)
      await page.mouse.down()
      if (drag) await page.mouse.move(b.x + b.width * fx + 90, b.y + b.height * fy + 10, { steps: 4 })
      await page.mouse.up()
    }
    await page.getByRole('group', { name: 'Template presets' }).getByRole('button', { name: 'Cone 30 ft' }).click()
    await expect(page.getByLabel('Template size in feet')).toHaveValue('30')
    await place(0.3, 0.4)
    await expect(page.locator('.battlemap-tpl-chip')).toHaveText(/cone 30ft/)
    await page.getByLabel('Spell name (optional)').fill('Fireball')
    await expect(page.getByLabel('Template size in feet')).toHaveValue('20')
    await place(0.6, 0.5, false)
    await expect(page.locator('.tabletop-template-label')).toHaveText('Fireball')
    await expect(page.locator('.battlemap-tpl-chip').last()).toHaveText(/Fireball 20ft/)
    // A name the list does not know stays a plain label on the current shape.
    await page.getByLabel('Spell name (optional)').fill('Moonbeam')
    await expect(page.getByLabel('Template size in feet')).toHaveValue('20')
    await page.getByRole('group', { name: 'Template shape' }).getByRole('button', { name: 'Cube' }).click()
    await expect(page.getByLabel('Spell name (optional)')).toHaveValue('')
  })

  test('nothing in the docked inspector is clipped: chips, pills, card and terrain fields keep whole labels', async ({ page }) => {
    await openStudio(page)
    await insp(page).getByRole('button', { name: 'Crate', exact: true }).click()
    const clipped = () =>
      insp(page).evaluate((root) => {
        const bad: string[] = []
        const sel = '.bm-kchip, .bm-pill, .bm-terrain-pill, .bm-card button, .bm-card-name, .bm-group-title, .bm-card-speed, .bm-terrain label, .bm-terrain button'
        for (const el of Array.from(root.querySelectorAll<HTMLElement>(sel))) {
          if (el.clientWidth === 0) continue
          // A name that truncates with an ellipsis on purpose is fine; a chip never may.
          if (el.classList.contains('bm-card-name')) continue
          if (el.scrollWidth > el.clientWidth + 1) bad.push(`${el.className}:${el.textContent?.trim()} ${el.scrollWidth}>${el.clientWidth}`)
          const r = el.getBoundingClientRect()
          const p = root.getBoundingClientRect()
          if (r.right > p.right + 1 || r.left < p.left - 1) bad.push(`outside:${el.className}:${el.textContent?.trim()}`)
        }
        return bad
      })
    // Make the card and the terrain group as busy as they get.
    const terrain = page.getByTestId('bm-terrain')
    await terrain.getByLabel('Difficult terrain').check()
    await terrain.getByRole('button', { name: '¾ cover' }).click()
    await terrain.getByLabel('Blocks movement').check()
    expect(await clipped()).toEqual([])
    // Every category chip shows its whole label and a count.
    const chips = page.getByRole('group', { name: 'Filter by category' }).getByRole('button')
    await expect(chips).toHaveCount(5)
    for (const name of ['All', 'Characters', 'NPCs', 'Enemies', 'Props']) {
      await expect(chips.filter({ hasText: name })).toHaveCount(1)
    }
    // Squeeze the dock to the owner's reported width (about 165 px): labels still stay whole.
    await insp(page).evaluate((el) => { el.style.width = '165px' })
    await insp(page).getByRole('button', { name: 'Mordrek', exact: true }).click()
    expect(await clipped()).toEqual([])
    await insp(page).getByRole('group', { name: 'Filter by category' }).scrollIntoViewIfNeeded()
    await insp(page).screenshot({ path: 'test-results/inspector-dock-narrow.png' })
  })

  test('the inspector opens in a popup, shares the same state, and docks when the window closes', async ({ page }) => {
    await page.addInitScript(() => delete (window as unknown as Record<string, unknown>).documentPictureInPicture)
    await openStudio(page)
    const popupPromise = page.waitForEvent('popup')
    await insp(page).getByRole('button', { name: 'Open the inspector in its own window' }).click()
    const popup = await popupPromise
    await expect(popup.getByTestId('bm-inspector')).toBeVisible()
    await expect(popup.getByRole('tab', { name: 'Tokens' })).toBeVisible()
    // Styled like the page, and the page shows a stub with the limit.
    expect(await popup.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
    await expect(page.getByTestId('bm-inspector-stub')).toContainText('cannot keep a separate window on top')
    await expect(page.getByTestId('bm-inspector')).toHaveCount(0)
    // Editing in the window changes the page's state.
    await popup.getByRole('button', { name: /^Hide Bram from players/ }).click()
    await popup.close()
    await expect(page.getByTestId('bm-inspector-stub')).toHaveCount(0)
    await expect(insp(page)).toHaveClass(/bm-insp-docked/)
    await expect(insp(page).getByRole('button', { name: /^Show Bram to players/ })).toBeVisible()
  })

  test('Bring it back closes the window; Document Picture-in-Picture says the window stays on top', async ({ page }) => {
    await page.addInitScript(() => {
      ;(window as unknown as Record<string, unknown>).documentPictureInPicture = {
        requestWindow: async () => window.open('', 'pip-test', 'popup,width=320,height=600'),
      }
    })
    await openStudio(page)
    const popupPromise = page.waitForEvent('popup')
    await insp(page).getByRole('button', { name: 'Open the inspector in its own window' }).click()
    const popup = await popupPromise
    await expect(page.getByTestId('bm-inspector-stub')).toContainText('stays on top of other windows')
    await page.getByRole('button', { name: 'Bring it back' }).click()
    await expect.poll(() => popup.isClosed()).toBe(true)
    await expect(insp(page)).toHaveClass(/bm-insp-docked/)
  })

  test('a blocked popup shows a message and leaves the inspector docked', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as unknown as Record<string, unknown>).documentPictureInPicture
      window.open = () => null
    })
    await openStudio(page)
    await insp(page).getByRole('button', { name: 'Open the inspector in its own window' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'blocked the new window' })).toBeVisible()
    await expect(insp(page)).toHaveClass(/bm-insp-docked/)
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'blocked' })).toHaveCount(0)
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
