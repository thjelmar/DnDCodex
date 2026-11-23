import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Landscape phone shell (T-97): a slim demo banner, a 40px top bar that hides on scroll down and
// returns on scroll up, and unchanged desktop, tablet and portrait. Demo data only. These tests do
// not cover a real iPhone (Safari's dynamic toolbar, safe areas, scroll feel).

const CAMPAIGN = 'demo-campaign-0001'
const LANDSCAPE = [
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]

test.use({ isMobile: true, hasTouch: true })

async function openDemo(page: Page, size: { width: number; height: number }, hash = `campaign/${CAMPAIGN}`): Promise<void> {
  await page.setViewportSize(size)
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(`/#/${hash}`)
  await expect(page.locator('.demo-banner')).toBeVisible()
  await expect(page.locator('.main .content h1, .main .content h2').first()).toBeVisible()
}

const height = (page: Page, sel: string) =>
  page.evaluate((s) => Math.round(document.querySelector(s)!.getBoundingClientRect().height), sel)

async function noSideScroll(page: Page): Promise<void> {
  const r = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth, main: document.querySelector('.main')!.scrollWidth, mainW: document.querySelector('.main')!.clientWidth }))
  expect(r.doc).toBeLessThanOrEqual(r.vw)
  expect(r.main).toBeLessThanOrEqual(r.mainW)
}

/** Scrolls .main to a position and waits for the scroll handler (a frame) to run. */
async function scrollMain(page: Page, top: number): Promise<void> {
  await page.evaluate(async (t) => {
    document.querySelector('.main')!.scrollTop = t
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  }, top)
}

for (const size of LANDSCAPE) {
  test.describe(`${size.width}x${size.height} landscape`, () => {
    test('the demo banner is a 24px strip with the exit action in a 38px tap area', async ({ page }) => {
      await openDemo(page, size)
      expect(await height(page, '.demo-banner')).toBe(24)
      await expect(page.locator('.demo-short')).toBeVisible()
      await expect(page.locator('.demo-long')).toBeHidden()
      const exit = page.locator('.demo-banner-exit')
      await expect(exit).toBeVisible()
      await expect(exit).toContainText('Exit to the real site')
      // The visible button is short; its tap area reaches 38px.
      const hit = await page.evaluate(() => {
        const b = document.querySelector('.demo-banner-exit')!.getBoundingClientRect()
        const cx = b.left + b.width / 2
        const at = (y: number) => !!document.elementFromPoint(cx, y)?.closest('.demo-banner-exit')
        return { bottom: at(b.bottom + 14), beyond: at(b.bottom + 20) }
      })
      expect(hit.bottom).toBe(true)
      expect(hit.beyond).toBe(false)
      await noSideScroll(page)
    })

    test('the top bar is 40px, hides on scroll down and returns on scroll up, at the top and with the drawer', async ({ page }) => {
      await openDemo(page, size)
      expect(await height(page, '.topbar')).toBe(40)
      for (const sel of ['.topbar-burger', '.topbar-icon']) {
        const b = (await page.locator(sel).boundingBox())!
        expect(b.width).toBeGreaterThanOrEqual(37.5)
        expect(b.height).toBeGreaterThanOrEqual(37.5)
      }
      const app = page.locator('.app')
      const mainH = await height(page, '.main')
      const canScroll = await page.evaluate(() => { const m = document.querySelector('.main')!; return m.scrollHeight - m.clientHeight })
      expect(canScroll).toBeGreaterThan(300)

      await scrollMain(page, 300)
      await expect(app).toHaveAttribute('data-topbar-hidden', 'true')
      await page.waitForTimeout(350) // the slide takes 200ms
      const hidden = await page.evaluate(() => ({ bottom: document.querySelector('.topbar')!.getBoundingClientRect().bottom, app: document.querySelector('.app')!.getBoundingClientRect().top }))
      expect(hidden.bottom).toBeLessThanOrEqual(hidden.app + 1)
      expect(await height(page, '.main')).toBe(mainH) // no layout jump

      await scrollMain(page, 200)
      await expect(app).not.toHaveAttribute('data-topbar-hidden', 'true')
      expect(await height(page, '.main')).toBe(mainH)

      await scrollMain(page, 500)
      await expect(app).toHaveAttribute('data-topbar-hidden', 'true')
      await scrollMain(page, 0)
      await expect(app).not.toHaveAttribute('data-topbar-hidden', 'true')

      // Opening the drawer shows the bar and the drawer sits right under it.
      await scrollMain(page, 500)
      await expect(app).toHaveAttribute('data-topbar-hidden', 'true')
      await page.evaluate(() => (document.querySelector('.app') as HTMLElement).removeAttribute('data-topbar-hidden'))
      await page.locator('.topbar-burger').click()
      await expect(app).toHaveAttribute('data-nav-open', 'true')
      const bar = (await page.locator('.topbar').boundingBox())!
      const drawer = (await page.locator('.sidebar').boundingBox())!
      expect(Math.abs(drawer.y - (bar.y + bar.height))).toBeLessThanOrEqual(1)
    })

    test('the drawer opens even after the bar hid, and the bar stays while it is open', async ({ page }) => {
      await openDemo(page, size)
      await scrollMain(page, 500)
      await expect(page.locator('.app')).toHaveAttribute('data-topbar-hidden', 'true')
      await scrollMain(page, 450) // a small step up shows it
      await expect(page.locator('.app')).not.toHaveAttribute('data-topbar-hidden', 'true')
      await page.locator('.topbar-burger').click()
      await scrollMain(page, 900)
      await expect(page.locator('.app')).not.toHaveAttribute('data-topbar-hidden', 'true')
    })
  })
}

test('without the demo, the landscape bar is 40px and a notch adds only the top inset', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/#/')
  await expect(page.locator('.topbar')).toBeVisible()
  expect(await height(page, '.topbar')).toBe(40)
  await page.addStyleTag({ content: ':root { --sat: 20px; }' })
  expect(await height(page, '.topbar')).toBe(60)
})

test('portrait phone keeps the 40px banner and the 55px bar, and the bar never hides', async ({ page }) => {
  await openDemo(page, { width: 390, height: 844 })
  expect(await height(page, '.demo-banner')).toBe(40)
  expect(await height(page, '.topbar')).toBe(55)
  await expect(page.locator('.demo-long')).toBeVisible()
  await scrollMain(page, 600)
  await expect(page.locator('.app')).not.toHaveAttribute('data-topbar-hidden', 'true')
  await noSideScroll(page)
})

test('a touch tablet (820x1180) keeps the phone portrait shell', async ({ page }) => {
  await openDemo(page, { width: 820, height: 1180 })
  expect(await height(page, '.demo-banner')).toBe(40)
  expect(await height(page, '.topbar')).toBe(55)
})

test.describe('desktop', () => {
  test.use({ isMobile: false, hasTouch: false })
  test('keeps the 40px banner, a docked sidebar and no top bar', async ({ page }) => {
    await openDemo(page, { width: 1024, height: 768 })
    expect(await height(page, '.demo-banner')).toBe(40)
    await expect(page.locator('.topbar')).toBeHidden()
    expect((await page.locator('.sidebar').boundingBox())!.width).toBe(220)
    await scrollMain(page, 400)
    await expect(page.locator('.app')).not.toHaveAttribute('data-topbar-hidden', 'true')
  })
})
