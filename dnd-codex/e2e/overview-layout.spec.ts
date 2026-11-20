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


// A real 800x400 PNG, drawn in the page, so the cover goes through the app's own
// image pipeline (createImageBitmap, canvas re-encode, Dexie).
async function setCover(page: Page): Promise<void> {
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 800
    c.height = 400
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#3b3560'
    ctx.fillRect(0, 0, 800, 400)
    ctx.fillStyle = '#8b7bd8'
    ctx.fillRect(40, 40, 300, 120)
    return c.toDataURL('image/png').split(',')[1]
  })
  await page
    .locator('.ov-hero input[type=file]')
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
  await expect(page.locator('.ov-hero.has-cover')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Change cover' })).toBeVisible()
}

/** With a cover set, the action buttons and the title must not overlap, must stay inside
 *  the banner, and the page must not scroll sideways. */
async function expectHeroClear(page: Page): Promise<void> {
  const hero = (await page.locator('.ov-hero').boundingBox())!
  const actions = (await page.locator('.ov-hero-actions').boundingBox())!
  const body = (await page.locator('.ov-hero-body').boundingBox())!
  // Actions end above where the title block starts.
  expect(actions.y + actions.height).toBeLessThanOrEqual(body.y + 1)
  for (const box of [actions, body]) {
    expect(box.x).toBeGreaterThanOrEqual(hero.x - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(hero.x + hero.width + 1)
    expect(box.y).toBeGreaterThanOrEqual(hero.y - 1)
    expect(box.y + box.height).toBeLessThanOrEqual(hero.y + hero.height + 1)
  }
  // All three buttons are visible and inside the banner.
  for (const name of ['Change cover', 'Remove', 'Campaign settings']) {
    const b = (await page.getByRole('button', { name }).boundingBox())!
    expect(b.x + b.width).toBeLessThanOrEqual(hero.x + hero.width + 1)
  }
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('.main') as HTMLElement
    return el.scrollWidth - el.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe('campaign Overview (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('is wider than the reading column and splits into main and side columns', async ({ page }) => {
    await createCampaign(page)
    const content = await page.locator('.content.content-overview').boundingBox()
    expect(content!.width).toBeGreaterThan(1000)

    const main = await page.locator('.ov-world').boundingBox()
    const side = await page.locator('.ov-side').boundingBox()
    expect(side!.x).toBeGreaterThan(main!.x + main!.width - 1)
    // Main takes about two thirds (8 of 12 columns), side about one third.
    expect(main!.width).toBeGreaterThan(side!.width * 1.6)

    // World overview and Recent sessions are in the main column; Links and Voice
    // are in the right column. The old Linked campaigns panel is gone.
    for (const t of ['World overview', 'Recent sessions']) {
      const h = (await page.getByRole('heading', { name: t }).boundingBox())!
      expect(h.x + h.width).toBeLessThan(side!.x)
    }
    for (const t of ['Links', 'Voice']) {
      await expect(page.locator('.ov-side').getByRole('heading', { name: t })).toBeVisible()
    }
    await expect(page.getByRole('heading', { name: 'Linked campaigns' })).toHaveCount(0)
    await expect(page.getByText('Link a campaign')).toHaveCount(0)
    // Wide screens show every panel open.
    await expect(page.locator('.ov-side').getByRole('button', { name: 'Links' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  test('with a cover set, the hero actions do not overlap the title', async ({ page }) => {
    await createCampaign(page)
    await setCover(page)
    await expectHeroClear(page)
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

  test('with a cover set, the hero actions wrap and do not overlap the title at 375px', async ({ page }) => {
    await createCampaign(page)
    await setCover(page)
    await expectHeroClear(page)
    // Three buttons plus a long name still fit: the row wraps instead of overflowing.
    await page.getByRole('button', { name: 'Rename campaign' }).click()
    await page.locator('.ov-hero-input').fill('The Very Long Campaign Name That Keeps Going And Going')
    await page.locator('.ov-hero-input').press('Enter')
    // Wait for the rename to land before measuring.
    await expect(page.getByRole('heading', { level: 1, name: /Very Long Campaign Name/ })).toBeVisible()
    await expectHeroClear(page)
  })

  test('a closed panel keeps its body mounted and hidden, so aria-controls resolves', async ({ page }) => {
    await createCampaign(page)
    const links = page.getByRole('button', { name: 'Links', exact: true })
    await expect(links).toHaveAttribute('aria-expanded', 'false')
    const id = await links.getAttribute('aria-controls')
    const body = page.locator(`[id="${id}"]`)
    await expect(body).toHaveCount(1)
    await expect(body).toBeHidden()
    await links.click()
    await expect(body).toBeVisible()
    // The heading is an h3 that wraps the toggle.
    await expect(page.locator('h3', { has: links })).toHaveCount(1)
  })

  test('is one stack with collapsible panels and no sideways scroll', async ({ page }) => {
    await createCampaign(page)
    // On a phone the right column drops below the World overview in a single stack.
    const world = await page.locator('.ov-world').boundingBox()
    const side = await page.locator('.ov-side').boundingBox()
    expect(side!.x).toBeLessThanOrEqual(world!.x + 1)
    expect(side!.y).toBeGreaterThan(world!.y)

    const toggle = (name: string) => page.getByRole('button', { name, exact: true })
    // World overview stays open; the side panels start closed.
    await expect(toggle('World overview')).toHaveAttribute('aria-expanded', 'true')
    for (const name of ['Links', 'Voice']) {
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
