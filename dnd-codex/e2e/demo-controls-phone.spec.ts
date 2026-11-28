import { test, expect } from './fixtures'

// T-117: on a phone, the open Demo controls panel (demo only) must stay clear of the left rail, the
// top bar, the turn strip, the zoom bar and the viewport edges, on the page and in full screen.
// Demo data only: no sign-in and no Supabase request. Set DEMO_SHOTS=<dir> to save screenshots.

const SIZES = [
  { name: 'portrait 390x844', width: 390, height: 844 },
  { name: 'landscape 844x390', width: 844, height: 390 },
  { name: 'small landscape 667x375', width: 667, height: 375 },
]
const OBSTACLES = ['.player-live-bar', '.session-header', '.bm-turns', '.tabletop-zoom', '.pl-fs-hud']

for (const size of SIZES) {
  for (const full of [false, true]) {
    test(`demo controls clear the rail and bars (${size.name}${full ? ', full screen' : ''})`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.goto('/#/')
      await page.getByRole('button', { name: 'Try the live demo' }).click()
      await page.getByTestId('demo-player-entry').click()
      await page.locator('.session-vtt').waitFor()
      if (full) {
        await page.getByRole('button', { name: 'Full screen' }).first().click()
        await expect(page.locator('.player-live-board.expanded')).toBeVisible()
      }
      const scope = full ? page.locator('.player-live-board.expanded') : page
      await scope.getByTestId('demo-controls-toggle').first().click()
      const body = scope.locator('.demo-ctl-body').first()
      await expect(body).toBeVisible()
      const shots = process.env.DEMO_SHOTS
      if (shots) await page.screenshot({ path: `${shots}/${size.width}x${size.height}${full ? '-full' : ''}.png` })

      const res = await page.evaluate((obstacles) => {
        const vw = window.innerWidth
        const vh = window.innerHeight
        const box = (el: Element) => {
          const r = el.getBoundingClientRect()
          return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }
        }
        const hit = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5
        const problems: string[] = []
        const panel = Array.from(document.querySelectorAll('.demo-ctl-body')).find((e) => (e as HTMLElement).offsetParent !== null || getComputedStyle(e).position === 'fixed')!
        const targets = [
          ...Array.from(panel.querySelectorAll('button, select')).filter((e) => (e as HTMLElement).offsetParent !== null),
          panel.closest('section')!.querySelector('[data-testid="demo-controls-toggle"]')!,
        ]
        const scroller = box(panel)
        const obs: [string, ReturnType<typeof box>][] = []
        for (const sel of obstacles)
          for (const el of Array.from(document.querySelectorAll(sel))) {
            if (panel.contains(el)) continue
            // In full screen the page behind is covered, so only the full screen board counts.
            if (document.querySelector('.player-live-board.expanded') && !el.closest('.player-live-board.expanded')) continue
            const b = box(el)
            if (b.w > 0 && b.h > 0 && getComputedStyle(el).visibility !== 'hidden') obs.push([sel, b])
          }
        // On the page the panel floats above the map's own bars, so there every control must be the
        // topmost thing at its centre (nothing covers it). In full screen the rail and zoom bar stay
        // usable, so the panel must also stay clear of them.
        const fullScreen = !!document.querySelector('.player-live-board.expanded')
        for (const el of targets) {
          // A control below the fold is reached by scrolling the panel.
          el.scrollIntoView({ block: 'nearest' })
          const r = el.getBoundingClientRect()
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          if (!top || !(el === top || el.contains(top) || top.contains(el))) problems.push(`${el.textContent || el.getAttribute('aria-label')} is covered by ${top?.className}`)
        }
        // The panel itself must be inside the viewport and clear of the obstacles.
        if (scroller.l < -0.5 || scroller.t < -0.5 || scroller.r > vw + 0.5 || scroller.b > vh + 0.5) problems.push(`panel outside viewport ${JSON.stringify(scroller)}`)
        for (const [sel, b] of obs) if ((fullScreen || sel === '.session-header') && hit(scroller, b)) problems.push(`panel overlaps ${sel}`)
        // Every control, once scrolled into the panel, lies inside the panel, which is inside the viewport.
        for (const el of targets) {
          const b = box(el)
          const inPanel = panel.contains(el)
          if (inPanel && (b.l < scroller.l - 0.5 || b.r > scroller.r + 0.5)) problems.push(`${el.textContent || el.getAttribute('aria-label')} clipped horizontally`)
          if (!inPanel) {
            if (b.l < 0 || b.t < 0 || b.r > vw || b.b > vh) problems.push('toggle outside viewport')
            // On the page the pill lives in the session header (T-127), so only full screen has obstacles for it.
            for (const [sel, o] of obs) if (fullScreen && hit(b, o)) problems.push(`toggle overlaps ${sel}`)
          }
        }
        return problems
      }, OBSTACLES)
      expect(res).toEqual([])

      // Each button is reachable by scrolling the panel, and tapping it works.
      await body.getByTestId('demo-ping').scrollIntoViewIfNeeded()
      await body.getByTestId('demo-ask').click()
      await expect(body.getByTestId('demo-log')).not.toBeEmpty()
    })
  }
}
