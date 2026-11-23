import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Monster groups on the battle map (T-95, phase 4). Grouping is prep only; a group in
// initiative is one turn slot. Runs on the demo campaign (local data only): its foes are
// Mordrek and two Thugs.

async function openStudio(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto('/#/campaign/demo-campaign-0001/battlemap')
  await page.locator('.battlemap-maps .list-row').first().click()
  await expect(page.getByTestId('bm-studio')).toBeVisible()
}

const insp = (page: Page) => page.getByTestId('bm-inspector')
const strip = (page: Page) => page.getByTestId('bm-turns')
const turnLine = (page: Page) => strip(page).locator('.bm-turns-round small')
const box = (page: Page) => page.getByTestId('bm-group')

async function groupThugs(page: Page): Promise<void> {
  const boxes = insp(page).getByRole('checkbox', { name: 'Select Thug for a group' })
  await boxes.nth(0).check()
  await expect(insp(page).getByRole('button', { name: /^Group \d+ monsters/ })).toHaveCount(0)
  await boxes.nth(1).check()
  await insp(page).getByRole('button', { name: 'Group 2 monsters' }).click()
  await expect(box(page)).toBeVisible()
}

test.describe('monster groups', () => {
  test('grouping is prep only: nobody joins initiative, visibility is unchanged', async ({ page }) => {
    await openStudio(page)
    await groupThugs(page)
    await expect(box(page)).toContainText('Thugs ×2')
    await expect(box(page)).toContainText('Prep only')
    await expect(box(page).getByRole('button', { name: 'Add to initiative' })).toBeVisible()
    await expect(strip(page)).toHaveCount(0)
    // Both tokens wear the dashed ring; the members' checkboxes and + Init toggles are gone.
    await expect(page.locator('.tabletop-group-ring')).toHaveCount(2)
    await expect(insp(page).getByRole('checkbox', { name: 'Select Thug for a group' }).first()).toBeDisabled()
    await expect(insp(page).getByRole('button', { name: /Thug to initiative/ })).toHaveCount(0)
    // No visibility change: every eye still reads "visible".
    await expect(insp(page).getByRole('button', { name: /^Hide Thug from players/ })).toHaveCount(2)
  })

  test('a single monster has a + Init toggle', async ({ page }) => {
    await openStudio(page)
    const toggle = insp(page).getByRole('button', { name: 'Add Mordrek to initiative' })
    await toggle.click()
    await expect(strip(page).locator('.bm-chip')).toHaveCount(1)
    await insp(page).getByRole('button', { name: 'Remove Mordrek from initiative' }).click()
    await expect(strip(page)).toHaveCount(0)
  })

  test('a group in initiative is one chip of stacked avatars with no label; its name shows under the round', async ({ page }) => {
    await openStudio(page)
    await insp(page).getByRole('button', { name: 'Add Mordrek to initiative' }).click()
    await groupThugs(page)
    await box(page).getByRole('button', { name: 'Add to initiative' }).click()
    await expect(box(page)).toContainText('In initiative')
    await expect(box(page).getByRole('button', { name: 'Remove from initiative' })).toBeVisible()
    const chip = strip(page).getByTestId('bm-group-chip')
    await expect(chip).toHaveCount(1)
    await expect(chip.locator('.bm-chip')).toHaveCount(2)
    await expect(chip).not.toContainText('Thug')
    // Mordrek and the group are two slots.
    await expect(strip(page).locator('ol > li')).toHaveCount(2)
    await strip(page).getByRole('button', { name: 'Start combat' }).click()
    // Walk the order: the group's turn reads "Thugs' turn" and every member pulses.
    for (let i = 0; i < 3; i++) {
      if ((await turnLine(page).textContent()) === "Thugs' turn") break
      await strip(page).getByRole('button', { name: /Next/ }).click()
    }
    await expect(turnLine(page)).toHaveText("Thugs' turn")
    await expect(page.locator('.tabletop-turn-halo')).toHaveCount(2)
    await expect(strip(page)).not.toContainText(/act together/i)
    // One Next leaves the group; two slots means two Nexts make a round.
    await strip(page).getByRole('button', { name: /Next/ }).click()
    await expect(page.locator('.tabletop-turn-halo')).toHaveCount(1)
  })

  test('the group rolls initiative once and the field can be typed', async ({ page }) => {
    await openStudio(page)
    await groupThugs(page)
    const init = box(page).getByLabel('Thugs initiative')
    await box(page).getByRole('button', { name: 'Roll' }).click()
    const rolled = Number(await init.inputValue())
    expect(rolled).toBeGreaterThanOrEqual(1)
    expect(rolled).toBeLessThanOrEqual(20)
    await init.fill('17')
    await init.blur()
    await box(page).getByRole('button', { name: 'Add to initiative' }).click()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('codex.combat')!))
    expect(saved.combatants.map((c: { initiative: number }) => c.initiative)).toEqual([17, 17])
    expect(new Set(saved.combatants.map((c: { groupKey: string }) => c.groupKey)).size).toBe(1)
  })

  test('HP each applies to every member, with an Edit per monster option', async ({ page }) => {
    await openStudio(page)
    await groupThugs(page)
    const hp = box(page).getByLabel('Thugs HP each')
    await hp.fill('9')
    await hp.blur()
    await expect(insp(page).locator('.bm-row', { hasText: 'Thug' }).locator('.bm-pill')).toHaveText(['9/9', '9/9'])
    await box(page).getByRole('button', { name: 'Edit per monster' }).click()
    const fields = box(page).locator('.bm-gbox-each input')
    await expect(fields).toHaveCount(2)
    await fields.nth(1).fill('4')
    await fields.nth(1).blur()
    await expect(insp(page).locator('.bm-row', { hasText: 'Thug' }).locator('.bm-pill')).toHaveText(['9/9', '4/4'])
    await box(page).getByRole('button', { name: 'Use one value' }).click()
    await expect(box(page).getByLabel('Thugs HP each')).toBeVisible()
  })

  test('a monster already in initiative takes the whole group into its place', async ({ page }) => {
    await openStudio(page)
    await insp(page).getByRole('button', { name: 'Add Thug to initiative' }).first().click()
    await expect(strip(page).locator('.bm-chip')).toHaveCount(1)
    await groupThugs(page)
    await expect(box(page)).toContainText('In initiative')
    await expect(strip(page).getByTestId('bm-group-chip')).toHaveCount(1)
    await expect(strip(page).locator('ol > li')).toHaveCount(1)
  })

  test('Ungroup restores separate slots', async ({ page }) => {
    await openStudio(page)
    await groupThugs(page)
    await box(page).getByRole('button', { name: 'Add to initiative' }).click()
    await expect(strip(page).locator('ol > li')).toHaveCount(1)
    await box(page).getByRole('button', { name: 'Ungroup' }).click()
    await expect(box(page)).toHaveCount(0)
    await expect(strip(page).getByTestId('bm-group-chip')).toHaveCount(0)
    await expect(strip(page).locator('ol > li')).toHaveCount(2)
    await expect(page.locator('.tabletop-group-ring')).toHaveCount(0)
  })

  test('Remove from initiative keeps the group as prep', async ({ page }) => {
    await openStudio(page)
    await groupThugs(page)
    await box(page).getByRole('button', { name: 'Add to initiative' }).click()
    await box(page).getByRole('button', { name: 'Remove from initiative' }).click()
    await expect(box(page)).toContainText('Prep only')
    await expect(strip(page)).toHaveCount(0)
    await expect(page.locator('.tabletop-group-ring')).toHaveCount(2)
  })

  test('a monster reduced to 0 HP leaves the group and the order; a group of one becomes a normal slot', async ({ page }) => {
    await openStudio(page)
    await groupThugs(page)
    const hp = box(page).getByLabel('Thugs HP each')
    await hp.fill('5')
    await hp.blur()
    await box(page).getByRole('button', { name: 'Add to initiative' }).click()
    await expect(strip(page).getByTestId('bm-group-chip')).toHaveCount(1)
    // Defeat the first Thug with damage from its token card.
    await insp(page).locator('.bm-row', { hasText: 'Thug' }).first().locator('.bm-row-main').click()
    await page.locator('.tabletop-quickcombat').getByLabel('Damage or heal amount').fill('5')
    await page.locator('.tabletop-quickcombat').getByRole('button', { name: 'Damage' }).click()
    // The group had two members, so it dissolves: one normal slot is left.
    await expect(box(page)).toHaveCount(0)
    await expect(strip(page).getByTestId('bm-group-chip')).toHaveCount(0)
    await expect(strip(page).locator('.bm-chip')).toHaveCount(1)
    await expect(page.locator('.tabletop-group-ring')).toHaveCount(0)
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('codex.combat')!))
    expect(saved.combatants).toHaveLength(1)
    expect(saved.combatants[0].groupKey ?? null).toBeNull()
    expect(saved.combatants[0].groupTurn ?? false).toBe(false)
  })

  test('with three members, a defeated one leaves and the group of two stays one slot', async ({ page }) => {
    await openStudio(page)
    // A third Thug, copied from the first.
    await insp(page).locator('.bm-row', { hasText: 'Thug' }).first().locator('.bm-row-main').click()
    await page.getByRole('button', { name: /^Duplicate Thug/ }).click()
    const boxes = insp(page).getByRole('checkbox', { name: /^Select Thug.* for a group/ })
    await expect(boxes).toHaveCount(3)
    for (let i = 0; i < 3; i++) await boxes.nth(i).check()
    await insp(page).getByRole('button', { name: 'Group 3 monsters' }).click()
    await expect(box(page)).toContainText('×3')
    const hp = box(page).getByLabel('Thugs HP each')
    await hp.fill('5')
    await hp.blur()
    await box(page).getByRole('button', { name: 'Add to initiative' }).click()
    await expect(strip(page).getByTestId('bm-group-chip').locator('.bm-chip')).toHaveCount(3)
    await insp(page).locator('.bm-row', { hasText: 'Thug' }).first().locator('.bm-row-main').click()
    await page.locator('.tabletop-quickcombat').getByLabel('Damage or heal amount').fill('5')
    await page.locator('.tabletop-quickcombat').getByRole('button', { name: 'Damage' }).click()
    await expect(box(page)).toContainText('×2')
    await expect(strip(page).getByTestId('bm-group-chip').locator('.bm-chip')).toHaveCount(2)
    await expect(strip(page).locator('ol > li')).toHaveCount(1)
    await expect(page.locator('.tabletop-group-ring')).toHaveCount(2)
  })

  test('the group state stays out of the live scene payload', async ({ page }) => {
    // toLiveTokens builds each token field by field; assert the source does not list the group fields.
    const src = await page.request.get('/src/pages/useDmLiveScene.ts')
    const text = await src.text()
    expect(text).not.toMatch(/groupId|groupTurn|\.groups/)
  })

  test('at phone width the group controls are touch sized', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
    await page.goto('/#/campaign/demo-campaign-0001/battlemap')
    await page.locator('.battlemap-maps .list-row').first().click()
    await page.getByRole('button', { name: 'Inspector', exact: true }).click()
    await groupThugs(page)
    for (const b of [box(page).getByRole('button', { name: 'Ungroup' }), box(page).getByRole('button', { name: 'Roll' }), box(page).getByRole('button', { name: 'Add to initiative' })]) {
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(38)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })
})
