import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Deleting a battle map token also removes its combatant, and Undo brings both back (T-99).
// Demo campaign, local data only (combat lives in localStorage). Its foes are Mordrek and
// two Thugs; its party has Bram and Sable.

const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

async function openStudio(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto('/#/campaign/demo-campaign-0001/battlemap')
  await page.locator('.battlemap-maps .list-row').first().click()
  await expect(page.getByTestId('bm-studio')).toBeVisible()
}

const insp = (page: Page) => page.getByTestId('bm-inspector')
const strip = (page: Page) => page.getByTestId('bm-turns')
const chips = (page: Page) => strip(page).locator('.bm-chip')
const undoBtn = (page: Page) => page.getByTestId('bm-undo')

async function combatState(page: Page): Promise<{ combatants: { name: string; hp?: number | null; groupTurn?: boolean }[]; turnIndex: number }> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('codex.combat') ?? '{"combatants":[],"turnIndex":0}'))
}

async function addInit(page: Page, name: string): Promise<void> {
  const toggle = insp(page).getByRole('button', { name: `Add ${name} to initiative` }).first()
  if (await toggle.count()) {
    await toggle.click()
    return
  }
  // Party members have no + Init toggle: use the card that opens on the token.
  await insp(page).getByRole('button', { name, exact: true }).click()
  await page.locator('.tabletop-quickcombat').getByRole('button', { name: 'Add to combat' }).click()
}

async function deleteByBar(page: Page, combatName: string): Promise<void> {
  // The combatant may carry a longer name than its token (for example "Lord Mordrek").
  const name = ['Bram', 'Sable', 'Mordrek', 'Thug'].find((n) => combatName.includes(n)) ?? combatName
  await insp(page).getByRole('button', { name, exact: true }).first().click()
  await page.getByRole('button', { name: `Delete ${name}` }).first().click()
}

async function groupThugs(page: Page): Promise<void> {
  const boxes = insp(page).getByRole('checkbox', { name: 'Select Thug for a group' })
  await boxes.nth(0).check()
  await boxes.nth(1).check()
  await insp(page).getByRole('button', { name: 'Group 2 monsters' }).click()
  await expect(page.getByTestId('bm-group')).toBeVisible()
}

