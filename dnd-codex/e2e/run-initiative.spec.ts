import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Run mode's initiative list (T-98, phase 2): the Combat tab. One row per turn slot, a group is one
// slot, only the current row has Damage, Heal and Condition, a row pans the map to its token (no zoom),
// and a token picked on the map selects its row. Demo campaign, local data only (combat lives in
// localStorage, so it works in the demo). Its foes are Mordrek and two Thugs.

async function openRun(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto('/#/run/demo-campaign-0001')
  await expect(page.locator('.tabletop-view')).toBeVisible()
}

const panel = (page: Page) => page.getByTestId('bm-inspector')
const rows = (page: Page) => page.getByTestId('il-row')
const tab = (page: Page, name: string) => panel(page).getByRole('tab', { name, exact: true })
const boardTransform = (page: Page) =>
  page.locator('.tabletop-view svg g[transform^="translate"]').first().getAttribute('transform')

async function groupThugs(page: Page): Promise<void> {
  await tab(page, 'Scene').click()
  const boxes = panel(page).getByRole('checkbox', { name: 'Select Thug for a group' })
  await boxes.nth(0).check()
  await boxes.nth(1).check()
  await panel(page).getByRole('button', { name: 'Group 2 monsters' }).click()
  await page.getByTestId('bm-group').getByRole('button', { name: 'Add to initiative' }).click()
}

test.describe('Run mode initiative list', () => {
  test('a group is one row, and only the current row has Damage, Heal and Condition', async ({ page }) => {
    await openRun(page)
    await tab(page, 'Scene').click()
    await panel(page).getByRole('button', { name: 'Add Mordrek to initiative' }).click()
    await groupThugs(page)
    await tab(page, 'Combat').click()
    await expect(rows(page)).toHaveCount(2)
    await expect(rows(page).filter({ hasText: '× 2' })).toHaveCount(1)
    // Before combat starts nobody is current, so no row shows quick actions.
    await expect(panel(page).getByRole('button', { name: 'Damage' })).toHaveCount(0)
    await page.getByTestId('bm-turns').getByRole('button', { name: 'Start combat' }).click()
    await expect(panel(page).getByRole('button', { name: 'Damage' })).toHaveCount(1)
    await expect(panel(page).getByRole('button', { name: 'Heal' })).toHaveCount(1)
    // One Round counter and one Next button, both in the turn strip, none in the panel.
    await expect(page.getByRole('button', { name: /^Next/ })).toHaveCount(1)
    await expect(panel(page).getByText(/^Round \d/)).toHaveCount(0)
    await expect(panel(page).getByRole('button', { name: /^Next/ })).toHaveCount(0)
    // Next moves the quick actions to the next row.
    const first = await rows(page).first().getAttribute('aria-current')
    await page.keyboard.press('n')
    await expect(panel(page).getByRole('button', { name: 'Damage' })).toHaveCount(1)
    expect(first).toBe('step')
    await expect(rows(page).first()).not.toHaveAttribute('aria-current', 'step')
  })

  test('Damage and Heal change the current row HP; Condition adds a chip', async ({ page }) => {
    await openRun(page)
    await tab(page, 'Combat').click()
    await panel(page).getByRole('button', { name: 'Add combatant' }).click()
    await panel(page).getByPlaceholder('Name').fill('Rook')
    await panel(page).getByLabel('Initiative', { exact: true }).fill('99')
    await panel(page).getByLabel('HP', { exact: true }).fill('20')
    await panel(page).getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByTestId('bm-turns').getByRole('button', { name: 'Start combat' }).click()
    const row = rows(page).filter({ hasText: 'Rook' })
    await expect(row).toContainText('20 / 20')
    await row.getByLabel('Amount').fill('6')
    await row.getByRole('button', { name: 'Damage' }).click()
    await expect(row).toContainText('14 / 20')
    await row.getByRole('button', { name: 'Heal' }).click()
    await expect(row).toContainText('20 / 20')
    await row.getByRole('button', { name: 'Condition' }).click()
    await page.getByLabel('Prone').check()
    await expect(row.locator('.il-cond', { hasText: 'Prone' })).toBeVisible()
  })

  test('a group row aims Damage and Heal at one member at a time', async ({ page }) => {
    await openRun(page)
    await tab(page, 'Scene').click()
    await panel(page).getByRole('button', { name: 'Add Mordrek to initiative' }).click()
    await groupThugs(page)
    await tab(page, 'Combat').click()
    // Give the group the top initiative so it is the current slot when combat starts.
    await panel(page).getByLabel('Thugs initiative').fill('99')
    await page.getByTestId('bm-turns').getByRole('button', { name: 'Start combat' }).click()
    const aim = panel(page).getByRole('group', { name: 'Aim at' }).getByRole('button')
    await expect(aim).toHaveCount(2)
    await expect(aim.first()).toHaveAttribute('aria-pressed', 'true')
    await aim.nth(1).click()
    await expect(aim.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await expect(aim.first()).toHaveAttribute('aria-pressed', 'false')
  })

  test('picking a row selects its token and pans the map without zooming', async ({ page }) => {
    await openRun(page)
    await tab(page, 'Scene').click()
    await panel(page).getByRole('button', { name: 'Add Mordrek to initiative' }).click()
    await panel(page).getByRole('button', { name: 'Add Thug to initiative' }).first().click()
    await tab(page, 'Combat').click()
    const scale = (t: string | null) => /scale\(([\d.]+)\)/.exec(t ?? '')![1]
    const translate = (t: string | null) => /translate\(([-\d.]+) ([-\d.]+)\)/.exec(t ?? '')!.slice(1, 3).join(',')
    const start = await boardTransform(page)
    await rows(page).filter({ hasText: 'Mordrek' }).locator('.il-main').click()
    await expect.poll(() => boardTransform(page)).not.toBe(start)
    const a = await boardTransform(page)
    await rows(page).filter({ hasText: 'Thug' }).first().locator('.il-main').click()
    await expect.poll(() => boardTransform(page)).not.toBe(a)
    const b = await boardTransform(page)
    expect(translate(b)).not.toBe(translate(a))
    expect(scale(b)).toBe(scale(a))
    expect(scale(a)).toBe(scale(start))
    // The token is selected on the board too: the Scene tab lists it as selected.
    await tab(page, 'Scene').click()
    await expect(panel(page).locator('.bm-row.on')).toContainText('Thug')
  })

  test('picking a token on the map selects its row; a turn strip chip does too', async ({ page }) => {
    await openRun(page)
    await tab(page, 'Scene').click()
    await panel(page).getByRole('button', { name: 'Add Mordrek to initiative' }).click()
    await panel(page).getByRole('button', { name: 'Add Thug to initiative' }).first().click()
    // Select Mordrek's token from the Scene list (the same selection a board click makes).
    await panel(page).locator('.bm-row-main', { hasText: 'Mordrek' }).click()
    await tab(page, 'Combat').click()
    await expect(rows(page).filter({ hasText: 'Mordrek' })).toHaveAttribute('data-selected', 'true')
    await expect(rows(page).filter({ hasText: 'Thug' }).first()).not.toHaveAttribute('data-selected', 'true')
    // A chip in the turn strip selects its row.
    await page.getByTestId('bm-turns').locator('.bm-chip').nth(1).click()
    await expect(rows(page).filter({ hasText: 'Thug' }).first()).toHaveAttribute('data-selected', 'true')
  })
})
