import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// T-119: the player session on an iPhone turned sideways (874x402 with the Dynamic Island on the
// left) and in portrait. Demo only: no sign-in, no Supabase request. A browser cannot emulate a real
// island, so the tests inject --sal (the custom property styles.css reads from env()). Set
// LANDSCAPE_SHOTS=<dir> to save screenshots.

test.use({ isMobile: true, hasTouch: true })

const URL = '/#/player/demo-player-campaign-0001/session'
const LANDSCAPE = [
  { w: 874, h: 402 },
  { w: 844, h: 390 },
  { w: 667, h: 375 },
]
const SAL = 59

async function open(page: Page, w: number, h: number, sal = false) {
  await page.setViewportSize({ width: w, height: h })
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(URL)
  if (sal) await page.addStyleTag({ content: `:root { --sal: ${SAL}px; }` })
  await expect(page.locator('.tabletop-view')).toBeVisible()
}

async function shot(page: Page, name: string) {
  const dir = process.env.LANDSCAPE_SHOTS
  if (dir) await page.screenshot({ path: `${dir}/${name}.png` })
}

/** The DM asks for initiative and the player joins; then (optionally) combat starts. */
async function join(page: Page, startCombat = false) {
  const toggle = page.getByTestId('demo-controls-toggle').first()
  await toggle.click()
  await page.getByTestId('demo-ask').first().click()
  if (!startCombat) await toggle.click()
  await page.getByTestId('initiative-strip').getByTestId('join-initiative').first().click()
  await page.getByTestId('join-submit').click()
  if (startCombat) {
    await page.getByTestId('demo-start').first().click()
    await toggle.click()
  }
  await expect(page.getByTestId('strip-chip').first()).toBeVisible()
}

/** Where the visible title text ends: its widest line, clipped by the round box when that clips. */
const titleRight = (page: Page) =>
  page.evaluate(() => {
    const round = document.querySelector('[data-testid=initiative-strip] .bm-turns-round') as HTMLElement
    const rr = round.getBoundingClientRect()
    let right = 0
    for (const el of Array.from(round.children)) {
      const range = document.createRange()
      range.selectNodeContents(el)
      right = Math.max(right, range.getBoundingClientRect().right)
    }
    return getComputedStyle(round).overflowX === 'hidden' ? Math.min(right, rr.right) : right
  })

const box = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((e) => {
    const r = e.getBoundingClientRect()
    return { l: r.left, t: r.top, r: r.right, b: r.bottom }
  })
type Box = { l: number; t: number; r: number; b: number }
const hit = (a: Box, b: Box) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5

