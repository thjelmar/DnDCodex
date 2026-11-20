import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// The campaign Overview as a 12-column dashboard (T-69): wide on desktop with a
// main column and a right column, one stack with collapsible panels on a phone,
// and archive/delete behind a "Campaign settings" button. Local-first, no backend.

async function createCampaign(page: Page): Promise<void> {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start a campaign' }).click()
  await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Overview ${Date.now()}`)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
  await expect(page.locator('.ov-hero')).toBeVisible()
}

test.describe('campaign Overview (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('is wider than the reading column and splits into main and side columns', async ({ page }) => {
    await createCampaign(page)
    const content = await page.locator('.content.content-overview').boundingBox()
    expect(content!.width).toBeGreaterThan(1000)

    const main = await page.locator('.ov-main').boundingBox()
    const side = await page.locator('.ov-side').boundingBox()
    expect(side!.x).toBeGreaterThan(main!.x + main!.width - 1)
    // Main takes about two thirds (8 of 12 columns), side about one third.
    expect(main!.width).toBeGreaterThan(side!.width * 1.6)

    // World overview and Recent sessions are in the main column; Links, Voice and
    // Linked campaigns are in the right column.
    for (const t of ['World overview', 'Recent sessions']) {
      await expect(page.locator('.ov-main').getByRole('heading', { name: t })).toBeVisible()
    }
    for (const t of ['Links', 'Voice', 'Linked campaigns']) {
      await expect(page.locator('.ov-side').getByRole('heading', { name: t })).toBeVisible()
    }
    // Wide screens show every panel open.
    await expect(page.locator('.ov-side').getByRole('button', { name: 'Links' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  test('archive and delete live behind Campaign settings', async ({ page }) => {
    await createCampaign(page)
    await expect(page.getByRole('button', { name: 'Delete campaign' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Campaign settings' }).click()
    const settings = page.getByRole('dialog', { name: 'Campaign settings' })
    await expect(settings.getByRole('button', { name: 'Archive campaign' })).toBeVisible()

    await settings.getByRole('button', { name: 'Delete campaign' }).click()
    const confirm = page.getByRole('dialog', { name: 'Delete campaign?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirm).toBeHidden()
    // Nothing was deleted: the campaign is still open.
    await expect(page.locator('.ov-hero')).toBeVisible()
  })
})

test.describe('campaign Overview (phone, 375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('is one stack with collapsible panels and no sideways scroll', async ({ page }) => {
    await createCampaign(page)
    const main = await page.locator('.ov-main').boundingBox()
    const side = await page.locator('.ov-side').boundingBox()
    expect(side!.x).toBeLessThanOrEqual(main!.x + 1)
    expect(side!.y).toBeGreaterThan(main!.y)

    const toggle = (name: string) => page.getByRole('button', { name, exact: true })
    // World overview stays open; the side panels start closed.
    await expect(toggle('World overview')).toHaveAttribute('aria-expanded', 'true')
    for (const name of ['Links', 'Voice', 'Linked campaigns']) {
      await expect(toggle(name)).toHaveAttribute('aria-expanded', 'false')
    }
    await toggle('Links').click()
    await expect(toggle('Links')).toHaveAttribute('aria-expanded', 'true')
    await toggle('World overview').click()
    await expect(toggle('World overview')).toHaveAttribute('aria-expanded', 'false')

    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.main') as HTMLElement
      return el.scrollWidth - el.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
