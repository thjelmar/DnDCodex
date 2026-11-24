import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// T-112: the player's session matches the DM's Run Mode. Rail icons are centered, the back button
// sits where the DM's does, and the side panel unlocks, re-docks, pops out and closes. Demo only:
// the faux live session is in memory, with no sign-in and no Supabase request.

const PLAYER = '/#/player/demo-player-campaign-0001/session'
const DM = '/#/run/demo-campaign-0001'

async function open(page: Page, url: string, size = { width: 1440, height: 900 }) {
  await page.setViewportSize(size)
  await page.addInitScript(() => sessionStorage.setItem('codex-demo', '1'))
  await page.goto(url)
  await expect(page.locator('.tabletop-view')).toBeVisible()
}

/** Offsets of each tool's icon center from its button's center, and of each button from the rail's. */
async function centerOffsets(page: Page, rail: string, tool: string) {
  return page.evaluate(
    ([railSel, toolSel]) => {
      const bar = document.querySelector(railSel)!.getBoundingClientRect()
      const out: { name: string; icon: number[]; button: number[]; size: number[] }[] = []
      for (const b of Array.from(document.querySelectorAll<HTMLElement>(`${railSel} ${toolSel}`))) {
        const r = b.getBoundingClientRect()
        if (r.width === 0) continue
        const g = (b.querySelector('svg') ?? b.querySelector('.player-color-dot')) as HTMLElement | SVGElement
        const i = g.getBoundingClientRect()
        out.push({
          name: b.getAttribute('aria-label') ?? '',
          icon: [i.left + i.width / 2 - (r.left + r.width / 2), i.top + i.height / 2 - (r.top + r.height / 2)],
          button: [r.left + r.width / 2 - (bar.left + bar.width / 2), 0],
          size: [r.width, r.height],
        })
      }
      return { railWidth: bar.width, tools: out }
    },
    [rail, tool],
  )
}

function expectCentered(o: Awaited<ReturnType<typeof centerOffsets>>) {
  expect(o.tools.length).toBeGreaterThanOrEqual(4)
  for (const t of o.tools) {
    expect(Math.abs(t.icon[0]), `${t.name} icon, horizontal`).toBeLessThanOrEqual(1)
    expect(Math.abs(t.icon[1]), `${t.name} icon, vertical`).toBeLessThanOrEqual(1)
    expect(Math.abs(t.button[0]), `${t.name} button in the rail`).toBeLessThanOrEqual(1)
  }
}

