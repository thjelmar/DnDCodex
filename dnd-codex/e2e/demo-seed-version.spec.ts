import { test, expect } from './fixtures'

// The demo database survives a reload, so a deploy that changes the seed can leave an
// open demo stale. seedDemoIfNeeded() compares the recorded seed version and reseeds.

const PLAYER_ID = 'demo-player-campaign-0001'
const KEY = 'codex-demo-seed-version'

type P = import('@playwright/test').Page

async function enterDemo(page: P) {
  await page.goto('/#/')
  await page.getByRole('button', { name: 'Try the live demo' }).click()
  await expect(page.locator('.demo-banner')).toBeVisible()
  await expect(page.getByTestId('demo-player-entry')).toBeVisible()
}

// Raw IndexedDB access to the demo database, bypassing the app.
function idb(page: P, op: 'delete-player' | 'rename-player' | 'read-player-name') {
  return page.evaluate(
    ([o, id]) =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open('dnd-codex-demo')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const d = open.result
          const tx = d.transaction('campaigns', 'readwrite')
          const st = tx.objectStore('campaigns')
          if (o === 'delete-player') st.delete(id)
          if (o === 'rename-player') {
            const g = st.get(id)
            g.onsuccess = () => st.put({ ...g.result, name: 'Edited by test' })
          }
          let name: string | null = null
          if (o === 'read-player-name') {
            const g = st.get(id)
            g.onsuccess = () => (name = g.result?.name ?? null)
          }
          tx.oncomplete = () => {
            d.close()
            resolve(name)
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    [op, PLAYER_ID] as const,
  )
}

test('a stale seed version reseeds the demo and restores edited data', async ({ page, supabaseRequests }) => {
  await enterDemo(page)
  await idb(page, 'rename-player')
  await page.evaluate((k) => localStorage.setItem(k, '0'), KEY)
  await page.reload()
  await expect(page.locator('.demo-banner')).toBeVisible()
  await expect.poll(() => idb(page, 'read-player-name')).toBe('Demo player: The Hollow Crown')
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).not.toBe('0')
  expect(supabaseRequests).toEqual([])
})

test('a missing demo campaign reseeds, and the player session opens instead of the missing-campaign error', async ({ page }) => {
  await enterDemo(page)
  await idb(page, 'delete-player')
  await page.goto(`/#/player/${PLAYER_ID}/session`)
  await page.reload()
  await expect(page.locator('.demo-banner')).toBeVisible()
  await expect(page.getByTestId('demo-controls')).toBeVisible()
  await expect(page.getByText('doesn’t exist in this browser')).toHaveCount(0)
})

test('a matching seed version keeps the demo data as it is', async ({ page }) => {
  await enterDemo(page)
  await idb(page, 'rename-player')
  await page.reload()
  await expect(page.locator('.demo-banner')).toBeVisible()
  await expect.poll(() => idb(page, 'read-player-name')).toBe('Edited by test')
})
