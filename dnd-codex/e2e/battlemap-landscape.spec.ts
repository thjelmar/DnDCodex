import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Battle map on a phone, in landscape and portrait full screen (T-96). Demo data only.
// A browser cannot emulate a real notch or Safari's toolbar, so safe areas are emulated by
// overriding the --sal/--sar/--sat/--sab custom properties that styles.css reads from env().

const CAMPAIGN = 'demo-campaign-0001'
const NOTCH = ':root { --sal: 47px; --sar: 47px; --sab: 21px; }'

test.use({ isMobile: true, hasTouch: true })

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

const share = (page: Page) =>
  page.evaluate(() => {
    const b = document.querySelector('.tabletop-view')!.getBoundingClientRect()
    return (b.width * b.height) / (innerWidth * innerHeight)
  })

async function noSideScroll(page: Page): Promise<void> {
  const r = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: innerWidth }))
  expect(r.doc).toBeLessThanOrEqual(r.vw)
}

/** Every visible button and link in the chosen region is at least 38 by 38 CSS pixels. */
async function expectTouchTargets(page: Page, region: string): Promise<void> {
  const small = await page.evaluate((sel) => {
    const out: string[] = []
    document.querySelectorAll(`${sel} button, ${sel} a, ${sel} input[type=color]`).forEach((e) => {
      const b = e.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) return
      if (b.width < 37.5 || b.height < 37.5) out.push(`${e.tagName}.${String((e as HTMLElement).className)} ${Math.round(b.width)}x${Math.round(b.height)}`)
    })
    return out
  }, region)
  expect(small).toEqual([])
}

for (const size of [
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]) {
  test.describe(`landscape phone ${size.width}x${size.height}`, () => {
    test('full screen: the map takes at least 85% of the screen; no banner, top bar or bar row', async ({ page }) => {
      await openMap(page, size)
      await enterFullscreen(page)
      expect(await share(page)).toBeGreaterThanOrEqual(0.85)
      await noSideScroll(page)
      await expect(page.locator('.demo-banner')).toBeHidden()
      await expect(page.locator('.topbar')).toBeHidden()
      // The bar is a floating pill over the map, not a row.
      const bar = await page.locator('.bm-top').boundingBox()
      expect(bar!.height).toBeLessThan(60)
      expect(bar!.width).toBeLessThan(size.width / 2 + 60)
      // Notes start closed on a phone.
      await expect(page.locator('.bm-notes')).toHaveCount(0)
      await expectTouchTargets(page, '.bm-rail')
      await expectTouchTargets(page, '.bm-top')
      await expectTouchTargets(page, '.bm-map .tabletop-zoom')
    })

    test('the inspector and the notes share one right drawer of at most 45% of the width', async ({ page }) => {
      await openMap(page, size)
      await enterFullscreen(page)
      await page.locator('button[aria-label="Inspector"]').click()
      const insp = page.locator('.bm-insp-drawer')
      await expect(insp).toBeVisible()
      const ib = (await insp.boundingBox())!
      expect(ib.width).toBeLessThanOrEqual(size.width * 0.45 + 1)
      expect(ib.x + ib.width).toBeCloseTo(size.width, 0)
      // No scrim: the map beside the drawer stays usable. The pill moves left of the drawer.
      await expect(page.locator('.bm-scrim')).toBeHidden()
      const pill = (await page.locator('.bm-top').boundingBox())!
      expect(pill.x + pill.width).toBeLessThanOrEqual(ib.x)
      await expectTouchTargets(page, '.bm-insp-drawer')
      // Opening the notes closes the inspector.
      await page.locator('button[aria-label="Session notes"]').click()
      await expect(page.locator('.bm-notes-drawer')).toBeVisible()
      await expect(insp).toHaveCount(0)
      const nb = (await page.locator('.bm-notes-drawer').boundingBox())!
      expect(nb.width).toBeLessThanOrEqual(size.width * 0.45 + 1)
      await noSideScroll(page)
    })

    test('with a notch the rail, pill, zoom and hint stay inside the safe areas; the map reaches the edge', async ({ page }) => {
      await openMap(page, size)
      await page.addStyleTag({ content: NOTCH })
      await enterFullscreen(page)
      const r = await page.evaluate(() => {
        const rect = (s: string) => document.querySelector(s)?.getBoundingClientRect()
        return {
          railBtn: rect('.bm-rail .bm-tool'),
          rail: rect('.bm-rail'),
          pill: rect('.bm-top'),
          zoom: rect('.bm-map .tabletop-zoom'),
          view: rect('.tabletop-view'),
          vw: innerWidth,
          vh: innerHeight,
        }
      })
      expect(r.railBtn!.left).toBeGreaterThanOrEqual(47)
      expect(r.rail!.left).toBe(0)
      expect(r.pill!.right).toBeLessThanOrEqual(r.vw - 47)
      expect(r.zoom!.right).toBeLessThanOrEqual(r.vw - 47)
      expect(r.zoom!.bottom).toBeLessThanOrEqual(r.vh - 21)
      expect(Math.round(r.view!.right)).toBe(r.vw)
      await noSideScroll(page)
    })

    test('exit full screen from the rail returns to the page, and the banner comes back', async ({ page }) => {
      await openMap(page, size)
      await enterFullscreen(page)
      await page.locator('button[aria-label="Exit full screen"]').first().click()
      await expect(page.locator('.bm-studio.expanded')).toHaveCount(0)
      await expect(page.locator('.demo-banner')).toBeVisible()
    })
  })
}

