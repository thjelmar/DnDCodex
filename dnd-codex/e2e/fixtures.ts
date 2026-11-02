import { test as base, expect } from '@playwright/test'

// Shared test fixtures. `supabaseRequests` collects every request the page tries
// to send to a *.supabase.co host. Those requests are aborted, so no test ever
// reaches a real backend, and a test can assert that the list is empty.
export const SUPABASE_HOST = /\.supabase\.co\//

export const test = base.extend<{ supabaseRequests: string[] }>({
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
