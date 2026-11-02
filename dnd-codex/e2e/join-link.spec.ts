import { test, expect } from './fixtures'

// The Cancel button and the pull-back to the join prompt need a signed-in user,
// which needs a live backend, so they are checked by hand (T-57). This covers
// what runs without one: a signed-out visitor can open an invite link and then
// leave it for another page.

test.describe('join link, signed out', () => {
  test('shows the sign-in invite and lets the visitor leave', async ({ page }) => {
    await page.goto('/#/join/ABCD1234')
    await expect(page.getByRole('heading', { name: /invited to a campaign/i })).toBeVisible()

    await page.goto('/#/')
    await expect(page).toHaveURL(/#\/$/)
    await expect(page.getByRole('heading', { name: /invited to a campaign/i })).toHaveCount(0)
  })
})
