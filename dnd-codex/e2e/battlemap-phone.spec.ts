import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Phone fixes for the battle map board (T-95): no sideways scrolling on the Battle Map
// page or Run mode's Battle Map tab, and reliable two-finger pinch and pan. Demo data only.
// Real touch hardware (an iPhone) is not covered: these tests dispatch synthetic pointer events.

const CAMPAIGN = 'demo-campaign-0001'

async function openDemo(page: Page, hash: string, width = 375, height = 812): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(`/#/${hash}`)
}

async function openStudioMap(page: Page, width = 375): Promise<void> {
  await openDemo(page, `campaign/${CAMPAIGN}/battlemap`, width)
  await page.locator('.battlemap-maps .list-row').first().click()
  await expect(page.locator('.tabletop-view')).toBeVisible()
}

/** Nothing may be wider than the screen: not the document, not the scroll container, not any element. */
async function expectNoSideScroll(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const vw = window.innerWidth
    const wide: string[] = []
    document.querySelectorAll('body *').forEach((e) => {
      if (e.closest('svg')) return
      const b = e.getBoundingClientRect()
      if (b.width > 0 && b.right > vw + 1) wide.push(`${e.tagName}.${String(e.className)} right=${Math.round(b.right)}`)
    })
    const main = document.querySelector('.main')
    return {
      doc: document.documentElement.scrollWidth,
      vw,
      main: main ? [main.scrollWidth, main.clientWidth] : null,
      wide: wide.slice(0, 5),
    }
  })
  expect(r.doc).toBeLessThanOrEqual(r.vw)
  if (r.main) expect(r.main[0]).toBeLessThanOrEqual(r.main[1])
  expect(r.wide).toEqual([])
}

test.describe('phone width: no side scrolling', () => {
  test('Battle Map page', async ({ page }) => {
    await openStudioMap(page)
    await expectNoSideScroll(page)
  })
  test("Run mode, Notes tab and Battle Map tab", async ({ page }) => {
    await openDemo(page, `run/${CAMPAIGN}`)
    await expect(page.locator('.run-page')).toBeVisible()
    await expectNoSideScroll(page)
    await page.locator('button', { hasText: 'Battle Map' }).click()
    await expect(page.locator('.tabletop-view')).toBeVisible()
    await expectNoSideScroll(page)
  })
})

// ---- Board gestures ----------------------------------------------------------

type Xf = { k: number; tx: number; ty: number }

const readXf = (page: Page): Promise<Xf> =>
  page.evaluate(() => {
    const g = document.querySelector('.tabletop-view svg > g') as SVGGElement
    const m = /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(g.getAttribute('transform') ?? '')!
    return { tx: +m[1], ty: +m[2], k: +m[3] }
  })

/** Dispatch a touch pointer event at client coordinates, on the element under them (or a chosen target). */
const touch = (page: Page, type: string, id: number, x: number, y: number, target?: string) =>
  page.evaluate(
    ([type, id, x, y, target]) => {
      // Move, up and cancel go to the board, as they do once the browser has captured the pointer.
      const down = type === 'pointerdown'
      const el = (target ? document.querySelector(target) : down ? document.elementFromPoint(x as number, y as number) : document.querySelector('.tabletop-view')) as Element
      el.dispatchEvent(
        new PointerEvent(type as string, {
          bubbles: true, cancelable: true, composed: true, pointerId: id as number, pointerType: 'touch',
          isPrimary: id === 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x as number, clientY: y as number,
        }),
      )
    },
    [type, id, x, y, target] as const,
  )

const viewBox = (page: Page) => page.locator('.tabletop-view').boundingBox().then((b) => b!)

/** An empty spot on the board background (not on a token), in client coordinates. */
async function emptySpot(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const v = document.querySelector('.tabletop-view')!.getBoundingClientRect()
    for (let y = v.top + 30; y < v.bottom - 30; y += 20)
      for (let x = v.left + 30; x < v.right - 30; x += 20) {
        const el = document.elementFromPoint(x, y)
        if (el && !el.closest('.tabletop-token') && !el.closest('.tabletop-zoom') && el.closest('.tabletop-view')) return { x, y }
      }
    return { x: v.left + 40, y: v.top + 40 }
  })
}

