import type { Page } from '@playwright/test'

// Helpers for the live-backend tests. They only ever talk to the LOCAL Supabase
// stack named by E2E_SUPABASE_URL (scripts/e2e-live.mjs enforces a loopback host).
export const LIVE = process.env.E2E_LIVE === '1'
const URL_ = process.env.E2E_SUPABASE_URL ?? ''
const ANON = process.env.E2E_SUPABASE_ANON_KEY ?? ''
const SERVICE = process.env.E2E_SUPABASE_SERVICE_KEY ?? ''

export interface TestUser {
  id: string
  email: string
  session: unknown
}

/** Creates a throwaway confirmed user and signs it in (password grant). */
export async function createTestUser(): Promise<TestUser> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`
  const password = `pw-${crypto.randomUUID()}`
  const created = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  if (!created.ok) throw new Error(`create user failed: ${created.status}`)
  const user = (await created.json()) as { id: string }
  const tok = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!tok.ok) throw new Error(`sign-in failed: ${tok.status}`)
  return { id: user.id, email, session: await tok.json() }
}

/** Deletes the user and everything it owns (campaigns cascade to records). */
export async function deleteTestUser(user: TestUser): Promise<void> {
  const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
  await fetch(`${URL_}/rest/v1/campaigns?owner_id=eq.${user.id}`, { method: 'DELETE', headers: h })
  await fetch(`${URL_}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: h })
}

/** Puts the session where supabase-js looks for it, before any page script runs. */
export async function signInPage(page: Page, user: TestUser): Promise<void> {
  const key = `sb-${new URL(URL_).hostname.split('.')[0]}-auth-token`
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [key, JSON.stringify(user.session)])
}

export interface CloudRecord {
  id: string
  deleted: boolean
  data: Record<string, unknown>
}

/** Reads a campaign's records of one kind straight from the backend (service key). */
export async function cloudRecords(campaignId: string, kind: string): Promise<CloudRecord[]> {
  const r = await fetch(
    `${URL_}/rest/v1/records?campaign_id=eq.${campaignId}&kind=eq.${kind}&select=id,deleted,data`,
    { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } },
  )
  if (!r.ok) throw new Error(`records query failed: ${r.status}`)
  return (await r.json()) as CloudRecord[]
}

/** Counts a campaign's rows in a local IndexedDB store, bypassing the app. */
export function localCount(page: Page, store: string, campaignId: string): Promise<number> {
  return page.evaluate(
    ([s, c]) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('dnd-codex')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction(s, 'readonly')
          const req = tx.objectStore(s).getAll()
          req.onsuccess = () => {
            resolve((req.result as { campaignId?: string }[]).filter((r) => r.campaignId === c).length)
            open.result.close()
          }
        }
      }),
    [store, campaignId],
  )
}

/** Deletes a campaign's rows from a local store only (no outbox entry, no tombstone). */
export function dropLocal(page: Page, store: string, campaignId: string): Promise<void> {
  return page.evaluate(
    ([s, c]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('dnd-codex')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction(s, 'readwrite')
          const os = tx.objectStore(s)
          const req = os.getAll()
          req.onsuccess = () => {
            for (const r of req.result as { id: string; campaignId?: string }[]) if (r.campaignId === c) os.delete(r.id)
          }
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    [store, campaignId],
  )
}
