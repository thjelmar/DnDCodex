import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Video-style full screen (T-96): the browser Fullscreen API where it exists, the installed app (Add to
// Home Screen) as the iPhone answer, and the one-time install card. A real iPhone, a real installed app and
// Safari's toolbar can't be driven here; these tests stub what the page reads (navigator.standalone, the
// user agent, requestFullscreen).

const CAMPAIGN = 'demo-campaign-0001'
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1'

async function openMap(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size)
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(`/#/campaign/${CAMPAIGN}/battlemap`)
  await page.locator('.battlemap-maps .list-row').first().click()
  await expect(page.locator('.tabletop-view')).toBeVisible()
}

async function enterFullscreen(page: Page): Promise<void> {
  const direct = page.locator('button[aria-label="Full screen"]:visible')
  if (await direct.count()) await direct.click()
  else {
    await page.locator('button[aria-label="More actions"]').click()
    await page.locator('.bm-item', { hasText: 'Full screen' }).click()
  }
  await expect(page.locator('.bm-studio.expanded')).toBeVisible()
}

test('the web app manifest and the iOS tags make Add to Home Screen open without browser bars', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/manifest.webmanifest')
  await expect(page.locator('meta[name=apple-mobile-web-app-capable]')).toHaveAttribute('content', 'yes')
  await expect(page.locator('meta[name=apple-mobile-web-app-status-bar-style]')).toHaveAttribute('content', 'black-translucent')
  await expect(page.locator('meta[name=apple-mobile-web-app-title]')).toHaveAttribute('content', 'D&D Codex')
  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', '/icons/apple-touch-icon.png')
  const m = await (await request.get('/manifest.webmanifest')).json()
  expect(m.display).toBe('standalone')
  expect(m.orientation).toBe('any')
  expect(m.start_url).toBe('/#/')
  expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
  expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i)
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
  for (const path of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png']) {
    const r = await request.get(path)
    expect(r.ok()).toBe(true)
    expect(r.headers()['content-type']).toContain('image/png')
  }
})

test.describe('installed app on a phone', () => {
  test.use({ isMobile: true, hasTouch: true })
  test('the battle map starts in full screen, with no install card', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }))
    await openMap(page, { width: 844, height: 390 })
    await expect(page.locator('.bm-studio.expanded')).toBeVisible()
    await expect(page.locator('.bm-install')).toHaveCount(0)
    // Exit still works: it goes back to the page.
    await page.locator('button[aria-label="Exit full screen"]').first().click()
    await expect(page.locator('.bm-studio.expanded')).toHaveCount(0)
  })
})

test.describe('install card', () => {
  test.use({ isMobile: true, hasTouch: true, userAgent: IPHONE_SAFARI })
  test('shows once in iPhone Safari, in full screen, and can be dismissed', async ({ page }) => {
    await openMap(page, { width: 844, height: 390 })
    await expect(page.locator('.bm-install')).toHaveCount(0)
    await enterFullscreen(page)
    const card = page.locator('.bm-install')
    await expect(card).toBeVisible()
    await expect(card).toContainText('Install for full screen')
    await expect(card).toContainText('Add to Home Screen')
    await card.getByRole('button', { name: 'Dismiss' }).click()
    await expect(card).toHaveCount(0)
    await page.locator('button[aria-label="Exit full screen"]').first().click()
    await enterFullscreen(page)
    await expect(page.locator('.bm-install')).toHaveCount(0)
  })
})

test.describe('install card, other browsers', () => {
  test.use({ isMobile: true, hasTouch: true, userAgent: IPHONE_CHROME })
  test('does not show in Chrome on an iPhone', async ({ page }) => {
    await openMap(page, { width: 844, height: 390 })
    await enterFullscreen(page)
    await expect(page.locator('.bm-install')).toHaveCount(0)
  })
})

test.describe('browser full screen', () => {
  test('uses requestFullscreen where it exists, follows fullscreenchange, and keeps the overlay as the fallback', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __fsCalls: number }
      w.__fsCalls = 0
      let el: Element | null = null
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => el })
      Element.prototype.requestFullscreen = function () {
        w.__fsCalls++
        el = this
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      }
      document.exitFullscreen = () => {
        el = null
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      }
    })
    await openMap(page, { width: 1280, height: 800 })
    await enterFullscreen(page)
    expect(await page.evaluate(() => (window as unknown as { __fsCalls: number }).__fsCalls)).toBe(1)
    // The browser leaves full screen (Esc): the overlay follows it out.
    await page.evaluate(() => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null })
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    await expect(page.locator('.bm-studio.expanded')).toHaveCount(0)
  })

  test('without the Fullscreen API the in-page overlay still opens and closes', async ({ page }) => {
    await page.addInitScript(() => {
      // iPhone Safari: neither the standard nor the prefixed API exists.
      Object.defineProperty(Element.prototype, 'requestFullscreen', { value: undefined, configurable: true })
      Object.defineProperty(Element.prototype, 'webkitRequestFullscreen', { value: undefined, configurable: true })
    })
    await openMap(page, { width: 1280, height: 800 })
    await enterFullscreen(page)
    await page.keyboard.press('Escape')
    await expect(page.locator('.bm-studio.expanded')).toHaveCount(0)
  })
})
