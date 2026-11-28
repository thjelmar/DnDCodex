import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

// T-125: a "New …" sheet nobody fills in is never kept (and never synced).

/** Every record in one Dexie store, read straight from IndexedDB. */
function rows(page: Page, store: string): Promise<{ id: string; name?: string; title?: string }[]> {
  return page.evaluate(
    (s) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('dnd-codex')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const req = open.result.transaction(s, 'readonly').objectStore(s).getAll()
          req.onsuccess = () => {
            resolve(req.result)
            open.result.close()
          }
        }
      }),
    store,
  )
}

async function newCampaign(page: Page): Promise<string> {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Start a campaign' }).click()
  await page.getByPlaceholder('Curse of the Shattered Crown').fill(`Blank ${Date.now()}`)
  await page.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/#\/campaign\/[^/]+/)
  return new URL(page.url()).hash.split('/')[2]
}

// Where each kind is created from. `store` is the Dexie table the record lands in.
const KINDS = [
  { kind: 'session', path: 'sessions', button: 'New Session', store: 'sessions' },
  { kind: 'NPC', path: 'npcs', button: 'New NPC', store: 'npcs' },
  { kind: 'location', path: 'locations', button: 'New Location', store: 'locations' },
  { kind: 'item', path: 'items', button: 'New Item', store: 'items' },
  { kind: 'note', path: 'notes', button: 'New Note', store: 'notes' },
  { kind: 'roll table', path: 'tables', button: 'New Table', store: 'rollTables' },
  { kind: 'timeline event', path: 'timeline', button: 'New event', store: 'timelineEvents' },
  { kind: 'family', path: 'families', button: 'New family', store: 'families' },
  { kind: 'race group', path: 'races', button: 'New group', store: 'raceGroups' },
  { kind: 'battle map', path: 'battlemap', button: 'New Battle Map', store: 'scenes' },
]

test.describe('blank drafts are not kept (T-125)', () => {
  for (const k of KINDS) {
    test(`a blank ${k.kind} is removed when you leave it`, async ({ page }) => {
      const cid = await newCampaign(page)
      await page.goto(`/#/campaign/${cid}/${k.path}`)
      await page.getByRole('button', { name: k.button }).first().click()
      // Give a debounced editor save time to fire (it writes the same blank values back).
      await page.waitForTimeout(1200)
      expect(await rows(page, k.store)).toHaveLength(1)

      await page.goto(`/#/campaign/${cid}`)
      await expect.poll(() => rows(page, k.store)).toHaveLength(0)
    })
  }

  test('typing content keeps the record, and clearing it later does not delete it', async ({ page }) => {
    const cid = await newCampaign(page)
    await page.goto(`/#/campaign/${cid}/npcs`)
    await page.getByRole('button', { name: 'New NPC' }).first().click()
    const name = page.locator('input.input').first()
    await name.fill('Brenna the Innkeeper')
    await expect.poll(async () => (await rows(page, 'npcs'))[0]?.name).toBe('Brenna the Innkeeper')

    await page.goto(`/#/campaign/${cid}`)
    await page.waitForTimeout(500)
    expect(await rows(page, 'npcs')).toHaveLength(1)

    // Reopen, empty the name, leave: the saved record stays.
    await page.goto(`/#/campaign/${cid}/npcs`)
    await page.getByText('Brenna the Innkeeper').first().click()
    await page.locator('input.input').first().fill('')
    await page.waitForTimeout(1000)
    await page.goto(`/#/campaign/${cid}`)
    await page.waitForTimeout(500)
    expect(await rows(page, 'npcs')).toHaveLength(1)
  })

  test('an existing record is not purged by a later blank draft', async ({ page }) => {
    const cid = await newCampaign(page)
    await page.goto(`/#/campaign/${cid}/notes`)
    await page.getByRole('button', { name: 'New Note' }).first().click()
    await page.locator('input.input').first().fill('Keep me')
    await expect.poll(async () => (await rows(page, 'notes'))[0]?.title).toBe('Keep me')
    await page.getByRole('button', { name: 'New Note' }).first().click()
    await page.waitForTimeout(800)
    await page.goto(`/#/campaign/${cid}`)
    await expect.poll(() => rows(page, 'notes')).toHaveLength(1)
    expect((await rows(page, 'notes'))[0].title).toBe('Keep me')
  })

  test('a blank draft never reaches the sync outbox; it queues once it has content', async ({ page, supabaseRequests }) => {
    const cid = await newCampaign(page)
    // Let the app finish its startup sync-state load, which resets the synced set.
    await page.waitForTimeout(1000)
    const result = await page.evaluate(async (campaignId) => {
      // Same module instances the app uses (Vite serves each source file at one URL).
      const load = (u: string) => import(/* @vite-ignore */ u)
      const repo = await load('/src/db/repo.ts')
      const q = await load('/src/lib/syncQueue.ts')
      const { db } = await load('/src/db/db.ts')
      q.addSyncedCampaign(campaignId)
      const before = await db.pending.count()
      const npc = await repo.createNPC(campaignId, {}, { draft: true })
      await repo.updateNPC(npc.id, { name: 'New NPC', role: '' })
      const blank = (await db.pending.count()) - before
      await repo.updateNPC(npc.id, { name: 'Gareth' })
      const filled = (await db.pending.count()) - before
      q.removeSyncedCampaign(campaignId)
      return { blank, filled }
    }, cid)
    expect(result).toEqual({ blank: 0, filled: 1 })
    expect(supabaseRequests.filter((u) => u.includes('/records'))).toHaveLength(0)
  })
})
