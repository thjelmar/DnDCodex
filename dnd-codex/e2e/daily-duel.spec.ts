import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

// Daily Duel (T-63, T-65): public, local-only, hidden in the demo. Reduced
// motion is on so each replayed roll takes tens of milliseconds, not seconds.

test.use({ reducedMotion: 'reduce' })

/** Plays the duel to its end: roll the d20 when asked, otherwise use the first move that is enabled. */
async function playToEnd(page: Page) {
  const result = page.getByRole('button', { name: 'Copy result and challenge link' })
  const roll = page.getByRole('button', { name: 'Roll the d20' })
  const moves = page.locator('.duel-move:not(:disabled)')
  for (let i = 0; i < 800 && !(await result.isVisible()); i++) {
    if (await roll.isVisible()) await roll.click()
    else if ((await moves.count()) > 0) await moves.first().click()
    await page.waitForTimeout(40)
  }
  await expect(result).toBeVisible()
}

test.describe('daily duel', () => {
  test('a foe lean from the tally picks a foe-favoring twist and is explained', async ({ page }) => {
    await page.route(/\/rpc\/get_duel_lean/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '"foe"' }))
    let recorded: Record<string, unknown> | null = null
    await page.route(/\/rpc\/record_duel_result/, (route) => {
      recorded = route.request().postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'true' })
    })
    await page.goto('/#/daily')
    await expect(page.getByText(/too easy, so today’s twist favors the foe/)).toBeVisible()
    await page.getByRole('button', { name: 'Roll initiative' }).click()
    await expect(page.locator('.duel-twist')).toContainText('this twist favors the foe')
    await playToEnd(page)
    await expect.poll(() => recorded).not.toBeNull()
    expect(Object.keys(recorded!).sort()).toEqual(
      ['p_day', 'p_device_id', 'p_foe_id', 'p_hero_id', 'p_outcome', 'p_rounds', 'p_tier', 'p_twist_id'])
  })

  test('a challenge link shows the friend’s score, and bad codes are ignored', async ({ page }) => {
    await page.goto('/#/daily?beat=2026-11-04.w.5.23')
    await expect(page.getByText('A friend challenged you.')).toBeVisible()
    await expect(page.getByText('They won in 5 rounds with 23 HP left.')).toBeVisible()
    await page.goto('/#/daily?beat=nonsense')
    await expect(page.getByRole('heading', { name: 'Daily Duel' })).toBeVisible()
    await expect(page.getByText('A friend challenged you.')).toHaveCount(0)
  })

  test('when every copy method is blocked, the result shows in a selectable box (T-120)', async ({ page }) => {
    // Mimics an in-app WebView: the Clipboard API rejects, execCommand refuses, no share sheet, prompt() is silent.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) }, configurable: true })
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
      document.execCommand = () => false
      window.prompt = () => null
    })
    await page.goto('/#/daily')
    await page.getByRole('button', { name: 'Roll initiative' }).click()
    await playToEnd(page)
    await page.getByRole('button', { name: 'Copy result and challenge link' }).click()
    const box = page.getByTestId('duel-share-text')
    await expect(box).toBeVisible()
    await expect(box).toHaveValue(/#\/daily\?beat=/)
  })

  test('the legacy copy fallback works when the Clipboard API is missing (T-120)', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
      ;(window as unknown as { __copied: string }).__copied = ''
      document.execCommand = (cmd: string) => {
        if (cmd === 'copy') (window as unknown as { __copied: string }).__copied = (document.activeElement as HTMLTextAreaElement).value
        return true
      }
    })
    await page.goto('/#/daily')
    await page.getByRole('button', { name: 'Roll initiative' }).click()
    await playToEnd(page)
    await page.getByRole('button', { name: 'Copy result and challenge link' }).click()
    await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __copied: string }).__copied)).toMatch(/#\/daily\?beat=/)
  })

  test('copied result includes a challenge link that opens the banner', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebKit has no clipboard-write permission to grant')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/#/daily')
    await page.getByRole('button', { name: 'Roll initiative' }).click()
    await playToEnd(page)
    await page.getByRole('button', { name: 'Copy result and challenge link' }).click()
    const text = await page.evaluate('navigator.clipboard.readText()') as string
    const link = /(https?:\/\/\S+#\/daily\?beat=\S+)/.exec(text)?.[1]
    expect(link, 'the copied text must carry a challenge link').toBeTruthy()
    expect(text).toMatch(/Twist: /)
    expect(text).toMatch(/^R1  You .+ Foe /m) // one labeled line per round (T-122)
    expect(text).not.toContain('(you)') // the legend stays on the page, out of the pasted text
    await expect(page.getByText('⬛ miss (you)')).toBeVisible()
    await page.goto(link as string)
    await expect(page.getByText('A friend challenged you.')).toBeVisible()
  })

  test('plays to a result, resumes after a reload, and calls only the tally RPCs', async ({ page, supabaseRequests }) => {
    const errors: string[] = []
    // Failed-resource noise comes from the aborted tally calls.
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()) })
    await page.goto('/#/daily')
    await expect(page.getByRole('heading', { name: 'Daily Duel' })).toBeVisible()
    await expect(page.getByText(/Today’s twist:/)).toBeVisible()
    await page.getByRole('button', { name: 'Roll initiative' }).click()

    await playToEnd(page)
    const result = page.getByRole('button', { name: 'Copy result and challenge link' })
    await expect(page.getByText(/D&D Codex Daily Duel \d{4}-\d{2}-\d{2}/)).toBeVisible()
    await expect(page.getByText(/\((Easy|Standard|Hard)\)/).first()).toBeVisible()

    // It also lands in the battle history, once per day.
    await expect(page.getByRole('heading', { name: 'Battle history' })).toBeVisible()
    await expect(page.getByText(/1 played · [01] won/)).toBeVisible()
    await expect(page.getByText(/Sign in to keep it across your devices/)).toBeVisible()

    // The finished duel is saved: a reload shows the result, not a new duel.
    await page.reload()
    await expect(page.getByRole('button', { name: 'Copy result and challenge link' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Roll initiative' })).toHaveCount(0)
    await expect(page.getByText(/1 played · [01] won/)).toBeVisible()
    // The tally may call only these two RPCs (both abort here, and the game still works).
    for (const u of supabaseRequests) expect(u).toMatch(/\/rpc\/(get_duel_lean|record_duel_result)/)
    expect(errors, 'no console errors during a full duel').toEqual([])
    await expect(result).toBeVisible()
  })

  test('shows the foe’s next move and the day’s twist before you act', async ({ page }) => {
    await page.goto('/#/daily')
    await page.getByRole('button', { name: 'Roll initiative' }).click()
    await expect(page.locator('.duel-twist')).toContainText('Today’s twist')
    await expect(page.locator('.duel-intent')).toContainText('next move')
    await expect(page.locator('.duel-intent')).toContainText(/% to hit you/)
    // Dodge, the signature move and End turn are always on the board.
    await expect(page.getByRole('button', { name: /^Dodge/ })).toBeVisible()
    await expect(page.locator('.duel-move.signature')).toContainText(/once/)
    await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible()
  })

  test('an attack waits for you to tap the d20', async ({ page }) => {
    await page.goto('/#/daily')
    await page.getByRole('button', { name: 'Roll initiative' }).click()
    const attack = page.locator('.duel-move:not(:disabled)').first()
    await expect(attack).toBeVisible()
    const logBefore = await page.locator('.card', { hasText: 'Battle log' }).innerText()
    await attack.click()
    const roll = page.getByRole('button', { name: 'Roll the d20' })
    await expect(roll).toBeVisible()
    await expect(page.getByText(/Tap the d20 to roll/)).toBeVisible()
    // Nothing was rolled yet, so the log has not changed.
    expect(await page.locator('.card', { hasText: 'Battle log' }).innerText()).toBe(logBefore)
    await roll.click()
    await expect(page.locator('.duel-die[data-sides="20"]').first()).toBeVisible()
    await expect(page.locator('.card', { hasText: 'Battle log' })).toContainText(/d20 \d+/)
  })

  test('Dodge shows a chip and logs the stance', async ({ page }) => {
    await page.goto('/#/daily')
    await page.getByRole('button', { name: 'Roll initiative' }).click()
    const dodge = page.getByRole('button', { name: /^Dodge/ })
    await expect(dodge).toBeEnabled()
    await dodge.click()
    await expect(page.locator('.duel-chip', { hasText: 'Dodging' })).toBeVisible()
    await expect(page.locator('.duel-intent')).toContainText('(dodging)')
    await expect(page.locator('.card', { hasText: 'Battle log' })).toContainText('takes the Dodge action')
  })

  test('the signature move works once', async ({ page }) => {
    await page.goto('/#/daily')
    await page.getByRole('button', { name: 'Roll initiative' }).click()
    const sig = page.locator('.duel-move.signature')
    // Some signature moves need a spent action first (Action Surge), so spend it.
    if (await sig.isDisabled()) {
      await page.locator('.duel-move:not(:disabled)').first().click()
      const roll = page.getByRole('button', { name: 'Roll the d20' })
      for (let i = 0; i < 6 && (await sig.isDisabled()); i++) {
        if (await roll.isVisible()) await roll.click()
        await page.waitForTimeout(80)
      }
    }
    if (await sig.isEnabled()) {
      await sig.click()
      await expect(sig).toBeDisabled()
      await expect(sig).toContainText('used')
    }
  })

  test('on a wide screen the next move and battle log sit on the right, and the log collapses', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 })
    await page.goto('/#/daily')
    await page.getByRole('button', { name: 'Roll initiative' }).click()
    await expect(page.locator('.duel-intent')).toBeVisible()
    const arena = (await page.locator('.duel-arena').boundingBox())!
    const intent = (await page.locator('.duel-intent').boundingBox())!
    const log = (await page.locator('.duel-log').boundingBox())!
    expect(intent.x).toBeGreaterThanOrEqual(arena.x + arena.width - 1)
    expect(log.x).toBeGreaterThanOrEqual(arena.x + arena.width - 1)
    expect(log.y).toBeGreaterThan(intent.y)
    // The moves fit on screen without scrolling.
    const end = (await page.getByRole('button', { name: 'End turn' }).boundingBox())!
    expect(end.y + end.height).toBeLessThanOrEqual(800)

    // The log collapses, and the choice is remembered after a reload.
    const head = page.getByRole('button', { name: /Battle log/ })
    await expect(page.locator('#duel-log-body')).toBeVisible()
    await head.click()
    await expect(head).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#duel-log-body')).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('button', { name: /Battle log/ })).toHaveAttribute('aria-expanded', 'false')
    await page.getByRole('button', { name: /Battle log/ }).click()
    await expect(page.locator('#duel-log-body')).toBeVisible()
  })

  test('on a narrow screen the next move comes before the moves, and a roll does not scroll the page', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 })
    await page.goto('/#/daily')
    await page.getByRole('button', { name: 'Roll initiative' }).click()
    const intent = (await page.locator('.duel-intent').boundingBox())!
    const tray = (await page.locator('.duel-tray').boundingBox())!
    expect(intent.y).toBeLessThan(tray.y)
    await page.locator('main').evaluate((el) => { el.scrollTop = 200 })
    const before = await page.locator('main').evaluate((el) => el.scrollTop)
    const attack = page.locator('.duel-move:not(:disabled)').first()
    await expect(attack).toBeVisible()
    await attack.click()
    await page.getByRole('button', { name: 'Roll the d20' }).click()
    await expect(page.locator('.duel-log-body')).toContainText(/d20 \d+/)
    expect(await page.locator('main').evaluate((el) => el.scrollTop)).toBe(before)
  })

  test('fits a phone screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/#/daily')
    await page.getByRole('button', { name: 'Roll initiative' }).click()
    await expect(page.locator('.duel-arena')).toBeVisible()
    const overflow = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth') as number
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('is hidden in the demo', async ({ page }) => {
    await page.goto('/#/')
    await expect(page.getByRole('link', { name: 'Daily Duel' })).toBeVisible()
    await page.getByRole('button', { name: 'Try the live demo' }).click()
    await expect(page.locator('.demo-banner')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Daily Duel' })).toHaveCount(0)
    await page.evaluate('location.hash = "#/daily"')
    await expect(page).toHaveURL(/#\/$/)
  })
})
