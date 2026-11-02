import { test, expect } from './fixtures'

// Signed out, Run mode must not read `live_sessions` from Supabase (T-53). The
// placeholder backend is configured, so the old code fetched it anyway. The
// fixture aborts every *.supabase.co request and records its URL, so this test
// checks the recorded list for any live_sessions request.

test.describe('run mode, signed out', () => {
  test('makes no live_sessions request', async ({ page, supabaseRequests }) => {
    const campaignName = `E2E Run ${Date.now()}`

    // A local campaign, created signed out.
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Start a campaign' }).click()
    await page.getByPlaceholder('Curse of the Shattered Crown').fill(campaignName)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
    const campaignId = new URL(page.url()).hash.split('/')[2]

    // Forget any requests made while creating the campaign; only Run mode counts.
    supabaseRequests.length = 0

    await page.goto(`/#/run/${campaignId}`)
    await expect(page.getByRole('tab', { name: /Battle Map/ })).toBeVisible()
    // The live-session read starts on mount. Give it time to fire before checking.
    await page.waitForTimeout(1000)

    const liveReads = supabaseRequests.filter((url) => url.includes('/live_sessions'))
    expect(liveReads, 'signed-out Run mode must not read live_sessions').toEqual([])
  })
})
