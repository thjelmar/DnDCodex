import { test, expect } from './fixtures'

// Daily Duel (T-63): public, local-only, hidden in the demo.

test.describe('daily duel', () => {
  test('plays to a result, resumes after a reload, and never calls Supabase', async ({ page, supabaseRequests }) => {
    await page.goto('/#/daily')
    await expect(page.getByRole('heading', { name: 'Daily Duel' })).toBeVisible()
    await page.getByRole('button', { name: 'Roll initiative' }).click()

    // Keep attacking until the duel ends (a hard cap guards against a hang).
    const result = page.getByRole('button', { name: 'Copy result' })
    for (let i = 0; i < 80 && !(await result.isVisible()); i++) {
      const attack = page.locator('.card button.btn.primary').first()
      await attack.click()
    }
    await expect(result).toBeVisible()
    await expect(page.getByText(/D&D Codex Daily Duel \d{4}-\d{2}-\d{2}/)).toBeVisible()

    // The finished duel is saved: a reload shows the result, not a new duel.
    await page.reload()
    await expect(page.getByRole('button', { name: 'Copy result' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Roll initiative' })).toHaveCount(0)
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
