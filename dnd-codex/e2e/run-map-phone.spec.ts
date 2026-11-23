import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Run mode's Battle Map tab on a phone (T-96): a full screen map, with combat, notes, handouts, dice
// and the In play pins as tabs in one right drawer. Demo data only. Also the Show panel fix: on a
// narrow, non-phone pane the grid and token panel opens over the board, not below the fold.

const CAMPAIGN = 'demo-campaign-0001'
const NOTCH = ':root { --sal: 47px; --sar: 47px; --sab: 21px; }'

test.use({ isMobile: true, hasTouch: true })

async function openRunMap(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size)
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(`/#/run/${CAMPAIGN}`)
  await page.locator('button[role="tab"]', { hasText: 'Battle Map' }).click()
  await expect(page.locator('.tabletop-view')).toBeVisible()
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

async function expectTouchTargets(page: Page, region: string): Promise<void> {
  const small = await page.evaluate((sel) => {
    const out: string[] = []
    document.querySelectorAll(`${sel} button, ${sel} a`).forEach((e) => {
      const b = e.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) return
      if (b.width < 37.5 || b.height < 37.5) out.push(`${e.tagName}.${String((e as HTMLElement).className)} ${Math.round(b.width)}x${Math.round(b.height)}`)
    })
    return out
  }, region)
  expect(small).toEqual([])
}

for (const [size, min] of [
  [{ width: 844, height: 390 }, 0.9],
  [{ width: 667, height: 375 }, 0.9],
  [{ width: 390, height: 844 }, 0.75],
] as const) {
  test.describe(`Run mode map ${size.width}x${size.height}`, () => {
    test('the map is full screen: no banner, top bar, tip or tab switch, and it fills the screen', async ({ page }) => {
      await openRunMap(page, size)
      expect(await share(page)).toBeGreaterThanOrEqual(min)
      await noSideScroll(page)
      await expect(page.locator('.bm-studio.expanded')).toBeVisible()
      await expect(page.locator('.demo-banner')).toBeHidden()
      await expect(page.locator('.topbar')).toBeHidden()
      await expect(page.getByText('Tip: a landscape image')).toHaveCount(0)
      await expectTouchTargets(page, '.bm-rail')
      await expectTouchTargets(page, '.bm-top')
      await expectTouchTargets(page, '.bm-map .tabletop-zoom')
    })

    test('one right drawer holds combat, in play, notes, handouts and dice, one at a time', async ({ page }) => {
      await openRunMap(page, size)
      await page.locator('button[aria-label="Inspector"]').click()
      const insp = page.locator('.bm-insp-drawer')
      await expect(insp).toBeVisible()
      const tabs = insp.getByRole('tab')
      await expect(tabs).toHaveText(['Combat', 'In play', 'Notes', 'Handouts', 'Dice', 'Tokens', 'Grid', 'Map'])
      await expect(insp.getByText('Start combat')).toBeVisible()
      await insp.getByRole('tab', { name: 'Dice' }).click()
      await expect(insp.getByText('Start combat')).toHaveCount(0)
      await insp.getByRole('tab', { name: 'In play' }).click()
      await expect(insp.locator('.run-col-heading', { hasText: 'In play' })).toBeVisible()
      await insp.getByRole('tab', { name: 'Tokens' }).click()
      await expect(page.locator('.bm-filter')).toBeVisible()
      if (size.width > size.height) {
        await expect(page.locator('.bm-scrim')).toBeHidden()
        const ib = (await insp.boundingBox())!
        expect(ib.width).toBeLessThanOrEqual(size.width * 0.45 + 1)
      }
      await expectTouchTargets(page, '.bm-insp-drawer .bm-tabs')
      await noSideScroll(page)
    })

    test('the rail goes back to the Notes page, and the map tab returns to full screen', async ({ page }) => {
      await openRunMap(page, size)
      await page.locator('button[aria-label="Back to session notes"]').click()
      await expect(page.locator('.bm-studio')).toHaveCount(0)
      await expect(page.locator('.run-page')).toContainText('In play')
      await expect(page.locator('.demo-banner')).toBeVisible()
      await page.locator('button[role="tab"]', { hasText: 'Battle Map' }).click()
      await expect(page.locator('.bm-studio.expanded')).toBeVisible()
    })
  })
}

test('with a notch, the Run map controls stay inside the safe areas', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.addInitScript((css) => {
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style')
      st.textContent = css
      document.head.appendChild(st)
    })
  }, NOTCH)
  await page.goto(`/#/run/${CAMPAIGN}`)
  await page.locator('button[role="tab"]', { hasText: 'Battle Map' }).click()
  await expect(page.locator('.bm-studio.expanded')).toBeVisible()
  const r = await page.evaluate(() => {
    const rect = (s: string) => document.querySelector(s)?.getBoundingClientRect()
    return { railBtn: rect('.bm-rail .bm-tool'), pill: rect('.bm-top'), zoom: rect('.bm-map .tabletop-zoom'), vw: innerWidth }
  })
  expect(r.railBtn!.left).toBeGreaterThanOrEqual(47)
  expect(r.pill!.right).toBeLessThanOrEqual(r.vw - 47)
  expect(r.zoom!.right).toBeLessThanOrEqual(r.vw - 47)
})

test('a tablet keeps the classic Run layout, and Show panel opens the panel over the board', async ({ page }) => {
  await openRunMap(page, { width: 1024, height: 768 })
  await expect(page.locator('.bm-studio')).toHaveCount(0)
  await page.locator('.battlemap-more summary').click()
  await page.getByRole('button', { name: 'Show panel' }).click()
  const side = page.locator('.battlemap-side')
  await expect(side).toBeVisible()
  const [s, v] = await Promise.all([side.boundingBox(), page.locator('.tabletop-view').boundingBox()])
  // The panel sits inside the board's own rectangle, so it is visible wherever the board is.
  expect(s!.y).toBeGreaterThanOrEqual(v!.y - 1)
  expect(s!.x + s!.width).toBeLessThanOrEqual(v!.x + v!.width + 1)
})
