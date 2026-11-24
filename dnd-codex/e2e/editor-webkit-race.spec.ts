import { test, expect } from '@playwright/test'

// T-71: the campaign Overview intermittently crashed on load in Safari with
// "TypeError: null is not an object (evaluating 'e.cached')" (Chrome words it
// "Cannot read properties of null (reading 'cached')").
//
// Cause: tiptap's useEditor creates the editor while React renders and schedules its
// destruction 1 ms later, cancelling that only when the component's effects run. Safari
// sometimes flushes those effects more than 1 ms after the render, so the editor is
// already destroyed when RichTextEditor's own effect calls editor.getHTML(), which throws
// because a destroyed editor has no schema. Chromium's timing hides it, so this runs in
// WebKit only. The crash showed on about 10% of loads, so the test loads the demo
// Overview many times from a fresh browser context: with the bug it fails on all but
// about 1 run in 70.

const LOADS = 40
const PARALLEL = 4

test('the demo Overview loads without the editor crash, load after load (WebKit)', async ({ browser }) => {
  test.setTimeout(240_000)
  const crashes: string[] = []

  async function loadOnce(n: number) {
    const ctx = await browser.newContext()
    // The app is configured against a placeholder backend here; keep every call local.
    await ctx.route(/supabase\.co/, (r) => r.abort())
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error' && /cached/.test(m.text())) errors.push(m.text())
    })
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Try the live demo' }).click()
    await page.getByRole('heading', { name: 'The Hollow Crown', exact: true }).click()
    await page.locator('.ov-hero, :text("Something went wrong")').first().waitFor({ timeout: 20_000 })
    await page.waitForTimeout(1500) // let the editor effects run
    const text = await page.locator('main').innerText().catch(() => '')
    if (/Something went wrong/.test(text) || errors.length) crashes.push(`load ${n}: ${errors[0] ?? 'error page'}`)
    await ctx.close()
  }

  let next = 0
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < LOADS) await loadOnce(++next)
    }),
  )
  expect(crashes, `${crashes.length} of ${LOADS} loads crashed:\n${crashes.join('\n')}`).toEqual([])
})
