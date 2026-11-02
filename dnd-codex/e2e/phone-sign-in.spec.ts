import { test, expect } from './fixtures'

// T-61: a signed-out visitor on a phone must be able to reach Sign in without
// hunting through the nav drawer. The top bar carries a Sign in button, and
// tapping it opens the sign-in dialog. The backend is the unreachable
// placeholder, so this also covers an auth lookup that never answers.

test.use({ viewport: { width: 390, height: 844 } })

async function expectTopbarSignIn(page: import('@playwright/test').Page) {
  const signIn = page.locator('.topbar').getByRole('button', { name: 'Sign in' })
  await expect(signIn).toBeVisible()
  const box = await signIn.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await signIn.click()
  await expect(page.getByRole('button', { name: /Continue with Discord/i })).toBeVisible()
}

test.describe('sign in at phone width, signed out', () => {
  test('home page', async ({ page }) => {
    await page.goto('/#/')
    await expectTopbarSignIn(page)
  })

  test('campaign page', async ({ page }) => {
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Start a campaign' }).click()
    await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Phone ${Date.now()}`)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
    await expectTopbarSignIn(page)
  })

  test('sign in dialog from the drawer is not clipped by it', async ({ page }) => {
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Open menu' }).click()
    await page.locator('.sidebar').getByRole('button', { name: 'Sign in' }).click()
    const dialog = page.getByRole('dialog', { name: 'Sign in' })
    await expect(dialog).toBeVisible()
    await expect
      .poll(async () => {
        const b = await dialog.boundingBox()
        return !!b && b.x >= 0 && b.x + b.width <= 390
      })
      .toBe(true)
    // Rendered under <body>, not inside the drawer.
    expect(await dialog.evaluate((el) => !!el.closest('.sidebar'))).toBe(false)
  })

  test('drawer cannot scroll sideways', async ({ page }) => {
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Open menu' }).click()
    const overflowX = await page.locator('.sidebar').evaluate((el) => getComputedStyle(el).overflowX)
    expect(overflowX).toBe('hidden')
  })

  test('drawer still lists sign in', async ({ page }) => {
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Open menu' }).click()
    await expect(page.locator('.sidebar').getByRole('button', { name: 'Sign in' })).toBeVisible()
  })
})
