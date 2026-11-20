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

// --- battle map library helpers (service key; local stack only) -------------
const svc = () => ({ apikey: SERVICE, Authorization: `Bearer ${SERVICE}` })

/** A valid 1x1 PNG, enough for a map or thumbnail in tests. */
export const TINY_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

export async function storageUpload(bucket: string, path: string, bytes: Uint8Array): Promise<void> {
  const r = await fetch(`${URL_}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { ...svc(), 'Content-Type': 'image/png', 'x-upsert': 'true' },
    body: bytes as never, // fetch accepts a Uint8Array; the e2e lib typings lag
  })
  if (!r.ok) throw new Error(`storage upload failed: ${r.status} ${await r.text()}`)
}

export interface SeedTemplate {
  title: string
  status?: 'draft' | 'published' | 'archived'
  tags?: string[]
  credit?: string
  cols?: number
  rows?: number
}

/** Inserts a template row plus its two tiny images. Returns the new id. */
export async function seedLibraryTemplate(t: SeedTemplate): Promise<string> {
  const id = crypto.randomUUID()
  const map_path = `${id}/v1/map.png`
  const thumb_path = `${id}/v1/thumb.png`
  await storageUpload('battlemap-library', map_path, TINY_PNG)
  await storageUpload('battlemap-library', thumb_path, TINY_PNG)
  const r = await fetch(`${URL_}/rest/v1/battle_map_templates`, {
    method: 'POST',
    headers: { ...svc(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      id,
      title: t.title,
      description: `Test map ${t.title}`,
      tags: t.tags ?? ['dungeon'],
      credit: t.credit ?? '',
      status: t.status ?? 'published',
      map_path,
      thumb_path,
      width: 1500,
      height: 1000,
      bytes: TINY_PNG.length,
      grid: { cellPx: 50, offsetX: 7, offsetY: 11 },
      cols: t.cols ?? 30,
      rows: t.rows ?? 20,
      published_at: new Date().toISOString(),
    }),
  })
  if (!r.ok) throw new Error(`seed template failed: ${r.status} ${await r.text()}`)
  return id
}

/** Removes a template row and its objects. */
export async function removeLibraryTemplate(id: string, versions: number[] = [1]): Promise<void> {
  await fetch(`${URL_}/rest/v1/battle_map_templates?id=eq.${id}`, { method: 'DELETE', headers: svc() })
  const prefixes = versions.flatMap((v) =>
    ['map.png', 'thumb.png', 'map.webp', 'thumb.webp'].map((f) => `${id}/v${v}/${f}`),
  )
  await fetch(`${URL_}/storage/v1/object/battlemap-library`, {
    method: 'DELETE',
    headers: { ...svc(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes }),
  })
}

/** Makes a user a publisher (service key). */
export async function addPublisher(userId: string): Promise<void> {
  const r = await fetch(`${URL_}/rest/v1/library_publishers`, {
    method: 'POST',
    headers: { ...svc(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId }),
  })
  if (!r.ok) throw new Error(`add publisher failed: ${r.status}`)
}

/** A REST call as a given identity: 'anon' (no session), or a user (their access token). */
export function restAs(who: 'anon' | TestUser, path: string, init: RequestInit = {}): Promise<Response> {
  const token = who === 'anon' ? ANON : ((who.session as { access_token: string }).access_token)
  return fetch(`${URL_}${path}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

/** Lists object names under a prefix in the library bucket (service key). */
export async function libraryObjects(prefix: string): Promise<string[]> {
  const r = await fetch(`${URL_}/storage/v1/object/list/battlemap-library`, {
    method: 'POST',
    headers: { ...svc(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit: 100 }),
  })
  const rows = (await r.json()) as { name: string }[]
  return rows.map((x) => x.name)
}

/** Template rows straight from the database (service key), optionally one id. */
export async function libraryRows(id?: string): Promise<Record<string, unknown>[]> {
  const q = id ? `?id=eq.${id}` : '?order=created_at.desc'
  const r = await fetch(`${URL_}/rest/v1/battle_map_templates${q}`, { headers: svc() })
  return (await r.json()) as Record<string, unknown>[]
}

/** Public URL of a library object, as a signed-out visitor would fetch it. */
export const libraryPublicUrl = (path: string) => `${URL_}/storage/v1/object/public/battlemap-library/${path}`
