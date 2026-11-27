import { test, expect } from './fixtures'

// T-116: a condition cover (rim, art and name plate) must stay inside the token's ring at
// every zoom level, on the page and in full screen. Demo data only, so no sign-in is needed.

const SIZES = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
]

for (const size of SIZES) {
  test(`condition cover stays inside the token ring at several zooms and in full screen (${size.name})`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Try the live demo' }).click()
    await page.getByTestId('demo-player-entry').click()
    await page.locator('.session-vtt').waitFor()
    await page.getByTestId('demo-controls-toggle').click()
    await page.getByTestId('demo-start').click()
    await page.getByTestId('demo-target').selectOption({ label: 'Goblin' })
    await page.getByRole('button', { name: 'Toggle Prone' }).click()
    await page.getByTestId('demo-controls-toggle').click()

    // Cover box against the ring's inner edge (the ring is drawn centred on the token radius).
    const measure = (root: string) =>
      page.evaluate((sel) => {
        const img = document.querySelector(`${sel} .tabletop-cond-cover`) as SVGImageElement | null
        if (!img) return null
        const ring = img.parentElement!.querySelector('circle[fill="none"]') as SVGCircleElement
        const a = img.getBoundingClientRect()
        const b = ring.getBoundingClientRect()
        const scale = b.width / (2 * Number(ring.getAttribute('r')))
        const half = (Number(ring.getAttribute('stroke-width')) * scale) / 2
        return {
          overLeft: b.left + half - a.left,
          overRight: a.right - (b.right - half),
          overTop: b.top - a.top, // the flat edge sits on the centre line, so this is well inside
          overBottom: a.bottom - (b.bottom - half),
        }
      }, root)
    const expectInside = async (root: string, label: string) => {
      const m = await measure(root)
      expect(m, `${label}: cover is drawn`).not.toBeNull()
      for (const [side, over] of Object.entries(m!)) {
        if (side === 'overTop') continue
        expect(over, `${label}: cover ${side} (px past the ring's inner edge)`).toBeLessThanOrEqual(0.6)
      }
    }

    await expectInside('.session-vtt', 'page, default zoom')

    await page.getByRole('button', { name: 'Full screen' }).first().click()
    const board = '.player-live-board.expanded'
    await expect(page.locator(board)).toBeVisible()
    await expectInside(board, 'full screen, fit')
    await page.locator(board).getByTitle('Zoom in').click()
    await page.locator(board).getByTitle('Zoom in').click()
    await expectInside(board, 'full screen, zoomed in')
    await page.locator(board).getByTitle('Zoom out').click()
    await page.locator(board).getByTitle('Zoom out').click()
    await page.locator(board).getByTitle('Zoom out').click()
    await expectInside(board, 'full screen, zoomed out')
  })
}