for (const { w, h } of LANDSCAPE) {
  test.describe(`landscape ${w}x${h}`, () => {
    test('the back button clears the left safe area', async ({ page }) => {
      await open(page, w, h, true)
      await shot(page, `${w}x${h}-page`)
      const back = await page.locator('.session-header > .bm-btn').first().evaluate((e) => e.getBoundingClientRect().left)
      expect(back).toBeGreaterThanOrEqual(SAL)
      // The rail and the map card clear it too.
      const rail = await box(page, '.player-live-bar')
      expect(rail.l).toBeGreaterThanOrEqual(SAL)
    })

    test('the turn strip title never meets the button, and every chip is reachable', async ({ page }) => {
      await open(page, w, h)
      await join(page)
      await shot(page, `${w}x${h}-joined`)
      const strip = page.getByTestId('initiative-strip')
      const btn = await box(page, '[data-testid=initiative-strip] .bm-turns-next')
      expect(await titleRight(page), 'the title ends before the button').toBeLessThanOrEqual(btn.l + 0.5)
      await page.getByTestId('demo-controls-toggle').first().click()
      await page.getByTestId('demo-start').first().click()
      await page.getByTestId('demo-controls-toggle').first().click()
      await expect(strip.getByTestId('strip-round')).toContainText('Round')
      await shot(page, `${w}x${h}-combat`)
      const res = await page.evaluate(() => {
        const ol = document.querySelector('[data-testid=initiative-strip] .bm-turns-chips') as HTMLElement
        const pill = document.querySelector('[data-testid=initiative-strip]') as HTMLElement
        const chips = Array.from(ol.querySelectorAll('[data-testid=strip-chip]')) as HTMLElement[]
        const pr = pill.getBoundingClientRect()
        const or = ol.getBoundingClientRect()
        const out: string[] = []
        if (or.right > pr.right + 0.5) out.push('chip row leaves the pill')
        const scrollable = ol.scrollWidth > ol.clientWidth + 1
        // Every chip is inside the row, or the row scrolls sideways to reach it.
        for (const c of chips) {
          const cr = c.getBoundingClientRect()
          const inside = cr.left >= or.left - 0.5 && cr.right <= or.right + 0.5
          if (!inside && !(scrollable && getComputedStyle(ol).overflowX === 'auto')) out.push('unreachable chip ' + c.title)
        }
        return { out, count: chips.length }
      })
      expect(res.count).toBeGreaterThanOrEqual(4)
      expect(res.out).toEqual([])
    })

    test('the session panel button opens a drawer in full screen', async ({ page }) => {
      await open(page, w, h, true)
      await join(page)
      await page.getByTestId('map-fullscreen').first().click()
      await expect(page.locator('.player-live-board.expanded')).toBeVisible()
      const toggle = page.getByTestId('fs-panel-toggle')
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await toggle.click()
      const panel = page.getByTestId('fs-panel')
      await expect(panel).toBeVisible()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(panel.getByRole('tab', { name: /Initiative/ })).toBeVisible()
      await shot(page, `${w}x${h}-fs-drawer`)
      const r = await box(page, '[data-testid=fs-panel]')
      expect(r.l).toBeGreaterThanOrEqual(0)
      expect(r.t).toBeGreaterThanOrEqual(0)
      expect(r.r).toBeLessThanOrEqual(w + 0.5)
      expect(r.b).toBeLessThanOrEqual(h + 0.5)
      expect(r.r - r.l).toBeGreaterThan(150)
      await toggle.click()
      await expect(panel).toHaveCount(0)
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    })

    // T-127: the strip starts right of the rail, so the rail's Panel and Exit buttons stay whole and tappable.
    test('full screen: the turn strip never covers the rail', async ({ page }) => {
      await open(page, w, h, true)
      await join(page, true)
      await page.getByTestId('map-fullscreen').first().click()
      await expect(page.locator('.player-live-board.expanded')).toBeVisible()
      await shot(page, `${w}x${h}-fs-strip`)
      const strip = await box(page, '[data-testid=initiative-strip]')
      const rail = await box(page, '.player-live-bar')
      expect(hit(strip, rail), JSON.stringify({ strip, rail })).toBe(false)
      expect(strip.r).toBeLessThanOrEqual(w + 0.5)
      // Both buttons take a tap (Playwright refuses a click that another element would receive).
      await page.getByTestId('fs-panel-toggle').click({ trial: true })
      await page.getByTestId('fs-panel-toggle').click()
      await expect(page.getByTestId('fs-panel')).toBeVisible()
      await page.getByTestId('fs-panel-toggle').click()
      await page.locator('.player-live-board.expanded .player-live-bar').getByRole('button').last().click({ trial: true })
    })

    // T-127: names get the room; an ellipsis shows only when a name truly cannot fit.
    test('the drawer row and the strip title show whole names', async ({ page }) => {
      await open(page, w, h, true)
      await join(page, true)
      const clipped = (sel: string) =>
        page.locator(sel).first().evaluate((e) => e.scrollWidth > e.clientWidth + 1)
      expect(await clipped('[data-testid=initiative-strip] .bm-turns-round strong'), 'strip title').toBe(false)
      // A 667pt-wide phone leaves the map card about 320pt: its subtitle may then take an ellipsis.
      if (w >= 844) expect(await clipped('[data-testid=initiative-strip] .bm-turns-round small'), 'strip subtitle').toBe(false)
      await page.getByTestId('map-fullscreen').first().click()
      await page.getByTestId('fs-panel-toggle').click()
      const names = page.locator('[data-testid=fs-panel] .il-name')
      await expect(names.first()).toBeVisible()
      const n = await names.count()
      for (let i = 0; i < n; i++) {
        // Polled: the drawer slides in, and a name is measured once it has its final width.
        const text = await names.nth(i).textContent()
        await expect.poll(() => names.nth(i).evaluate((e) => e.scrollWidth > e.clientWidth + 1), { message: `drawer name "${text}"` }).toBe(false)
      }
    })
  })
}

