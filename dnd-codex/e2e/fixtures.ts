import { test as base, expect } from '@playwright/test'

// Shared test fixtures. `supabaseRequests` collects every request the page tries
// to send to a *.supabase.co host. Those requests are aborted, so no test ever
// reaches a real backend, and a test can assert that the list is empty.
export const SUPABASE_HOST = /\.supabase\.co\//

export const test = base.extend<{ supabaseRequests: string[]; skipRevealWarning: boolean }>({
  // The DM's "NPCs become visible" warning (T-100) shows in the demo. Most specs start
  // combats and are not about it, so it is skipped by default; a spec that tests the
  // warning sets `test.use({ skipRevealWarning: false })`.
  skipRevealWarning: [true, { option: true }],
  page: async ({ page, skipRevealWarning }, use) => {
    if (skipRevealWarning) {
      await page.addInitScript(() => {
        try {
          localStorage.setItem('codex.confirmSkip.combat-reveal', '1')
        } catch {
          /* storage blocked: nothing to skip */
        }
      })
    }
    await use(page)
  },
  supabaseRequests: async ({ page }, use) => {
    const hits: string[] = []
    await page.route(SUPABASE_HOST, (route) => {
      hits.push(route.request().url())
      return route.abort()
    })
    await use(hits)
  },
})

export { expect }
