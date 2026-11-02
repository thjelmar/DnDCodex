import { test, expect } from './fixtures'

// Demo mode must never touch Supabase (#86). Each demo surface is loaded in turn.
// For each one we clear the resource timings, navigate, and then read
// performance.getEntriesByType('resource') and check for any supabase.co entry.

const DEMO_HOST = 'e2e-placeholder.supabase.co'

// Hash routes to visit in demo mode. :id is the demo campaign's id.
function surfaces(id: string): { name: string; hash: string }[] {
  return [
    { name: 'home', hash: '#/' },
    { name: 'campaigns', hash: '#/campaigns' },
    { name: 'campaign overview', hash: `#/campaign/${id}` },
    { name: 'sessions', hash: `#/campaign/${id}/sessions` },
    { name: 'NPCs', hash: `#/campaign/${id}/npcs` },
    { name: 'locations', hash: `#/campaign/${id}/locations` },
    { name: 'battle map', hash: `#/campaign/${id}/battlemap` },
    { name: 'run mode', hash: `#/run/${id}` },
    { name: 'player notes', hash: `#/player/${id}` },
    { name: 'player session', hash: `#/player/${id}/session` },
    { name: 'backup', hash: '#/backup' },
    { name: 'changelog', hash: '#/changelog' },
    { name: 'roadmap', hash: '#/roadmap' },
    { name: 'generators', hash: '#/tools/generators' },
  ]
}

async function supabaseEntries(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((name) => name.includes('supabase.co')),
  )
}

test.describe('demo mode makes zero supabase.co requests', () => {
  test('every demo surface, checked with performance.getEntriesByType', async ({ page, supabaseRequests }) => {
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Try the live demo' }).click()

    // Entering the demo reloads into the demo database. Wait for its banner.
    await expect(page.locator('.demo-banner')).toBeVisible()
    await page.locator('.home-ccard').first().click()
    await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
    const campaignId = new URL(page.url()).hash.split('/')[2]

    // Positive control: prove the detector sees a supabase.co request when one
    // happens. Without this, an empty result could just mean the check is blind.
    await page.evaluate((host) => fetch(`https://${host}/rest/v1/`).catch(() => {}), DEMO_HOST)
    await expect.poll(async () => (await supabaseEntries(page)).length).toBeGreaterThan(0)
    expect(supabaseRequests.length, 'the control request should have been intercepted').toBeGreaterThan(0)
    supabaseRequests.length = 0

    for (const surface of surfaces(campaignId)) {
      await page.evaluate(() => performance.clearResourceTimings())
      // A string expression: the e2e tsconfig has no DOM lib, so `location` is untyped here.
      await page.evaluate(`if (location.hash !== ${JSON.stringify(surface.hash)}) location.hash = ${JSON.stringify(surface.hash)}`)
      // Hash navigation has no load event, so give the route a moment to render and fetch.
      await page.waitForTimeout(600)
      const entries = await supabaseEntries(page)
      expect(entries, `demo surface "${surface.name}" must not touch supabase.co`).toEqual([])
    }

    expect(supabaseRequests, 'no demo request may reach the Supabase host').toEqual([])
  })
})
