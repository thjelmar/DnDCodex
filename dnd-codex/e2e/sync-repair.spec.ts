import { test, expect } from '@playwright/test'
import { LIVE, createTestUser, deleteTestUser, signInPage, cloudRecords, localCount, dropLocal, type TestUser } from './live'

// Sync delete (T-14) and Repair sync (T-29) against a LIVE backend. Run them with
// `npm run e2e:live`: that starts nothing itself, so a local Supabase stack must be
// up (`supabase start`). Each test creates a throwaway user, injects its session into
// the browser, and deletes the user (and its campaigns) afterwards. The scripts refuse
// any non-loopback backend. In a normal `npm run e2e` these tests skip.
test.describe('sync delete and Repair sync (live backend)', () => {
  test.skip(!LIVE, 'Needs a local Supabase stack. Run `npm run e2e:live`. See e2e/README.md.')

  let user: TestUser
  test.beforeEach(async ({ page }) => {
    user = await createTestUser()
    await signInPage(page, user)
  })
  test.afterEach(async () => {
    await deleteTestUser(user)
  })

  /** Creates a campaign and one NPC through the UI; waits until both are in the cloud. */
  async function seed(page: import('@playwright/test').Page) {
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Start a campaign' }).click()
    await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Sync ${Date.now()}`)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
    const campaignId = new URL(page.url()).hash.split('/')[2]
    await page.goto(`/#/campaign/${campaignId}/npcs`)
    await page.getByRole('button', { name: 'New NPC' }).click()
    await expect.poll(() => localCount(page, 'npcs', campaignId)).toBe(1)
    await expect
      .poll(async () => (await cloudRecords(campaignId, 'npc')).filter((r) => !r.deleted).length, { timeout: 20_000 })
      .toBe(1)
    return campaignId
  }

  test('a locally deleted record does not come back after a pull', async ({ page }) => {
    const campaignId = await seed(page)
    const [npc] = await cloudRecords(campaignId, 'npc')

    // Hold every write to `records` so the tombstone stays in the outbox while a pull runs.
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    await page.route('**/rest/v1/records*', async (route) => {
      if (route.request().method() === 'GET') return route.continue()
      await gate
      return route.continue()
    })

    // Delete the NPC in the UI. The auto-sync pulls (the cloud still has it live), then
    // its push is held. Wait for that pull to finish.
    const pulled = page.waitForResponse(
      (r) => r.url().includes('/rest/v1/records') && r.request().method() === 'GET' && r.url().includes('updated_at'),
      { timeout: 15_000 },
    )
    await page.getByRole('button', { name: 'Delete NPC' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await pulled
    await page.waitForTimeout(500) // let applyRows finish

    expect((await cloudRecords(campaignId, 'npc'))[0].deleted).toBe(false) // tombstone has not landed
    expect(await localCount(page, 'npcs', campaignId)).toBe(0) // and the pull did not resurrect it

    // Let the tombstone through: the cloud row is now deleted, and the NPC stayed gone.
    release()
    await expect
      .poll(async () => (await cloudRecords(campaignId, 'npc')).find((r) => r.id === npc.id)?.deleted, { timeout: 20_000 })
      .toBe(true)
    expect(await localCount(page, 'npcs', campaignId)).toBe(0)
  })

  test('Repair sync restores a live record that is missing locally', async ({ page }) => {
    const campaignId = await seed(page)

    // Simulate a dropped local copy: remove the row from IndexedDB only (no tombstone).
    await dropLocal(page, 'npcs', campaignId)
    expect(await localCount(page, 'npcs', campaignId)).toBe(0)
    expect((await cloudRecords(campaignId, 'npc')).filter((r) => !r.deleted)).toHaveLength(1)

    await page.goto('/#/backup')
    await page.getByRole('button', { name: /Repair sync/ }).click()
    await expect(page.getByText(/Re-synced 1 campaign/)).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => localCount(page, 'npcs', campaignId)).toBe(1)
  })
})
