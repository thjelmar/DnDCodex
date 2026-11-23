import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Run mode, phase 3 (T-98): the run timer, the quick dice bar, and the panel's float and own-window
// modes. Demo campaign, local data only (the timer and dice live in localStorage).

async function openRun(page: Page, size = { width: 1440, height: 900 }): Promise<void> {
  await page.setViewportSize(size)
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto('/#/run/demo-campaign-0001')
  await expect(page.locator('.tabletop-view')).toBeVisible()
}
const panel = (page: Page) => page.getByTestId('bm-inspector')
const timerKey = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith('codex.runTimer.')) ?? null)

test.describe('run timer', () => {
  test('starts on a button press, pauses, resumes, and survives a reload', async ({ page }) => {
    await openRun(page)
    await expect(page.getByTestId('run-timer')).toHaveCount(0)
    expect(await timerKey(page)).toBeNull()
    await page.getByRole('button', { name: 'Start timer' }).click()
    const value = page.getByTestId('run-timer-value')
    await expect(value).toHaveText('00:00:00')
    await expect(value).not.toHaveText('00:00:00', { timeout: 5000 })
    await page.getByRole('button', { name: 'Pause timer' }).click()
    const paused = (await value.textContent())!
    await page.waitForTimeout(1300)
    await expect(value).toHaveText(paused)
    await page.reload()
    await expect(page.getByTestId('run-timer-value')).toHaveText(paused)
    await expect(page.getByRole('button', { name: 'Resume timer' })).toBeVisible()
    await page.getByRole('button', { name: 'Resume timer' }).click()
    await expect(page.getByRole('button', { name: 'Pause timer' })).toBeVisible()
  })

  test('leaving Run mode pauses it, and it is stored on this device only', async ({ page, supabaseRequests }) => {
    await openRun(page)
    await page.getByRole('button', { name: 'Start timer' }).click()
    await expect(page.getByRole('button', { name: 'Pause timer' })).toBeVisible()
    const key = (await timerKey(page))!
    expect(key).toMatch(/^codex\.runTimer\./)
    await page.getByRole('link', { name: 'Exit run mode' }).click()
    await expect(page.locator('.tabletop-view')).toHaveCount(0)
    await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).since, key)).toBeNull()
    expect(supabaseRequests).toEqual([])
  })

  test('a timer left running and last seen long ago comes back paused at that moment', async ({ page }) => {
    await openRun(page)
    await page.getByRole('button', { name: 'Start timer' }).click()
    const key = (await timerKey(page))!
    await page.evaluate((k) => {
      const now = Date.now()
      // One minute banked, then a run from 20 minutes ago that was last seen 15 minutes ago (5 minutes of it).
      localStorage.setItem(k, JSON.stringify({ ms: 60_000, since: now - 20 * 60_000, seen: now - 15 * 60_000 }))
    }, key)
    await page.reload()
    await expect(page.getByTestId('run-timer-value')).toHaveText('00:06:00')
    await expect(page.getByRole('button', { name: 'Resume timer' })).toBeVisible()
  })

  test('Reset asks first, then clears the timer', async ({ page }) => {
    await openRun(page)
    await page.getByRole('button', { name: 'Start timer' }).click()
    await page.getByRole('button', { name: 'Timer options' }).click()
    await page.getByRole('menuitem', { name: 'Reset timer' }).click()
    await page.getByRole('button', { name: 'Reset timer', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Start timer' })).toBeVisible()
    expect(await timerKey(page)).toBeNull()
  })
})