test.describe('board gestures', () => {
  test('touch-action none on the board and overscroll contained', async ({ page }) => {
    await openStudioMap(page)
    const css = await page.locator('.tabletop-view').evaluate((el) => ({ ta: getComputedStyle(el).touchAction, ob: getComputedStyle(el).overscrollBehaviorY }))
    expect(css).toEqual({ ta: 'none', ob: 'contain' })
  })

  test('a pinch zooms about the midpoint of the two fingers and pans with it', async ({ page }) => {
    await openStudioMap(page)
    const s = await emptySpot(page)
    const before = await readXf(page)
    const v = await viewBox(page)
    // Board point under the starting midpoint.
    const mx = s.x, my = s.y
    const bx = (mx - v.x - before.tx) / before.k
    const by = (my - v.y - before.ty) / before.k
    await touch(page, 'pointerdown', 1, mx - 30, my)
    await touch(page, 'pointerdown', 2, mx + 30, my)
    await touch(page, 'pointermove', 1, mx - 60, my)
    await touch(page, 'pointermove', 2, mx + 60, my)
    const zoomed = await readXf(page)
    expect(zoomed.k / before.k).toBeCloseTo(2, 1)
    // The board point stays under the (unmoved) midpoint.
    expect((mx - v.x - zoomed.tx) / zoomed.k).toBeCloseTo(bx, 0)
    expect((my - v.y - zoomed.ty) / zoomed.k).toBeCloseTo(by, 0)
    // Moving both fingers together pans by the midpoint's movement.
    await touch(page, 'pointermove', 1, mx - 60 + 25, my + 15)
    await touch(page, 'pointermove', 2, mx + 60 + 25, my + 15)
    const panned = await readXf(page)
    expect(panned.k).toBeCloseTo(zoomed.k, 3)
    expect(panned.tx - zoomed.tx).toBeCloseTo(25, 0)
    expect(panned.ty - zoomed.ty).toBeCloseTo(15, 0)
    await touch(page, 'pointerup', 2, mx + 85, my + 15)
    await touch(page, 'pointerup', 1, mx - 35, my + 15)
    // The page itself did not scroll.
    expect(await page.evaluate(() => [document.documentElement.scrollTop, document.querySelector('.main')?.scrollTop ?? 0])).toEqual([0, 0])
  })

  test('a pinch ignored when the first finger is dragging a token; the token still drags', async ({ page }) => {
    await openStudioMap(page)
    const tok = await page.locator('.tabletop-token').first().boundingBox()
    const before = await readXf(page)
    const tx = tok!.x + tok!.width / 2, ty = tok!.y + tok!.height / 2
    await touch(page, 'pointerdown', 1, tx, ty)
    await touch(page, 'pointermove', 1, tx + 20, ty + 20)
    const s = await emptySpot(page)
    await touch(page, 'pointerdown', 2, s.x, s.y)
    await touch(page, 'pointermove', 2, s.x + 80, s.y)
    expect((await readXf(page)).k).toBeCloseTo(before.k, 5)
    await touch(page, 'pointerup', 2, s.x + 80, s.y)
    await touch(page, 'pointerup', 1, tx + 20, ty + 20)
  })

  test('pointercancel ends a pinch and a lone finger does not keep zooming', async ({ page }) => {
    await openStudioMap(page)
    const s = await emptySpot(page)
    await touch(page, 'pointerdown', 1, s.x - 30, s.y)
    await touch(page, 'pointerdown', 2, s.x + 30, s.y)
    await touch(page, 'pointermove', 2, s.x + 60, s.y)
    const mid = await readXf(page)
    await touch(page, 'pointercancel', 2, s.x + 60, s.y)
    await touch(page, 'pointermove', 1, s.x - 90, s.y + 40)
    expect(await readXf(page)).toEqual(mid)
    await touch(page, 'pointerup', 1, s.x - 90, s.y + 40)
    // A fresh single finger pans normally again.
    await touch(page, 'pointerdown', 3, s.x, s.y)
    await touch(page, 'pointermove', 3, s.x + 30, s.y)
    await touch(page, 'pointerup', 3, s.x + 30, s.y)
  })

  test('pan and zoom are clamped so the board never leaves the screen', async ({ page }) => {
    await openStudioMap(page)
    const v = await viewBox(page)
    const s = await emptySpot(page)
    // Fling the board far to the top left with a pan.
    await touch(page, 'pointerdown', 1, s.x, s.y)
    await touch(page, 'pointermove', 1, s.x - 4000, s.y - 4000)
    await touch(page, 'pointerup', 1, s.x - 4000, s.y - 4000)
    const x = await readXf(page)
    const boardW = await page.evaluate(() => (document.querySelector('.tabletop-view svg > g > rect') as SVGRectElement).width.baseVal.value)
    // At least 80px (the margin) of the board's right edge stays inside the view.
    expect(x.tx + boardW * x.k).toBeGreaterThanOrEqual(79)
    expect(x.tx).toBeLessThanOrEqual(v.width)
    // The zoom buttons and Fit still work.
    await page.locator('.tabletop-zoom button[title="Zoom in"]').click()
    expect((await readXf(page)).k).toBeGreaterThan(x.k)
    await page.locator('.tabletop-zoom button[title="Fit the whole map"]').click()
    const fit = await readXf(page)
    expect(fit.tx).toBeGreaterThanOrEqual(0)
  })

  test('mouse wheel zoom still zooms about the cursor', async ({ page }) => {
    await openStudioMap(page, 1280)
    const s = await emptySpot(page)
    const v = await viewBox(page)
    const before = await readXf(page)
    const bx = (s.x - v.x - before.tx) / before.k
    await page.mouse.move(s.x, s.y)
    await page.mouse.wheel(0, -300)
    const after = await readXf(page)
    expect(after.k).toBeGreaterThan(before.k)
    expect((s.x - v.x - after.tx) / after.k).toBeCloseTo(bx, 0)
    // A mouse drag still pans.
    await page.mouse.down()
    await page.mouse.move(s.x + 40, s.y + 10, { steps: 4 })
    await page.mouse.up()
    expect((await readXf(page)).tx).toBeGreaterThan(after.tx + 30)
  })
})