test.describe('player rail', () => {
  test('icons are centered, and the rail has the DM rail geometry', async ({ page }) => {
    await open(page, DM)
    const dm = await centerOffsets(page, '.bm-rail', '.bm-tool')
    await page.goto(PLAYER)
    await expect(page.locator('.player-live-bar .bm-tool').first()).toBeVisible()
    const pl = await centerOffsets(page, '.player-live-bar', '.bm-tool')
    expectCentered(pl)
    // Same tool size and the same rail width as Run Mode (the player's rail has a 1px border).
    expect(pl.tools[0].size).toEqual(dm.tools[0].size)
    expect(pl.railWidth).toBe(dm.railWidth)
  })

  test('full screen keeps the rail centered on desktop', async ({ page }) => {
    await open(page, PLAYER)
    await page.getByTestId('map-fullscreen').first().click()
    await expect(page.locator('.player-live-board.expanded')).toBeVisible()
    expectCentered(await centerOffsets(page, '.player-live-bar', '.bm-tool'))
  })

  test('full screen on a phone in landscape keeps the rail centered', async ({ page }) => {
    await open(page, PLAYER, { width: 844, height: 390 })
    await page.getByTestId('map-fullscreen').first().click()
    await expect(page.locator('.player-live-board.expanded')).toBeVisible()
    expectCentered(await centerOffsets(page, '.player-live-bar', '.bm-tool'))
  })

  test('a tablet and a phone keep the icons centered in their buttons', async ({ page }) => {
    await open(page, PLAYER, { width: 820, height: 1100 })
    const t = await centerOffsets(page, '.player-live-bar', '.bm-tool')
    for (const x of t.tools) {
      expect(Math.abs(x.icon[0])).toBeLessThanOrEqual(1)
      expect(Math.abs(x.icon[1])).toBeLessThanOrEqual(1)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    const p = await centerOffsets(page, '.player-live-bar', '.bm-tool')
    for (const x of p.tools) {
      expect(Math.abs(x.icon[0])).toBeLessThanOrEqual(1)
      expect(Math.abs(x.icon[1])).toBeLessThanOrEqual(1)
    }
  })
})

test.describe('back button', () => {
  test('sits first in the top bar on the DM and player pages and goes back', async ({ page }) => {
    await open(page, DM)
    const dmBack = page.getByRole('link', { name: 'Exit run mode' })
    const d = (await dmBack.boundingBox())!
    await page.goto(PLAYER)
    const back = page.getByTestId('session-back')
    await expect(back).toBeVisible()
    const p = (await back.boundingBox())!
    expect(p.width).toBe(d.width)
    expect(p.height).toBe(d.height)
    // Both are the first control after the app's left navigation (the DM page's bar is flush at the left).
    const title = (await page.locator('.session-header .run-title').boundingBox())!
    expect(p.x).toBeLessThan(title.x)
    expect(Math.abs(p.y + p.height / 2 - (title.y + title.height / 2))).toBeLessThanOrEqual(6)
    // In the demo it goes Home; the DM's goes to its campaign.
    await back.click()
    await expect(page).toHaveURL(/#\/$/)
    await page.goto(DM)
    await dmBack.click()
    await expect(page).toHaveURL(/#\/campaign\//)
  })

  test('full screen has one exit, and the back button still works from a phone', async ({ page }) => {
    await open(page, PLAYER, { width: 390, height: 844 })
    await expect(page.getByTestId('session-back')).toBeVisible()
    await page.getByTestId('map-fullscreen').first().click()
    await expect(page.getByRole('button', { name: 'Exit full screen' })).toHaveCount(1)
    await page.getByRole('button', { name: 'Exit full screen' }).click()
    await page.getByTestId('session-back').click()
    await expect(page).toHaveURL(/#\/$/)
  })
})

test.describe('session panel', () => {
  const panel = (page: Page) => page.getByTestId('bm-inspector')
  const mapWidth = async (page: Page) => (await page.locator('.session-map .tabletop-view').boundingBox())!.width

  test('unlock floats the panel over the map and gives the width back; dock restores it', async ({ page }) => {
    await open(page, PLAYER)
    await expect(panel(page)).toHaveClass(/bm-insp-docked/)
    const docked = await mapWidth(page)
    await panel(page).getByRole('button', { name: 'Float the panel over the map' }).click()
    await expect(panel(page)).toHaveClass(/bm-insp-float/)
    const floating = await mapWidth(page)
    expect(floating).toBeGreaterThan(docked + 200)
    // The header drags it, and the position is remembered across a dock and float.
    const hd = panel(page).locator('.bm-insp-hd')
    const before = (await panel(page).boundingBox())!
    const h = (await hd.boundingBox())!
    await page.mouse.move(h.x + 20, h.y + 10)
    await page.mouse.down()
    await page.mouse.move(h.x - 140, h.y + 90, { steps: 6 })
    await page.mouse.up()
    const moved = (await panel(page).boundingBox())!
    expect(moved.x).toBeLessThan(before.x - 100)
    await panel(page).getByRole('button', { name: 'Dock the panel' }).click()
    await expect(panel(page)).toHaveClass(/bm-insp-docked/)
    expect(Math.abs((await mapWidth(page)) - docked)).toBeLessThanOrEqual(2)
    await panel(page).getByRole('button', { name: 'Float the panel over the map' }).click()
    const again = (await panel(page).boundingBox())!
    expect(Math.abs(again.x - moved.x)).toBeLessThanOrEqual(2)
  })

  test('closing reserves no width, and the rail button reopens it', async ({ page }) => {
    await open(page, PLAYER)
    const docked = await mapWidth(page)
    await panel(page).getByRole('button', { name: 'Hide the panel' }).click()
    await expect(panel(page)).toHaveCount(0)
    expect(await mapWidth(page)).toBeGreaterThan(docked + 200)
    await page.getByTestId('page-panel-toggle').click()
    await expect(panel(page)).toHaveClass(/bm-insp-docked/)
  })

  test('a phone keeps the panel docked, with no float or pop-out', async ({ page }) => {
    await open(page, PLAYER, { width: 390, height: 844 })
    await expect(panel(page)).toHaveClass(/bm-insp-docked/)
    await expect(panel(page).getByRole('button', { name: /Float the panel|own window|Hide the panel/ })).toHaveCount(0)
  })

  test('full screen floats and docks the same panel', async ({ page }) => {
    await open(page, PLAYER)
    await page.getByTestId('map-fullscreen').first().click()
    await expect(page.getByTestId('fs-panel')).toBeVisible()
    await panel(page).getByRole('button', { name: 'Float the panel over the map' }).click()
    await expect(panel(page)).toHaveClass(/bm-insp-float/)
    await expect(page.getByTestId('fs-panel')).toHaveCount(0)
    await page.getByTestId('fs-panel-toggle').click()
    await expect(panel(page)).toHaveCount(0)
    await page.getByTestId('fs-panel-toggle').click()
    await expect(panel(page)).toHaveClass(/bm-insp-float/)
  })

  test('the popped-out window shows the live session, takes notes, and closing it docks the panel', async ({ page, supabaseRequests }) => {
    await page.addInitScript(() => delete (window as unknown as Record<string, unknown>).documentPictureInPicture)
    await open(page, PLAYER)
    const popupPromise = page.waitForEvent('popup')
    await panel(page).getByRole('button', { name: 'Open the panel in its own window' }).click()
    const popup = await popupPromise
    await expect(popup.getByTestId('bm-inspector')).toBeVisible()
    await expect(page.getByTestId('bm-inspector-stub')).toBeVisible()
    await expect(page.getByTestId('bm-inspector')).toHaveCount(0)

    // Live state: the page's demo DM asks for initiative and the popup shows it at once.
    await page.getByTestId('demo-controls-toggle').click()
    await page.getByTestId('demo-ask').click()
    await expect(popup.getByTestId('initiative-badge')).toBeVisible()

    // Notes typed in the window are saved, and are still there when the panel docks again.
    await popup.getByRole('tab', { name: 'Notes' }).click()
    const editor = popup.locator('.ProseMirror')
    await editor.click()
    await popup.keyboard.type('Popout note T112')
    await expect(editor).toContainText('Popout note T112')
    await popup.close()
    await expect(page.getByTestId('bm-inspector-stub')).toHaveCount(0)
    await expect(panel(page)).toHaveClass(/bm-insp-docked/)
    await panel(page).getByRole('tab', { name: 'Notes' }).click()
    await expect(panel(page).locator('.ProseMirror')).toContainText('Popout note T112')
    expect(supabaseRequests).toEqual([])
  })
})