test.describe('dice bar', () => {
  test('rolls a die, shares the log with the Dice tab, and hides while that tab is open', async ({ page }) => {
    await openRun(page)
    const bar = page.getByTestId('dice-bar')
    await expect(bar).toBeVisible()
    await bar.getByRole('button', { name: 'Roll d20' }).click()
    const total = (await bar.getByTestId('dice-bar-total').textContent())!
    expect(Number(total)).toBeGreaterThanOrEqual(1)
    await panel(page).getByRole('tab', { name: 'Dice' }).click()
    await expect(page.getByTestId('dice-bar')).toHaveCount(0)
    await expect(panel(page).locator('.dice-latest')).toContainText(total)
    await panel(page).getByRole('tab', { name: 'Combat' }).click()
    await expect(page.getByTestId('dice-bar')).toBeVisible()
  })

  test('a formula rolls, and Roll is off until there is one', async ({ page }) => {
    await openRun(page)
    const bar = page.getByTestId('dice-bar')
    await expect(bar.getByRole('button', { name: 'Roll', exact: true })).toBeDisabled()
    await bar.getByLabel('Roll formula').fill('2d6+3')
    await bar.getByLabel('Roll formula').press('Enter')
    const total = Number(await bar.getByTestId('dice-bar-total').textContent())
    expect(total).toBeGreaterThanOrEqual(5)
    expect(total).toBeLessThanOrEqual(15)
  })

  test('collapses to a chip with the button or the D key, and remembers it', async ({ page }) => {
    await openRun(page)
    await page.getByRole('button', { name: 'Hide the dice bar' }).click()
    await expect(page.getByTestId('dice-bar')).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Show the dice bar' })).toBeVisible()
    await page.keyboard.press('d')
    await expect(page.getByTestId('dice-bar')).toBeVisible()
    await page.keyboard.press('d')
    await expect(page.getByTestId('dice-bar')).toHaveCount(0)
    await page.getByRole('button', { name: 'Show the dice bar' }).click()
    await expect(page.getByTestId('dice-bar')).toBeVisible()
  })
})

test.describe('panel pop-out', () => {
  test('the panel floats over the map and docks again', async ({ page }) => {
    await openRun(page)
    await panel(page).getByRole('button', { name: 'Float the panel over the map' }).click()
    await expect(panel(page)).toHaveClass(/bm-insp-float/)
    await panel(page).getByRole('button', { name: 'Dock the panel' }).click()
    await expect(panel(page)).toHaveClass(/bm-insp-docked/)
  })

  test('the panel opens in a popup that shares state, and docks when it closes', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'The popup path is covered in Chromium; WebKit blocks it in automation.')
    await page.addInitScript(() => delete (window as unknown as Record<string, unknown>).documentPictureInPicture)
    await openRun(page)
    const popupPromise = page.waitForEvent('popup')
    await panel(page).getByRole('button', { name: 'Open the panel in its own window' }).click()
    const popup = await popupPromise
    await expect(popup.getByTestId('bm-inspector')).toBeVisible()
    await expect(popup.getByRole('tab', { name: 'Combat' })).toBeVisible()
    await expect(page.getByTestId('bm-inspector-stub')).toContainText('The panel is in its own window')
    await popup.getByRole('tab', { name: 'Notes' }).click()
    await expect(popup.getByTestId('bm-inspector')).toContainText('Autosaves as you type')
    await popup.close()
    await expect(page.getByTestId('bm-inspector-stub')).toHaveCount(0)
    await expect(panel(page)).toHaveClass(/bm-insp-docked/)
  })
})

test('the top bar, timer included, fits a 1024px tablet without sideways scrolling', async ({ page }) => {
  await openRun(page, { width: 1024, height: 768 })
  await page.getByRole('button', { name: 'Start timer' }).click()
  const r = await page.evaluate(() => {
    const top = document.querySelector('.bm-top')!
    const kids = Array.from(top.querySelectorAll(":scope > *")).map((e) => e.getBoundingClientRect().right)
    return { sw: top.scrollWidth, cw: top.clientWidth, maxRight: Math.max(...kids), vw: innerWidth }
  })
  expect(r.sw).toBeLessThanOrEqual(r.cw)
  expect(r.maxRight).toBeLessThanOrEqual(r.vw)
})
