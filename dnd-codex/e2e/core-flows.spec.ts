import { test, expect } from './fixtures'

// Local-first path: no account, no backend. Everything here writes to IndexedDB
// only, so it runs on any machine with no credentials.
//
// Known gap: with the placeholder backend configured, Run mode still reads
// `live_sessions` from Supabase while signed out. The requests are aborted by the
// fixture and the test passes. Demo mode is clean (demo-isolation.spec.ts).

test.describe('core flows (local, signed out)', () => {
  test('create a campaign, a session, and a battle map, then keep them after reload', async ({ page }) => {
    const campaignName = `E2E Campaign ${Date.now()}`

    await page.goto('/#/')
    await page.getByRole('button', { name: 'Start a campaign' }).click()
    await page.getByPlaceholder('Curse of the Shattered Crown').fill(campaignName)
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    // Creating a campaign opens its overview at /campaign/:id.
    await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
    const campaignId = new URL(page.url()).hash.split('/')[2]
    expect(campaignId).toBeTruthy()
    await expect(page.getByRole('heading', { name: campaignName }).first()).toBeVisible()

    // Add a session from the Sessions tab.
    await page.goto(`/#/campaign/${campaignId}/sessions`)
    await page.getByRole('button', { name: 'New Session' }).click()
    await expect(page.getByText('Session 1').first()).toBeVisible()

    // A battle map is the live scene the DM shows to players. Create one from Run mode.
    await page.goto(`/#/run/${campaignId}`)
    await page.getByRole('tab', { name: /Battle Map/ }).click()
    await page.getByRole('button', { name: 'New battle map' }).click()
    await expect(page.getByRole('textbox', { name: 'Battle map name' })).toHaveValue('Battle Map 1')

    // Everything persists in IndexedDB across a reload.
    await page.reload()
    await page.goto(`/#/campaign/${campaignId}/sessions`)
    await expect(page.getByText('Session 1').first()).toBeVisible()
    await page.goto(`/#/run/${campaignId}`)
    await page.getByRole('tab', { name: /Battle Map/ }).click()
    await expect(page.getByRole('textbox', { name: 'Battle map name' })).toHaveValue('Battle Map 1')
  })
})
