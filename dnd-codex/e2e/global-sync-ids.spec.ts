import { test, expect, type Page } from '@playwright/test'
import { LIVE, createTestUser, deleteTestUser, signInPage, type TestUser } from './live'

// T-93: generator tables (keyed by slot) and Daily Duel history (keyed by day) must
// reach the account-level `user_records` table. Its `id` column is a uuid, so the
// client maps those keys to a deterministic uuid at the cloud boundary. Run with
// `npm run e2e:live`; skips in a normal `npm run e2e`.
const URL_ = process.env.E2E_SUPABASE_URL ?? ''
const SERVICE = process.env.E2E_SUPABASE_SERVICE_KEY ?? ''

interface CloudRow {
  kind: string
  id: string
  deleted: boolean
  data: Record<string, unknown>
}
async function userRecords(ownerId: string): Promise<CloudRow[]> {
  const r = await fetch(`${URL_}/rest/v1/user_records?owner_id=eq.${ownerId}&select=kind,id,deleted,data`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  })
  if (!r.ok) throw new Error(`user_records query failed: ${r.status}`)
  return (await r.json()) as CloudRow[]
}
const live = async (ownerId: string, kind: string) =>
  (await userRecords(ownerId)).filter((r) => r.kind === kind && !r.deleted)

const DAY = '2026-11-18'
const SLOT = 'tavern-name'

/** Waits for the app to be signed in and its global sync to have started. */
async function ready(page: Page) {
  await page.goto('/#/')
  await expect(page.getByRole('button', { name: 'Start a campaign' })).toBeVisible()
  await page.waitForTimeout(1500)
}

/** Edits a generator table and records a duel through the app's own repo functions. */
async function localEdits(page: Page, words: string[]) {
  await page.evaluate(
    async ([slot, day, w]) => {
      const repo = await import(/* @vite-ignore */ ('/src/db/repo.ts' as string))
      await repo.saveGenTable(slot as string, {
        entries: (w as string[]).map((text, i) => ({ id: `e${i}`, text, weight: 1 })) as never,
      })
      await repo.saveDuelResult({
        day: day as string, tier: 'standard', heroId: 'fighter', foeId: 'orc', outcome: 'won', rounds: 4,
        heroHpLeft: 9, heroHpMax: 20, dealt: 30, taken: 11, grid: [],
      } as never)
    },
    [SLOT, DAY, words],
  )
}

