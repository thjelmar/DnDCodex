import { test, expect } from '@playwright/test'
import { LIVE, createTestUser, deleteTestUser, signInPage, cloudUserRecords, putCloudUserRecord, type TestUser } from './live'

// The saved Overview layout syncs through the account-level user_records channel (T-88).
// Needs a local Supabase stack: run `npm run e2e:live`. Skipped in a normal `npm run e2e`.
const ID = '0b6f2f5e-7a1c-4c3e-9d52-6f1a8e4c0001' // OVERVIEW_LAYOUT_ID

test.describe('Overview layout sync (live backend)', () => {
  test.skip(!LIVE, 'Needs a local Supabase stack. Run `npm run e2e:live`. See e2e/README.md.')

  let user: TestUser
  test.beforeEach(async ({ page }) => {
    user = await createTestUser()
    await signInPage(page, user)
    await page.addInitScript(() => {
      ;(window as unknown as { __load: (p: string) => Promise<unknown> }).__load = (p: string) => import(/* @vite-ignore */ p)
    })
  })
  test.afterEach(async () => {
    await deleteTestUser(user)
  })

  const titles = (page: import('@playwright/test').Page) =>
    page.locator('.ov-bento > .ov-cell').evaluateAll((els) => els.map((e) => (e.querySelector('h3')?.textContent ?? '').trim()))

  async function openOverview(page: import('@playwright/test').Page) {
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Start a campaign' }).click()
    await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Layout Sync ${Date.now()}`)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
    await expect(page.locator('.ov-hubcard')).toHaveCount(4)
  }

  test('a saved layout reaches the cloud as one record, and Reset sends a tombstone', async ({ page }) => {
    await openOverview(page)
    await page.evaluate(async () => {
      const w = window as unknown as { __load: (p: string) => Promise<{ saveOverviewLayout: (l: unknown) => Promise<void> }> }
      await (await w.__load('/src/db/repo.ts')).saveOverviewLayout({ cards: [{ id: 'run', span: 12 }], hidden: ['world'] })
    })
    await expect
      .poll(async () => (await cloudUserRecords(user.id, 'overviewLayout')).filter((r) => !r.deleted).length, { timeout: 20_000 })
      .toBe(1)
    const [rec] = await cloudUserRecords(user.id, 'overviewLayout')
    expect(rec.id).toBe(ID)
    expect(rec.data.cards).toEqual([{ id: 'run', span: 12 }])
    expect(rec.data.hidden).toEqual(['world'])

    await page.evaluate(async () => {
      const w = window as unknown as { __load: (p: string) => Promise<{ resetOverviewLayout: () => Promise<void> }> }
      await (await w.__load('/src/db/repo.ts')).resetOverviewLayout()
    })
    await expect
      .poll(async () => (await cloudUserRecords(user.id, 'overviewLayout'))[0]?.deleted, { timeout: 20_000 })
      .toBe(true)
  })

  test('a layout saved on another device is pulled and honored on sign-in', async ({ page }) => {
    await putCloudUserRecord(user.id, 'overviewLayout', ID, {
      id: ID,
      version: 1,
      cards: [{ id: 'recent-sessions', span: 12 }, { id: 'prep', span: 6 }],
      hidden: [],
      knownIds: ['world', 'next', 'prep', 'run', 'lore', 'reference', 'recent-sessions', 'prep-checklist', 'recently-edited', 'links-voice'],
      updatedAt: new Date().toISOString(),
    })
    await page.goto('/#/')
    await page.getByRole('button', { name: 'Start a campaign' }).click()
    await page.getByPlaceholder('Curse of the Shattered Crown').fill(`E2E Layout Pull ${Date.now()}`)
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
    await expect.poll(() => titles(page), { timeout: 20_000 }).toEqual(['Recent sessions', 'Prep'])
  })
})