test.describe('portrait 402x874', () => {
  test('the Demo controls pill leaves the last panel row reachable', async ({ page }) => {
    await open(page, 402, 874)
    await join(page)
    const last = page.getByTestId('dock-row').last()
    await last.scrollIntoViewIfNeeded()
    // Scroll the page and the panel as far as they go: the last row must end above the pill.
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
      document.querySelectorAll<HTMLElement>('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight })
    })
    const row = await last.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } })
    const pill = await box(page, '[data-testid=demo-controls-toggle]')
    await shot(page, 'portrait-pill')
    expect(hit(row, pill), JSON.stringify({ row, pill })).toBe(false)
  })

  test('the Demo controls pill leaves the last drawer row reachable in full screen', async ({ page }) => {
    await open(page, 402, 874)
    await join(page)
    await page.getByTestId('map-fullscreen').first().click()
    await page.getByTestId('fs-panel-toggle').click()
    const last = page.locator('[data-testid=fs-panel] [data-testid=dock-row]').last()
    await expect(last).toBeVisible()
    await page.evaluate(() => {
      document.querySelectorAll<HTMLElement>('*').forEach((e) => { if (e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight })
    })
    const row = await last.evaluate((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } })
    const pill = await box(page, '.player-live-board.expanded [data-testid=demo-controls-toggle]')
    await shot(page, 'portrait-fs-drawer')
    expect(hit(row, pill), JSON.stringify({ row, pill })).toBe(false)
  })

  test('entering full screen fits the whole map', async ({ page }) => {
    await open(page, 402, 874)
    await page.getByTestId('map-fullscreen').first().click()
    await expect(page.locator('.player-live-board.expanded')).toBeVisible()
    const tf = () => page.evaluate(() => document.querySelector('.player-live-board.expanded .tabletop-view svg > g[transform^="translate"]')!.getAttribute('transform')!)
    await expect.poll(async () => (await tf()).startsWith('translate(-'), { timeout: 3000 }).toBe(false)
    const before = await tf()
    await shot(page, 'portrait-fs')
    await page.locator('.player-live-board.expanded .tabletop-zoom').getByText('Fit', { exact: true }).click()
    expect(await tf()).toBe(before)
  })
})

// T-127: the pill sits in the page header on a phone, so it can never cover a panel row.
for (const [w, h] of [[402, 874], [844, 390], [667, 375]]) {
  test(`${w}x${h}: the Demo controls pill is in the header, not floating over the panel`, async ({ page }) => {
    await open(page, w, h)
    await join(page)
    const pill = page.getByTestId('demo-controls-toggle').first()
    expect(await pill.evaluate((e) => getComputedStyle(e).position)).not.toBe('fixed')
    const p = await box(page, '[data-testid=demo-controls-toggle]')
    const header = await box(page, '.session-page > .session-header')
    expect(p.t).toBeGreaterThanOrEqual(header.t - 0.5)
    expect(p.b).toBeLessThanOrEqual(header.b + 0.5)
    const dock = await box(page, '.pl-panel')
    expect(hit(p, dock)).toBe(false)
  })
}

// T-127: the map fits the visible area on entering full screen and again after every rotation.
test('full screen refits the whole map after a rotation', async ({ page, browserName }) => {
  // Chromium puts the window itself in full screen, which a test cannot resize; Safari's engine does not.
  test.skip(browserName === 'chromium', 'a full screen Chromium window cannot be resized')
  await open(page, 402, 874)
  await page.getByTestId('map-fullscreen').first().click()
  await expect(page.locator('.player-live-board.expanded')).toBeVisible()
  const tf = () => page.evaluate(() => document.querySelector('.player-live-board.expanded .tabletop-view svg > g[transform^="translate"]')!.getAttribute('transform')!)
  // The view the board settled into, then the view the Fit button gives: equal means it was already fitted.
  const fitted = async () => {
    await page.waitForTimeout(800)
    const settled = await tf()
    await page.locator('.player-live-board.expanded .tabletop-zoom').getByText('Fit', { exact: true }).click()
    expect(await tf()).toBe(settled)
  }
  await fitted()
  await page.setViewportSize({ width: 874, height: 402 })
  await fitted()
  await page.setViewportSize({ width: 402, height: 874 })
  await fitted()
})

// T-127: 874x402 with Safari's tab bar showing leaves about 270pt. The rail fills most of that height, and
// the strip must still leave its Panel and Exit buttons uncovered and tappable.
test('874x270 (Safari tab bar showing): full screen strip clears the rail', async ({ page }) => {
  await page.setViewportSize({ width: 874, height: 270 })
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(URL)
  await page.addStyleTag({ content: `:root { --sal: ${SAL}px; }` })
  await page.locator('.tabletop-view').waitFor({ state: 'attached' })
  await join(page, true)
  await page.getByTestId('map-fullscreen').first().click()
  await expect(page.locator('.player-live-board.expanded')).toBeVisible()
  await shot(page, '874x270-fs-strip')
  const strip = await box(page, '[data-testid=initiative-strip]')
  const rail = await box(page, '.player-live-bar')
  expect(hit(strip, rail), JSON.stringify({ strip, rail })).toBe(false)
  await page.getByTestId('fs-panel-toggle').click()
  await expect(page.getByTestId('fs-panel')).toBeVisible()
  await page.getByTestId('fs-panel-toggle').click()
  await page.locator('.player-live-board.expanded .player-live-bar').getByRole('button').last().click({ trial: true })
})