test.describe('global sync maps non-uuid keys to uuids (live backend)', () => {
  test.skip(!LIVE, 'Needs a local Supabase stack. Run `npm run e2e:live`. See e2e/README.md.')

  let user: TestUser
  test.beforeEach(async ({ page }) => {
    user = await createTestUser()
    await signInPage(page, user)
  })
  test.afterEach(async () => {
    await deleteTestUser(user)
  })

  test('a generator table and a duel record reach user_records, and a second device pulls them', async ({ page, browser }) => {
    await ready(page)
    await localEdits(page, ['The Gilded Boar'])

    await expect.poll(async () => (await live(user.id, 'genTable')).length, { timeout: 20_000 }).toBe(1)
    await expect.poll(async () => (await live(user.id, 'duelRecord')).length, { timeout: 20_000 }).toBe(1)
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    const [gen] = await live(user.id, 'genTable')
    const [duel] = await live(user.id, 'duelRecord')
    expect(gen.id).toMatch(uuid)
    expect(duel.id).toMatch(uuid)
    expect(gen.data.slot).toBe(SLOT)
    expect(duel.data.day).toBe(DAY)

    // Device 2: a fresh browser context with the same account pulls both records.
    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await signInPage(page2, user)
    await ready(page2)
    const local2 = () =>
      page2.evaluate(async ([slot, day]) => {
        const { db } = await import(/* @vite-ignore */ ('/src/db/db.ts' as string))
        const g = await db.genTables.get(slot as string)
        const d = await db.duelHistory.get(day as string)
        return { gen: g?.entries.map((e: { text: string }) => e.text) ?? null, duel: d?.outcome ?? null }
      }, [SLOT, DAY])
    await expect.poll(local2, { timeout: 20_000 }).toEqual({ gen: ['The Gilded Boar'], duel: 'won' })

    // An edit on device 2 flows back to device 1 and updates the same cloud row.
    await page2.evaluate(async ([slot]) => {
      const repo = await import(/* @vite-ignore */ ('/src/db/repo.ts' as string))
      await repo.saveGenTable(slot as string, { entries: [{ id: 'x', text: 'The Rusty Flagon', weight: 1 }] as never })
    }, [SLOT])
    await expect
      .poll(async () => ((await live(user.id, 'genTable'))[0]?.data.entries as { text: string }[])?.[0]?.text, { timeout: 20_000 })
      .toBe('The Rusty Flagon')
    expect(await live(user.id, 'genTable')).toHaveLength(1) // same cloud id, not a second row
    await ctx2.close()
  })

  test('a tombstone for a slot-keyed record syncs and removes the record on the other device', async ({ page, browser }) => {
    await ready(page)
    await localEdits(page, ['Soon gone'])
    await expect.poll(async () => (await live(user.id, 'genTable')).length, { timeout: 20_000 }).toBe(1)

    const ctx2 = await browser.newContext()
    const page2 = await ctx2.newPage()
    await signInPage(page2, user)
    await ready(page2)
    const has = (p: Page) =>
      p.evaluate(async ([slot]) => {
        const { db } = await import(/* @vite-ignore */ ('/src/db/db.ts' as string))
        return (await db.genTables.get(slot as string)) != null
      }, [SLOT])
    await expect.poll(() => has(page2), { timeout: 20_000 }).toBe(true)

    // Delete on device 1 the way the sync outbox sees a delete.
    await page.evaluate(async ([slot]) => {
      const { db } = await import(/* @vite-ignore */ ('/src/db/db.ts' as string))
      const { enqueueGlobalDel } = await import(/* @vite-ignore */ ('/src/lib/globalSyncQueue.ts' as string))
      await db.genTables.delete(slot as string)
      await enqueueGlobalDel('genTables', slot as string)
    }, [SLOT])
    await expect.poll(async () => (await userRecords(user.id)).filter((r) => r.kind === 'genTable' && r.deleted).length, { timeout: 20_000 }).toBe(1)
    await expect.poll(() => has(page2), { timeout: 20_000 }).toBe(false)
    await ctx2.close()
  })

  test('a duel record stuck in the outbox from before the fix flushes on the next push', async ({ page }) => {
    await ready(page)
    // Recreate the owner's production state: one `duelHistory:put` keyed by a date
    // string, written straight to Dexie (the old client queued exactly this).
    await page.evaluate(async ([uid, day]) => {
      const { db } = await import(/* @vite-ignore */ ('/src/db/db.ts' as string))
      await db.duelHistory.put({
        day, tier: 'standard', heroId: 'fighter', foeId: 'orc', outcome: 'won', rounds: 4,
        heroHpLeft: 9, heroHpMax: 20, dealt: 30, taken: 11, grid: [], updatedAt: new Date().toISOString(),
      })
      await db.pendingGlobal.clear()
      await db.pendingGlobal.add({ table: 'duelHistory', recordId: day, op: 'put', at: new Date().toISOString() })
      const { syncGlobal } = await import(/* @vite-ignore */ ('/src/lib/globalSync.ts' as string))
      await syncGlobal(uid)
    }, [user.id, DAY])
    const rows = await live(user.id, 'duelRecord')
    expect(rows).toHaveLength(1)
    expect(rows[0].data.day).toBe(DAY)
    const { cloudIdFor } = await import('../src/lib/globalSyncId')
    expect(rows[0].id).toBe(await cloudIdFor('duelRecord', DAY))
    expect(await page.evaluate(async () => (await (await import(/* @vite-ignore */ ('/src/db/db.ts' as string))).db.pendingGlobal.count()))).toBe(0)
  })

  test('a row that the backend rejects does not block the good rows behind it', async ({ page }) => {
    await ready(page)
    // Make the backend reject any request that carries the poisoned row, the way
    // Postgres rejects a bad id with 22P02. A batch with it fails as a whole.
    await page.route('**/rest/v1/user_records*', async (route) => {
      const req = route.request()
      if (req.method() === 'POST' && (req.postData() ?? '').includes('Poison')) {
        return route.fulfill({
          status: 400, contentType: 'application/json',
          body: JSON.stringify({ code: '22P02', message: 'invalid input syntax for type uuid', details: null, hint: null }),
        })
      }
      return route.continue()
    })
    await page.evaluate(async () => {
      const repo = await import(/* @vite-ignore */ ('/src/db/repo.ts' as string))
      await repo.createTemplate('session', 'Poison', { title: 'p' })
      await repo.createTemplate('session', 'Good one', { title: 'x' })
    })
    await expect
      .poll(async () => (await live(user.id, 'template')).map((r) => r.data.label), { timeout: 20_000 })
      .toContain('Good one')
    expect((await live(user.id, 'template')).map((r) => r.data.label)).not.toContain('Poison')
  })
})
