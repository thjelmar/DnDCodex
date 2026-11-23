import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Landscape phone (T-96): the page paints edge to edge (viewport-fit=cover) and keeps controls
// inside the safe areas. A browser cannot emulate a real notch, so the tests override the
// --sal, --sar, --sat and --sab custom properties that styles.css reads from env(). They do not
// cover a real iPhone: see the checklist in docs/design-exploration/battle-map-phone-landscape.md.

const CAMPAIGN = 'demo-campaign-0001'
const NOTCH = ':root { --sal: 47px; --sar: 47px; --sab: 21px; }'

test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })

async function openDemo(page: Page, hash: string): Promise<void> {
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(`/#/${hash}`)
}

async function noSideScroll(page: Page): Promise<void> {
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    vw: window.innerWidth,
    app: document.querySelector('.app')?.getBoundingClientRect().width ?? 0,
  }))
  expect(r.doc).toBeLessThanOrEqual(r.vw)
  expect(Math.round(r.app)).toBe(r.vw)
}

test('the viewport meta covers the notch and a theme color is set', async ({ page }) => {
  await openDemo(page, '')
  await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', /viewport-fit=cover/)
  await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', /^#[0-9a-f]{6}$/i)
})

test('the shell is as wide as the screen and the page paints its own background', async ({ page }) => {
  await openDemo(page, `campaign/${CAMPAIGN}`)
  await expect(page.locator('.app')).toBeVisible()
  await noSideScroll(page)
  const bg = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
  }))
  expect(bg.html).toBe(bg.body)
  expect(bg.html).not.toBe('rgba(0, 0, 0, 0)')
})

test('with a notch, the demo banner, phone top bar and open drawer keep their content inside the insets', async ({ page }) => {
  await openDemo(page, `campaign/${CAMPAIGN}`)
  await page.addStyleTag({ content: NOTCH })
  await expect(page.locator('.demo-banner')).toBeVisible()
  await noSideScroll(page)
  const r = await page.evaluate(() => {
    const box = (s: string) => document.querySelector(s)?.getBoundingClientRect()
    const first = (s: string) => {
      const el = document.querySelector(s)
      if (!el) return null
      const range = document.createRange()
      range.selectNodeContents(el)
      return range.getBoundingClientRect()
    }
    return {
      vw: innerWidth,
      banner: first('.demo-banner'),
      burgerLeft: box('.topbar-burger')?.left ?? null,
      drawerPad: parseFloat(getComputedStyle(document.querySelector('.sidebar')!).paddingLeft),
    }
  })
  expect(r.banner!.left).toBeGreaterThanOrEqual(47)
  expect(r.banner!.right).toBeLessThanOrEqual(r.vw - 47)
  // A landscape phone uses the phone shell: the top bar's first control and the drawer clear the left inset.
  expect(r.burgerLeft!).toBeGreaterThanOrEqual(47)
  expect(r.drawerPad).toBeGreaterThanOrEqual(47)
})

// The battle map's controls under a notch are covered in battlemap-landscape.spec.ts.
