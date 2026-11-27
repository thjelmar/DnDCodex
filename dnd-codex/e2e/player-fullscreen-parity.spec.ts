import { test, expect } from './fixtures'

// The player's full screen map hosts the same UI as the session page: the tabbed panel, the
// turn order, the "Your turn" banner with End turn, Join initiative and (demo) the Demo controls.
// Demo data only, so no sign-in is needed.

const SIZES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'phone portrait', width: 390, height: 844 },
  { name: 'phone landscape', width: 844, height: 390 },
]

for (const size of SIZES) {
  test(`player full screen shows initiative, Your turn and End turn (${size.name})`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Try the live demo' }).click()
    await page.getByTestId('demo-player-entry').click()
    await page.locator('.session-vtt').waitFor()

    // Pick the Me tab on the page first: full screen must keep the choice.
    await page.getByRole('tab', { name: /Me/ }).click()

    await page.getByRole('button', { name: 'Full screen' }).first().click()
    const board = page.locator('.player-live-board.expanded')
    await expect(board).toBeVisible()
    // The old left notes sidebar is gone.
    await expect(board.locator('.battlemap-notes')).toHaveCount(0)

    // The panel is docked on wide screens; narrow screens open it from the bar.
    if (!(await board.getByTestId('fs-panel').isVisible())) await board.getByTestId('fs-panel-toggle').click()
    await expect(board.getByRole('tab', { name: /Me/ })).toHaveAttribute('aria-selected', 'true')
    await board.getByRole('tab', { name: /Initiative/ }).click()
    await expect(board.getByTestId('initiative-empty')).toBeVisible()
    for (const t of ['Initiative', 'Me', 'Notes', 'Handouts']) await expect(board.getByRole('tab', { name: new RegExp(t) })).toBeVisible()

    // Demo controls are reachable in full screen.
    // The controls float over the map, so open them for each press and close them again.
    const demo = async (id: string) => {
      await board.getByTestId('demo-controls-toggle').click()
      await board.getByTestId(id).click()
      await board.getByTestId('demo-controls-toggle').click()
    }
    await demo('demo-ask')
    await expect(board.getByTestId('initiative-strip')).toBeVisible()
    // Join initiative lives in the turn strip, bottom left of the map.
    const strip = board.getByTestId('initiative-strip')
    const box = await strip.boundingBox()
    expect(box!.x).toBeLessThan(120)
    await strip.getByTestId('join-initiative').click()
    await expect(page.getByTestId('join-pop')).toBeVisible()
    await page.getByTestId('join-submit').click()
    await expect(strip.getByTestId('strip-chip').first()).toBeVisible()
    await demo('demo-start')
    await expect(board.getByTestId('dock-row').filter({ hasText: 'Goblin Boss' })).toBeVisible()

    // Turns pass with the demo DM until it is Thalia's turn: banner and End turn show in full screen.
    for (let i = 0; i < 6 && !(await board.getByTestId('your-turn').isVisible()); i++) await demo('demo-next')
    await expect(board.getByTestId('your-turn')).toContainText('Thalia')
    await board.getByTestId('end-turn').click()
    await expect(board.getByTestId('your-turn')).toHaveCount(0, { timeout: 5000 })

    // The Notes tab opens in the panel (the demo's editor is read-only, so there is no typing here);
    // exit keeps the chosen tab and leaves one docked panel on the page.
    await board.getByRole('tab', { name: /Notes/ }).click()
    await expect(board.locator('.ProseMirror')).toBeVisible()
    await board.getByRole('button', { name: 'Exit full screen' }).click()
    await expect(page.locator('.player-live-board.expanded')).toHaveCount(0)
    await expect(page.locator('html[data-bm-fs]')).toHaveCount(0)
    await expect(page.getByRole('tab', { name: /Notes/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#pl-dock-body .ProseMirror')).toBeVisible()
    await expect(page.getByTestId('player-dock')).toHaveCount(1)
  })
}
