import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Battle map turn order strip and turn pulse (T-95, phase 3). The strip reads the shared
// combat tracker state. Runs on the demo campaign (local data only).

async function openStudio(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto('/#/campaign/demo-campaign-0001/battlemap')
  await page.locator('.battlemap-maps .list-row').first().click()
  await expect(page.getByTestId('bm-studio')).toBeVisible()
}

/** Put three tokens into the combat tracker through each token's card. */
async function addToCombat(page: Page, names: string[]): Promise<void> {
  for (const name of names) {
    await page.getByTestId('bm-inspector').getByRole('button', { name, exact: true }).click()
    await page.locator('.tabletop-quickcombat').getByRole('button', { name: 'Add to combat' }).click()
  }
}

const strip = (page: Page) => page.getByTestId('bm-turns')
const roundText = (page: Page) => strip(page).locator('.bm-turns-round')

test.describe('turn order strip', () => {
  test('no strip until something is in combat', async ({ page }) => {
    await openStudio(page)
    await expect(strip(page)).toHaveCount(0)
  })

  test('shows the round, whose turn it is and a Next button that wraps into the next round', async ({ page }) => {
    await openStudio(page)
    await addToCombat(page, ['Bram', 'Sable', 'Mordrek'])
    await expect(strip(page).getByRole('button', { name: 'Start combat' })).toBeVisible()
    await expect(strip(page).locator('.bm-chip')).toHaveCount(3)
    await strip(page).getByRole('button', { name: 'Start combat' }).click()
    await expect(roundText(page)).toContainText('Round 1')
    const order = await strip(page).locator('.bm-chip').evaluateAll((els) => els.map((e) => e.getAttribute('title')!.replace(/ \(initiative.*/, '')))
    const turnOf = (n: string) => new RegExp(`^${n}'s turn$`)
    await expect(roundText(page).locator('small')).toHaveText(turnOf(order[0]))
    await strip(page).getByRole('button', { name: /Next/ }).click()
    await expect(roundText(page).locator('small')).toHaveText(turnOf(order[1]))
    // Key N is the same as the button.
    await page.keyboard.press('n')
    await expect(roundText(page).locator('small')).toHaveText(turnOf(order[2]))
    await page.keyboard.press('n')
    await expect(roundText(page)).toContainText('Round 2')
    await expect(roundText(page).locator('small')).toHaveText(turnOf(order[0]))
  })

  test('the current turn pulses on the map and in the strip; reduced motion gives a static ring', async ({ page }) => {
    await openStudio(page)
    await addToCombat(page, ['Bram', 'Sable'])
    await strip(page).getByRole('button', { name: 'Start combat' }).click()
    const halo = page.locator('.tabletop-turn-halo')
    const chip = strip(page).locator('.bm-chip.turn')
    await expect(halo).toHaveCount(1)
    await expect(chip).toHaveCount(1)
    const anim = (l: ReturnType<Page['locator']>) => l.evaluate((el) => { const s = getComputedStyle(el); return [s.animationName, s.animationDuration] })
    expect(await anim(halo)).toEqual(['bm-turn-halo', '1.8s'])
    expect(await anim(chip)).toEqual(['bm-chip-pulse', '1.8s'])
    // Driven by the accent token, never a hard-coded color.
    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
    expect(await halo.evaluate((el) => getComputedStyle(el).stroke)).toBe(await page.evaluate((a) => { const d = document.createElement('i'); d.style.color = a; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c }, accent))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect((await anim(halo))[0]).toBe('none')
    expect((await anim(chip))[0]).toBe('none')
    expect(await halo.evaluate((el) => getComputedStyle(el).opacity)).not.toBe('0')
  })

  test('Run mode and the strip share one combat', async ({ page }) => {
    await openStudio(page)
    await addToCombat(page, ['Bram', 'Sable'])
    await strip(page).getByRole('button', { name: 'Start combat' }).click()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('codex.combat')!))
    expect(saved.active).toBe(true)
    expect(saved.combatants).toHaveLength(2)
    expect(saved.round).toBe(1)
  })
})