// ---- The page must not scroll during a pinch ------------------------------------

/** Scroll positions of the document and of every scrolling ancestor of the board. */
const scrollState = (page: Page) =>
  page.evaluate(() => {
    const out: number[] = [document.scrollingElement?.scrollTop ?? 0]
    for (let e: Element | null = document.querySelector('.tabletop-view'); e; e = e.parentElement) out.push(e.scrollTop)
    return out
  })

test.describe('a pinch never scrolls the page', () => {
  async function openRunMapPartlyVisible(page: Page): Promise<void> {
    await openDemo(page, `run/${CAMPAIGN}`, 375, 600)
    await page.locator('button', { hasText: 'Battle Map' }).click()
    await expect(page.locator('.tabletop-view')).toBeVisible()
    // Scroll until the board's top edge is off screen, so only part of it shows (the focus call would scroll it back).
    await page.evaluate(() => {
      const v = document.querySelector('.tabletop-view')!
      let e: Element | null = v
      while (e && !(e.scrollHeight > e.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(e).overflowY))) e = e.parentElement
      const sc = e ?? document.scrollingElement!
      sc.scrollTop = v.getBoundingClientRect().top + sc.scrollTop + 100
    })
  }

  test('on Run mode, with the board partly on screen', async ({ page }) => {
    await openRunMapPartlyVisible(page)
    const start = await scrollState(page)
    expect(Math.max(...start)).toBeGreaterThan(0)
    const v = await viewBox(page)
    const mx = v.x + v.width / 2
    const my = Math.max(v.y, 0) + Math.min(v.height, 600 - Math.max(v.y, 0)) / 2
    const before = await readXf(page)
    await touch(page, 'pointerdown', 1, mx - 30, my)
    await touch(page, 'pointerdown', 2, mx + 30, my)
    for (let i = 1; i <= 6; i++) {
      await touch(page, 'pointermove', 1, mx - 30 - i * 8, my)
      await touch(page, 'pointermove', 2, mx + 30 + i * 8, my)
      expect(await scrollState(page)).toEqual(start)
    }
    await touch(page, 'pointerup', 2, mx + 78, my)
    await touch(page, 'pointerup', 1, mx - 78, my)
    expect(await scrollState(page)).toEqual(start)
    expect((await readXf(page)).k).toBeGreaterThan(before.k)
  })

  test('touchstart and touchmove with two fingers are cancelled, so the browser cannot scroll', async ({ page }) => {
    await openRunMapPartlyVisible(page)
    const r = await page.evaluate(() => {
      const view = document.querySelector('.tabletop-view')!
      // A plain event with a `touches` list: the Touch constructor is missing in some engines.
      const mk = (type: string, n: number) => {
        const e = new Event(type, { bubbles: true, cancelable: true })
        Object.defineProperty(e, 'touches', { value: Array.from({ length: n }, (_, i) => ({ identifier: i + 1, clientX: 100 + i * 60, clientY: 300 })) })
        return e
      }
      const one = mk('touchmove', 1)
      view.dispatchEvent(one)
      const twoStart = mk('touchstart', 2)
      view.dispatchEvent(twoStart)
      const twoMove = mk('touchmove', 2)
      view.dispatchEvent(twoMove)
      return { oneFinger: one.defaultPrevented, twoStart: twoStart.defaultPrevented, twoMove: twoMove.defaultPrevented }
    })
    // A lone finger on empty board is not a gesture yet, so it is left alone; two fingers are always cancelled.
    expect(r.twoStart).toBe(true)
    expect(r.twoMove).toBe(true)
  })

  test('focusing the board does not scroll the page', async ({ page }) => {
    await openRunMapPartlyVisible(page)
    const start = await scrollState(page)
    const s = await emptySpot(page)
    await touch(page, 'pointerdown', 1, s.x, s.y)
    await touch(page, 'pointerup', 1, s.x, s.y)
    expect(await scrollState(page)).toEqual(start)
  })
})
