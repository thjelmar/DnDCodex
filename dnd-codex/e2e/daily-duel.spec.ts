import { test, expect } from './fixtures'

// Daily Duel (T-63): public, local-only, hidden in the demo.

test.describe('daily duel', () => {
  test('a challenge link shows the friend’s score, and bad codes are ignored', async ({ page }) => {
    await page.goto('/#/daily?beat=2026-11-04.w.5.23')
    await expect(page.getByText('A friend challenged you.')).toBeVisible()
    await expect(page.getByText('They won in 5 rounds with 23 HP left.')).toBeVisible()
    await page.goto('/#/daily?beat=nonsense')
    await expect(page.getByRole('heading', { name: 'Daily Duel' })).toBeVisible()
    await expect(page.getByText('A friend challenged you.')).toHaveCount(0)
  })

  test('copied result includes a challenge link that opens the banner', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/#/daily')
    await page.getByRole('button', { name: 'Roll initiative' }).click()
    const result = page.getByRole('button', { name: 'Copy result and challenge link' })
    for (let i = 0; i < 80 && !(await result.isVisible()); i++) {
      await page.locator('.card button.btn.primary').first().click()
    }
    await result.click()
    const text = await page.evaluate('navigator.clipboard.readText()') as string
    const link = /(https?:\/\/\S+#\/daily\?beat=\S+)/.exec(text)?.[1]
    expect(link, 'the copied text must carry a challenge link').toBeTruthy()
    await page.goto(link as string)
    await expect(page.getByText('A friend challenged you.')).toBeVisible()
  })

  test('plays to a result, resumes after a reload, and never calls Supabase', async ({ page, supabaseRequests }) => {
    await page.goto('/#/daily')
    await expect(page.getByRole('heading', { name: 'Daily Duel' })).toBeVisible()
    await page.getByRole('button', { name: 'Roll initiative' }).click()

    // Keep attacking until the duel ends (a hard cap guards against a hang).
    const result = page.getByRole('button', { name: 'Copy result and challenge link' })
    for (let i = 0; i < 80 && !(await result.isVisible()); i++) {
      const attack = page.locator('.card button.btn.primary').first()
      await attack.click()
    }
    await expect(result).toBeVisible()
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
    expect(supabaseRequests).toEqual([])
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