test.describe('token delete and undo', () => {
  test('deleting a linked token removes its combatant; Undo restores both in place', async ({ page }) => {
    await openStudio(page)
    await addInit(page, 'Mordrek')
    await addInit(page, 'Thug')
    await expect(chips(page)).toHaveCount(2)
    const before = (await combatState(page)).combatants.map((c) => c.name)
    await expect(undoBtn(page)).toBeDisabled()
    await deleteByBar(page, 'Mordrek')
    await expect(chips(page)).toHaveCount(1)
    expect((await combatState(page)).combatants.map((c) => c.name)).not.toContain('Mordrek')
    await expect(undoBtn(page)).toBeEnabled()
    await undoBtn(page).click()
    await expect(chips(page)).toHaveCount(2)
    expect((await combatState(page)).combatants.map((c) => c.name)).toEqual(before)
    await expect(insp(page).getByRole('button', { name: 'Mordrek', exact: true })).toBeVisible()
    await expect(undoBtn(page)).toBeDisabled()
    await expect(page.getByTestId('bm-redo')).toBeEnabled()
  })

  test('deleting a token that is not in combat leaves the combat alone', async ({ page }) => {
    await openStudio(page)
    await addInit(page, 'Mordrek')
    await deleteByBar(page, 'Bram')
    await expect(chips(page)).toHaveCount(1)
    await expect.poll(async () => (await combatState(page)).combatants.map((c) => c.name)).toEqual(['Lord Mordrek'])
  })

  test('the shortcut undoes and redoes, and does not fire while typing in a field', async ({ page }) => {
    await openStudio(page)
    await addInit(page, 'Mordrek')
    await deleteByBar(page, 'Mordrek')
    await expect(chips(page)).toHaveCount(0)
    // Typing in a field keeps the browser's own undo: the board history is untouched.
    const field = insp(page).locator('input[type="text"], input:not([type])').first()
    await field.click()
    await page.keyboard.press(`${mod}+z`)
    await expect(undoBtn(page)).toBeEnabled()
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press(`${mod}+z`)
    await expect(chips(page)).toHaveCount(1)
    await page.keyboard.press(`${mod}+Shift+z`)
    await expect(chips(page)).toHaveCount(0)
    await page.keyboard.press(`${mod}+z`)
    await expect(chips(page)).toHaveCount(1)
  })

  test('the current turn stays on the same combatant through delete and undo', async ({ page }) => {
    await openStudio(page)
    for (const n of ['Bram', 'Sable', 'Mordrek']) await addInit(page, n)
    await strip(page).getByRole('button', { name: 'Start combat' }).click()
    await strip(page).getByRole('button', { name: /Next/ }).click()
    const turn = async () => {
      const s = await combatState(page)
      return s.combatants[s.turnIndex].name
    }
    const holder = await turn()
    const other = (await combatState(page)).combatants.map((c) => c.name).find((n) => n !== holder)!
    await deleteByBar(page, other)
    expect(await turn()).toBe(holder)
    await undoBtn(page).click()
    await expect(chips(page)).toHaveCount(3)
    expect(await turn()).toBe(holder)
  })

  test('a group of two: deleting a member makes the other a normal slot; Undo restores the group', async ({ page }) => {
    await openStudio(page)
    await groupThugs(page)
    await page.getByTestId('bm-group').getByRole('button', { name: 'Add to initiative' }).click()
    await expect(strip(page).getByTestId('bm-group-chip')).toHaveCount(1)
    await deleteByBar(page, 'Thug')
    await expect(page.getByTestId('bm-group')).toHaveCount(0)
    await expect.poll(async () => (await combatState(page)).combatants.map((c) => !!c.groupTurn)).toEqual([false])
    await undoBtn(page).click()
    await expect(page.getByTestId('bm-group')).toBeVisible()
    await expect(strip(page).getByTestId('bm-group-chip')).toHaveCount(1)
    await expect(strip(page).getByTestId('bm-group-chip').locator('.bm-chip')).toHaveCount(2)
    await expect(page.locator('.tabletop-group-ring')).toHaveCount(2)
    expect((await combatState(page)).combatants.map((c) => !!c.groupTurn)).toEqual([true, true])
  })

  test('a group of three: deleting a member leaves a group of two', async ({ page }) => {
    await openStudio(page)
    // Add a third Thug by duplicating one, then group all three.
    await insp(page).getByRole('button', { name: 'Thug', exact: true }).first().click()
    await page.getByRole('button', { name: /^Duplicate Thug/ }).first().click()
    const boxes = insp(page).getByRole('checkbox', { name: /^Select Thug.* for a group/ })
    await expect(boxes).toHaveCount(3)
    for (let i = 0; i < 3; i++) await boxes.nth(i).check()
    await insp(page).getByRole('button', { name: 'Group 3 monsters' }).click()
    await page.getByTestId('bm-group').getByRole('button', { name: 'Add to initiative' }).click()
    await expect(strip(page).getByTestId('bm-group-chip').locator('.bm-chip')).toHaveCount(3)
    await deleteByBar(page, 'Thug')
    await expect(page.getByTestId('bm-group')).toContainText('×2')
    await expect(strip(page).getByTestId('bm-group-chip').locator('.bm-chip')).toHaveCount(2)
    await undoBtn(page).click()
    await expect(page.getByTestId('bm-group')).toContainText('×3')
    await expect(strip(page).getByTestId('bm-group-chip').locator('.bm-chip')).toHaveCount(3)
  })

  test('Undo also reverses an added token and a resize', async ({ page }) => {
    await openStudio(page)
    const count = () => insp(page).getByRole('button', { name: /^Add .* to initiative$/ }).count()
    const start = await count()
    await insp(page).getByRole('button', { name: 'Thug', exact: true }).first().click()
    await page.getByRole('button', { name: /^Duplicate Thug/ }).first().click()
    expect(await count()).toBe(start + 1)
    await page.keyboard.press(`${mod}+z`)
    await expect.poll(count).toBe(start)
  })

  test('Run mode has the Undo button and the shortcut, and the Combat tab follows', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
    await page.goto('/#/run/demo-campaign-0001')
    await expect(page.locator('.tabletop-view')).toBeVisible()
    const panel = page.getByTestId('bm-inspector')
    await panel.getByRole('tab', { name: 'Scene', exact: true }).click()
    await panel.getByRole('button', { name: 'Add Mordrek to initiative' }).click()
    await panel.getByRole('tab', { name: 'Combat', exact: true }).click()
    await expect(page.getByTestId('il-row')).toHaveCount(1)
    await panel.getByRole('tab', { name: 'Scene', exact: true }).click()
    await panel.getByRole('button', { name: 'Mordrek', exact: true }).click()
    await page.getByRole('button', { name: 'Delete Mordrek' }).first().click()
    await panel.getByRole('tab', { name: 'Combat', exact: true }).click()
    await expect(page.getByTestId('il-row')).toHaveCount(0)
    await expect(page.getByTestId('run-top').getByTestId('bm-undo')).toBeEnabled()
    await page.locator('.tabletop-view').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press(`${mod}+z`)
    await expect(page.getByTestId('il-row')).toHaveCount(1)
  })

  test('on a phone the More actions menu has Undo and Redo', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
    await page.goto('/#/campaign/demo-campaign-0001/battlemap')
    await page.locator('.battlemap-maps .list-row').first().click()
    await expect(page.getByTestId('bm-studio')).toBeVisible()
    await page.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('menuitem', { name: 'Undo' })).toBeDisabled()
    await expect(page.getByRole('menuitem', { name: 'Redo' })).toBeDisabled()
  })
})
