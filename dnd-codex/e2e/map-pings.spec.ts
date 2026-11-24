import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// Map pings and colored cursors (T-102). The demo never opens a Realtime channel, so these
// tests cover the local preview: gestures, throttling, coordinates under zoom, the context
// menu, reduced motion, the preferences switch, and that no websocket opens. The real
// broadcast round trip needs two signed-in clients (see docs/design-exploration/map-pings.md).

async function openBoard(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto('/#/campaign/demo-campaign-0001/battlemap')
  await page.locator('.battlemap-maps .list-row').first().click()
  const board = page.locator('.tabletop-view').first()
  await expect(board).toBeVisible()
  const box = (await board.boundingBox())!
  // A spot in empty board space (away from tokens, which can sit mid-map).
  return { board, x: box.x + 40, y: box.y + 40, box }
}

const pings = (page: Page) => page.locator('.ping-layer .ping')
const cursors = (page: Page) => page.locator('.ping-layer .ping-cursor')

test.describe('map pings', () => {
  test('a single right click drops a ping where the pointer is', async ({ page }) => {
    const { x, y } = await openBoard(page)
    await page.mouse.click(x, y, { button: 'right' })
    await expect(pings(page)).toHaveCount(1)
    const ring = (await pings(page).locator('.ping-ring').last().boundingBox())!
    // The ring grows around the click point, so its center is the click.
    expect(Math.abs(ring.x + ring.width / 2 - x)).toBeLessThan(3)
    expect(Math.abs(ring.y + ring.height / 2 - y)).toBeLessThan(3)
    await expect(page.locator('.ping-layer .ping-tag-text')).toHaveText('You')
    await expect(pings(page)).toHaveCount(0, { timeout: 10_000 }) // fades out
  })

  test('right-drag shows a cursor and drops no ping', async ({ page }) => {
    const { x, y } = await openBoard(page)
    await page.mouse.move(x, y)
    await page.mouse.down({ button: 'right' })
    for (let i = 1; i <= 8; i++) await page.mouse.move(x + i * 15, y + i * 8)
    await expect(cursors(page)).toHaveCount(1)
    await page.mouse.up({ button: 'right' })
    await expect(pings(page)).toHaveCount(0)
    await expect(cursors(page).first()).toHaveClass(/ending/)
    await expect(cursors(page)).toHaveCount(0, { timeout: 10_000 })
  })

  test('a left drag pans and sends nothing', async ({ page }) => {
    const { x, y } = await openBoard(page)
    const before = await page.locator('.tabletop-view svg > g').first().getAttribute('transform')
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 60, y + 40, { steps: 6 })
    await page.mouse.up()
    const after = await page.locator('.tabletop-view svg > g').first().getAttribute('transform')
    expect(after).not.toBe(before)
    await expect(pings(page)).toHaveCount(0)
    await expect(cursors(page)).toHaveCount(0)
  })

  test('the browser context menu is blocked on the map only', async ({ page }) => {
    const { x, y } = await openBoard(page)
    const onMap = await page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px, py)!
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: px, clientY: py })
      el.dispatchEvent(ev)
      return ev.defaultPrevented
    }, [x, y])
    expect(onMap).toBe(true)
    const offMap = await page.evaluate(() => {
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      document.body.dispatchEvent(ev)
      return ev.defaultPrevented
    })
    expect(offMap).toBe(false)
  })

  test('ten fast right clicks send one ping (300 ms throttle)', async ({ page }) => {
    const { x, y } = await openBoard(page)
    // Count every ring ever added: slow clicks would let the first one expire.
    await page.evaluate(() => {
      ;(window as unknown as { __added: number }).__added = 0
      new MutationObserver((ms) => {
        for (const m of ms) m.addedNodes.forEach((n) => (n as Element).classList?.contains('ping') && ((window as unknown as { __added: number }).__added += 1))
      }).observe(document.querySelector('.ping-layer')!, { childList: true })
    })
    // Ten right clicks inside one task, so machine load cannot spread them past the throttle.
    await page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px, py)!
      for (let i = 0; i < 10; i++) {
        const o = { bubbles: true, cancelable: true, pointerType: 'mouse', pointerId: 1, button: 2, buttons: 2, clientX: px, clientY: py }
        el.dispatchEvent(new PointerEvent('pointerdown', o))
        el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }))
      }
    }, [x, y])
    await page.waitForFunction(() => (window as unknown as { __added: number }).__added >= 1)
    expect(await page.evaluate(() => (window as unknown as { __added: number }).__added)).toBe(1)
  })

  test('the drag marker is a circle with a trail, not an arrow', async ({ page }) => {
    const { x, y } = await openBoard(page)
    await page.mouse.move(x, y)
    await page.mouse.down({ button: 'right' })
    for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 15, y + i * 8)
    await expect(cursors(page).locator('circle.ping-dot-mark')).toHaveCount(1)
    await expect(cursors(page).locator('path')).toHaveCount(0)
    await expect(cursors(page).locator('.ping-trail').first()).toBeAttached()
    await page.mouse.up({ button: 'right' })
  })

  test('reduced motion draws the drag circle without a trail', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const { x, y } = await openBoard(page)
    await page.mouse.move(x, y)
    await page.mouse.down({ button: 'right' })
    for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 15, y + i * 8)
    await expect(cursors(page).locator('circle.ping-dot-mark')).toHaveCount(1)
    await expect(cursors(page).locator('.ping-trail')).toHaveCount(0)
    await page.mouse.up({ button: 'right' })
  })

  test('a ping burst allows ten pings in a window, then stops', async ({ page }) => {
    const { x, y } = await openBoard(page)
    await page.evaluate(() => {
      ;(window as unknown as { __added: number }).__added = 0
      new MutationObserver((ms) => {
        for (const m of ms) m.addedNodes.forEach((n) => (n as Element).classList?.contains('ping') && ((window as unknown as { __added: number }).__added += 1))
      }).observe(document.querySelector('.ping-layer')!, { childList: true })
    })
    for (let i = 0; i < 12; i++) {
      await page.mouse.click(x, y, { button: 'right' })
      await page.waitForTimeout(320)
    }
    expect(await page.evaluate(() => (window as unknown as { __added: number }).__added)).toBe(10)
  })

  test('a ping lands on the click point after zooming in', async ({ page }) => {
    const { x, y, box } = await openBoard(page)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -400)
    await page.mouse.click(x + 100, y + 60, { button: 'right' })
    await expect(pings(page)).toHaveCount(1)
    const ring = (await pings(page).locator('.ping-ring').last().boundingBox())!
    expect(Math.abs(ring.x + ring.width / 2 - (x + 100))).toBeLessThan(3)
    expect(Math.abs(ring.y + ring.height / 2 - (y + 60))).toBeLessThan(3)
  })

  test('the P key pings at the pointer', async ({ page }) => {
    const { board, x, y } = await openBoard(page)
    await board.focus()
    await page.mouse.move(x + 20, y + 20)
    await page.keyboard.press('p')
    await expect(pings(page)).toHaveCount(1)
    await expect(page.getByRole('status').filter({ hasText: /./ })).toHaveCount(0) // local pings are not announced
  })

  test('the Ping tool pings on a left click and does not pan', async ({ page }) => {
    const { x, y } = await openBoard(page)
    await page.getByRole('button', { name: /Ping$/ }).click()
    const before = await page.locator('.tabletop-view svg > g').first().getAttribute('transform')
    await page.mouse.click(x + 30, y + 30)
    await expect(pings(page)).toHaveCount(1)
    expect(await page.locator('.tabletop-view svg > g').first().getAttribute('transform')).toBe(before)
  })

  test('reduced motion shows a static ring', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const { x, y } = await openBoard(page)
    await page.mouse.click(x, y, { button: 'right' })
    await expect(pings(page)).toHaveCount(1)
    const name = await pings(page).locator('.ping-ring').first().evaluate((el) => getComputedStyle(el).animationName)
    expect(name).toBe('none')
  })

  test('turning pings off in the board menu stops pings and frees the context menu', async ({ page }) => {
    const { x, y } = await openBoard(page)
    await page.getByRole('button', { name: 'Ping and cursor settings' }).click()
    await page.getByLabel('Show pings and cursors').uncheck()
    await page.mouse.click(x, y, { button: 'right' })
    await expect(pings(page)).toHaveCount(0)
    const prevented = await page.evaluate(([px, py]) => {
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
      document.elementFromPoint(px, py)!.dispatchEvent(ev)
      return ev.defaultPrevented
    }, [x, y])
    expect(prevented).toBe(false)
    await page.evaluate(() => localStorage.removeItem('dndcodex.mapPings'))
  })

  test('the demo opens no websocket and makes no Supabase request', async ({ page, supabaseRequests }) => {
    let sockets = 0
    // The dev server's own hot-reload socket is local; any other socket is a leak.
    page.on('websocket', (ws) => {
      if (!/localhost/.test(ws.url())) sockets++
    })
    const { x, y } = await openBoard(page)
    await page.mouse.click(x, y, { button: 'right' })
    await expect(pings(page)).toHaveCount(1)
    expect(sockets).toBe(0)
    expect(supabaseRequests).toEqual([])
  })

  test('touch: a long press pings; a quick move (pan) or a second finger does not', async ({ page }) => {
    const { x, y } = await openBoard(page)
    const fire = (type: string, id: number, px: number, py: number, primary = true) =>
      page.evaluate(
        ([t, i, ex, ey, pr]) => {
          const el = document.elementFromPoint(ex as number, ey as number)!
          el.dispatchEvent(new PointerEvent(t as string, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: i as number, isPrimary: pr as boolean, button: 0, buttons: t === 'pointerup' ? 0 : 1, clientX: ex as number, clientY: ey as number }))
        },
        [type, id, px, py, primary],
      )
    // Long press, no movement: ping.
    await fire('pointerdown', 7, x, y)
    await page.waitForTimeout(550)
    await fire('pointerup', 7, x, y)
    await expect(pings(page)).toHaveCount(1)
    await expect(pings(page)).toHaveCount(0, { timeout: 10_000 })
    // Move before 400 ms: a pan, no ping.
    await fire('pointerdown', 8, x, y)
    await fire('pointermove', 8, x + 30, y + 30)
    await page.waitForTimeout(550)
    await fire('pointerup', 8, x + 30, y + 30)
    await expect(pings(page)).toHaveCount(0)
    // A second finger cancels the long press (pinch wins).
    await fire('pointerdown', 9, x, y)
    await fire('pointerdown', 10, x + 50, y, false)
    await page.waitForTimeout(550)
    await fire('pointerup', 9, x, y)
    await expect(pings(page)).toHaveCount(0)
  })
})