test.describe('landscape phone outside full screen', () => {
  test('uses the phone shell: a drawer and top bar, not the 220px sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 })
    await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
    await page.goto(`/#/campaign/${CAMPAIGN}`)
    await expect(page.locator('.topbar')).toBeVisible()
    const sb = await page.locator('.sidebar').boundingBox()
    expect(sb!.x + sb!.width).toBeLessThanOrEqual(0)
    await noSideScroll(page)
  })
})

test.describe('portrait phone 390x844', () => {
  const size = { width: 390, height: 844 }
  test('full screen: notes start closed, the map takes at least 75%, and the rotate hint shows once', async ({ page }) => {
    await openMap(page, size)
    await enterFullscreen(page)
    expect(await share(page)).toBeGreaterThanOrEqual(0.75)
    await noSideScroll(page)
    await expect(page.locator('.bm-notes')).toHaveCount(0)
    const hint = page.locator('.bm-rotate')
    await expect(hint).toBeVisible()
    await expect(hint).toContainText('Rotate for more room')
    await hint.getByRole('button', { name: 'Dismiss' }).click()
    await expect(hint).toHaveCount(0)
    // Once per device: leaving and entering full screen again doesn't bring it back.
    await page.locator('button[aria-label="Exit full screen"]').first().click()
    await enterFullscreen(page)
    await expect(page.locator('.bm-rotate')).toHaveCount(0)
  })
  test('the rotate hint does not show in landscape', async ({ page }) => {
    await openMap(page, { width: 844, height: 390 })
    await enterFullscreen(page)
    await expect(page.locator('.bm-rotate')).toHaveCount(0)
  })
})

test.describe('tablet keeps the desktop layout', () => {
  for (const size of [
    { width: 1024, height: 768 },
    { width: 1180, height: 820 },
  ]) {
    test(`${size.width}x${size.height} touch: docked sidebar, no phone studio`, async ({ page }) => {
      await openMap(page, size)
      await expect(page.locator('.bm-studio')).not.toHaveClass(/phone/)
      await expect(page.locator('.topbar')).toBeHidden()
      const sb = await page.locator('.sidebar').boundingBox()
      expect(Math.round(sb!.width)).toBe(220)
      await expect(page.locator('.bm-insp-docked')).toBeVisible()
    })
  }
})
