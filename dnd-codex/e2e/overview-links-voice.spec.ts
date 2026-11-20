import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Links and Voice share one Overview card (T-85): two sections split by a line,
// each collapsing alone, with the card closing up around a closed section.

async function createCampaign(page: Page): Promise<void> {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start a campaign' }).click()
  await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E LinksVoice ${Date.now()}`)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
  await expect(page.locator('.ov-hero')).toBeVisible()
}

const card = (page: Page) => page.locator('.ov-duo')
const toggle = (page: Page, name: string) => card(page).getByRole('button', { name, exact: true })
const box = async (page: Page, sel: string) => (await page.locator(sel).boundingBox())!

async function expectCollapsingBehavior(page: Page): Promise<void> {
  await expect(page.locator('.ov-duo')).toHaveCount(1)
  // Links and Voice are two sections of one card, in that order.
  const lh = await box(page, '.ov-duo-section:nth-child(1) h3')
  const vh = await box(page, '.ov-duo-section:nth-child(2) h3')
  expect(vh.y).toBeGreaterThan(lh.y)

  // Open both.
  for (const n of ['Links', 'Voice']) {
    if ((await toggle(page, n).getAttribute('aria-expanded')) !== 'true') await toggle(page, n).click()
    await expect(toggle(page, n)).toHaveAttribute('aria-expanded', 'true')
  }
  const both = await card(page).boundingBox()
  const bothTop = await page.evaluate(() => document.querySelector('.ov-duo')!.getBoundingClientRect().top - document.querySelector('.ov-hero')!.getBoundingClientRect().top)
  const voiceOpenY = (await box(page, '.ov-duo-section:nth-child(2) h3')).y

  // Close Links: Voice moves up and the card's bottom edge follows.
  await toggle(page, 'Links').click()
  await expect(toggle(page, 'Voice')).toHaveAttribute('aria-expanded', 'true')
  const linksShut = await card(page).boundingBox()
  expect((await box(page, '.ov-duo-section:nth-child(2) h3')).y).toBeLessThan(voiceOpenY)
  expect(linksShut!.height).toBeLessThan(both!.height)
  // The card ends right under the Voice body: no empty gap.
  const voiceBody = await box(page, '.ov-duo-section:nth-child(2) .ov-panel-body')
  const bottomGap = linksShut!.y + linksShut!.height - (voiceBody.y + voiceBody.height)
  expect(bottomGap).toBeLessThanOrEqual(16)

  // Close Voice too: only the two headings remain in one card.
  await toggle(page, 'Voice').click()
  const none = await card(page).boundingBox()
  expect(none!.height).toBeLessThan(linksShut!.height)
  const v = await box(page, '.ov-duo-section:nth-child(2) h3')
  expect(none!.y + none!.height - (v.y + v.height)).toBeLessThanOrEqual(16)

  // Open Links, keep Voice closed: the card shrinks from the bottom only.
  await toggle(page, 'Links').click()
  await expect(toggle(page, 'Voice')).toHaveAttribute('aria-expanded', 'false')
  const linksOnly = await card(page).boundingBox()
  expect(linksOnly!.height).toBeGreaterThan(none!.height)
  // The top edge stays put (measured from the hero, since .main scrolls).
  const top = () => page.evaluate(() => document.querySelector('.ov-duo')!.getBoundingClientRect().top - document.querySelector('.ov-hero')!.getBoundingClientRect().top)
  expect(Math.abs((await top()) - bothTop)).toBeLessThan(2)

  // Bodies stay mounted while closed, and aria-controls resolves.
  const id = await toggle(page, 'Voice').getAttribute('aria-controls')
  await expect(page.locator(`[id="${id}"]`)).toHaveCount(1)
  await expect(page.locator(`[id="${id}"]`)).toBeHidden()
  await expect(page.locator('.ov-duo h3').filter({ has: page.getByRole('button', { name: 'Voice', exact: true }) })).toHaveCount(1)

  // No sideways scroll.
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('.main') as HTMLElement
    return el.scrollWidth - el.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(0)
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`Links and Voice card, desktop, ${theme}`, () => {
    test('one card; each section collapses alone and the card closes up', async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('codex.theme', t), theme)
      await createCampaign(page)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(toggle(page, 'Links')).toHaveAttribute('aria-expanded', 'true')
      await expect(toggle(page, 'Voice')).toHaveAttribute('aria-expanded', 'true')
      // A visible dividing line sits between the sections.
      const line = await page.evaluate(() => {
        const s = getComputedStyle(document.querySelector('.ov-duo-section + .ov-duo-section')!)
        return { w: s.borderTopWidth, st: s.borderTopStyle, c: s.borderTopColor }
      })
      expect(line.st).toBe('solid')
      expect(line.w).toBe('1px')
      expect(line.c).not.toBe('rgba(0, 0, 0, 0)')
      await expectCollapsingBehavior(page)
    })
  })

  test.describe(`Links and Voice card, 375px, ${theme}`, () => {
    test.use({ viewport: { width: 375, height: 812 } })
    test('both sections start closed, then collapse alone', async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('codex.theme', t), theme)
      await createCampaign(page)
      for (const n of ['Links', 'Voice']) await expect(toggle(page, n)).toHaveAttribute('aria-expanded', 'false')
      await expectCollapsingBehavior(page)
    })
  })
}
