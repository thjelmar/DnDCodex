import { db, now } from '../db/db'
import { supabase } from './supabase'
import { GLOBAL_SYNC_TABLES, GLOBAL_TABLE_KEY, kindForGlobalTable, tableForGlobalKind } from './globalSyncKinds'
import { setGlobalSyncOwner, onGlobalChange } from './globalSyncQueue'
import type { GlobalSyncTable } from '../db/types'

// ---------------------------------------------------------------------------
// Global (account-level) sync. The twin of lib/sync.ts, but for data that
// belongs to the USER and is reusable across campaigns (templates and generator
// word-lists). Every
// such entity is mirrored to the per-user `user_records` table (one JSONB row
// per entity, keyed by owner_id + kind + id). Dexie stays the source of truth;
// the cloud is a sync + backup channel so this data follows the account across
// devices.
//
// Same mechanics as the campaign channel: last-write-wins per record on the
// record's own `updatedAt`, a server-stamped `updated_at` driving a forward pull
// cursor, tombstones for deletes, and the T-29 count-compare reconcile baked in
// so a locally-dropped record can self-heal.
// ---------------------------------------------------------------------------

const CURSOR_ZERO = '1970-01-01T00:00:00Z'
const PAGE = 500

let activeOwner: string | null = null

/** Set by the SyncProvider on sign-in / clear on sign-out. */
export function setActiveGlobalUser(ownerId: string | null): void {
  activeOwner = ownerId
  setGlobalSyncOwner(ownerId)
}

// Debounced auto-push after local edits (the global outbox notifies us).
let pushTimer: ReturnType<typeof setTimeout> | null = null
function requestGlobalSync(): void {
  if (!activeOwner) return
  if (pushTimer) clearTimeout(pushTimer)
  const owner = activeOwner
  pushTimer = setTimeout(() => {
    pushTimer = null
    syncGlobal(owner).catch(() => {})
  }, 1200)
}
onGlobalChange(requestGlobalSync)

// ---- push -----------------------------------------------------------------

/** Drains the global outbox, upserting records + tombstones to user_records. */
async function pushGlobal(ownerId: string): Promise<void> {
  if (!supabase) return
  const pend = await db.pendingGlobal.toArray()
  if (pend.length === 0) return

  // Coalesce to the last op per (table, recordId).
  const latest = new Map<string, (typeof pend)[number]>()
  for (const p of pend) latest.set(`${p.table}|${p.recordId}`, p)

  const nowIso = now()
  const rows: { owner_id: string; kind: string; id: string; data: unknown; deleted: boolean }[] = []
  for (const c of latest.values()) {
    const kind = kindForGlobalTable(c.table)
    if (c.op === 'del') {
      rows.push({ owner_id: ownerId, kind, id: c.recordId, data: { id: c.recordId, updatedAt: nowIso }, deleted: true })
      continue
    }
    const rec = (await db.table(c.table).get(c.recordId)) as { updatedAt?: string } | undefined
    if (!rec) {
      rows.push({ owner_id: ownerId, kind, id: c.recordId, data: { id: c.recordId, updatedAt: nowIso }, deleted: true })
    } else {
      rows.push({ owner_id: ownerId, kind, id: c.recordId, data: rec, deleted: false })
    }
  }

  const { error } = await supabase.from('user_records').upsert(rows, { onConflict: 'owner_id,kind,id' })
  if (error) throw error

  // We deliberately do NOT advance the cursor past our own writes; the next pull
  // re-fetches them, but applyGlobalRows is idempotent, so there's no echo.
  await db.pendingGlobal.bulkDelete(pend.map((p) => p.id!).filter((id) => id != null))
}

// ---- pull -----------------------------------------------------------------

interface CloudRow {
  kind: string
  id: string
  data: { id: string; updatedAt?: string; [k: string]: unknown }
  deleted: boolean
  updated_at: string
}

/** Fetches cloud changes since the cursor and applies them (last-write-wins). */
async function pullGlobal(ownerId: string): Promise<void> {
  if (!supabase) return
  const st = await db.globalSyncState.get(ownerId)
  let cursor = st?.pullCursor ?? CURSOR_ZERO

  for (;;) {
    const { data, error } = await supabase
      .from('user_records')
      .select('kind, id, data, deleted, updated_at')
      .eq('owner_id', ownerId)
      .gt('updated_at', cursor)
      .order('updated_at', { ascending: true })
      .limit(PAGE)
    if (error) throw error
    const rows = data ?? []
    if (rows.length === 0) break
    await applyGlobalRows(rows as CloudRow[])
    cursor = rows[rows.length - 1].updated_at as string
    await db.globalSyncState.update(ownerId, { pullCursor: cursor })
    if (rows.length < PAGE) break
  }
}

/** Applies pulled rows to Dexie via RAW writes (never through the outbox). */
async function applyGlobalRows(rows: CloudRow[]): Promise<void> {
  const pendingDeletes = new Set(
    (await db.pendingGlobal.filter((p) => p.op === 'del').toArray()).map((p) => `${p.table}|${p.recordId}`),
  )
  for (const row of rows) {
    const table = tableForGlobalKind(row.kind)
    if (!table) continue // unknown/future kind — ignore
    const remoteAt = row.data?.updatedAt ?? row.updated_at
    const local = (await db.table(table).get(row.id)) as { updatedAt?: string } | undefined
    const localAt = local?.updatedAt ?? ''
    if (row.deleted) {
      if (local && localAt <= remoteAt) await db.table(table).delete(row.id)
    } else if (pendingDeletes.has(`${table}|${row.id}`)) {
      continue // a local delete is pending for this id — don't resurrect it
    } else if (!local || localAt <= remoteAt) {
      await db.table(table).put(row.data)
    }
  }
}

// ---- reconcile / self-heal ------------------------------------------------

/** Kinds this client understands — lets reconcile ignore future/unknown kinds. */
const KNOWN_KINDS = GLOBAL_SYNC_TABLES.map(kindForGlobalTable)

/** Counts local global records across every synced table. */
async function countLocalGlobalRecords(): Promise<number> {
  let n = 0
  for (const table of GLOBAL_SYNC_TABLES) n += await db.table(table).count()
  return n
}

/**
 * Self-heal (same shape as sync.ts reconcileCampaign, see T-29). If the cloud
 * holds more live global records than Dexie does, something was dropped locally
 * that the forward-only cursor can't re-fetch — rewind the cursor to zero and
 * re-pull. applyGlobalRows is idempotent, so only genuinely missing rows return.
 */
async function reconcileGlobal(ownerId: string): Promise<boolean> {
  if (!supabase) return false
  const { count, error } = await supabase
    .from('user_records')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('deleted', false)
    .in('kind', KNOWN_KINDS)
  if (error || count == null) return false
  const localCount = await countLocalGlobalRecords()
  if (count <= localCount) return false
  await db.globalSyncState.update(ownerId, { pullCursor: CURSOR_ZERO })
  await syncGlobal(ownerId)
  return true
}

// ---- orchestration --------------------------------------------------------

/** One full global sync: pull remote changes, then push local ones. */
export async function syncGlobal(ownerId: string): Promise<void> {
  try {
    await pullGlobal(ownerId)
    await pushGlobal(ownerId)
    await db.globalSyncState.update(ownerId, { lastSyncedAt: now(), lastError: null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.globalSyncState.update(ownerId, { lastError: msg }).catch(() => {})
    throw e
  }
}

/** Marks every local global record as needing a push (first-time upload). */
async function enqueueAllGlobal(): Promise<void> {
  const rows: { table: GlobalSyncTable; recordId: string; op: 'put'; at: string }[] = []
  const ts = now()
  for (const table of GLOBAL_SYNC_TABLES) {
    const key = GLOBAL_TABLE_KEY[table]
    const recs = (await db.table(table).toArray()) as Record<string, unknown>[]
    for (const r of recs) rows.push({ table, recordId: String(r[key]), op: 'put', at: ts })
  }
  if (rows.length) await db.pendingGlobal.bulkAdd(rows)
}

/**
 * On sign-in: ensure global sync state, back up any pre-existing local global
 * records, pull the account's global data, self-heal, and subscribe to live
 * updates. A no-op when the backend isn't configured.
 */
export async function bootstrapGlobal(ownerId: string): Promise<void> {
  if (!supabase) return
  setActiveGlobalUser(ownerId)
  if (!(await db.globalSyncState.get(ownerId))) {
    await db.globalSyncState.put({ ownerId, pullCursor: CURSOR_ZERO, lastSyncedAt: null, lastError: null })
    // First time syncing on this device: push whatever is already local so it
    // reaches the cloud. (On a brand-new device there's nothing local yet; the
    // pull below creates the rows.)
    await enqueueAllGlobal()
  }
  await syncGlobal(ownerId).catch(() => {})
  await reconcileGlobal(ownerId).catch(() => {})
  subscribeGlobal(ownerId)
}

/**
 * Re-queue every local global record for push. Used after a bulk restore
 * (importSnapshot) whose writes bypass the per-record outbox. No-op signed out.
 */
export async function resyncGlobal(): Promise<void> {
  if (!activeOwner) return
  await enqueueAllGlobal()
  requestGlobalSync()
}

/** On sign-out: stop the live subscription (local data + outbox stay put). */
export function teardownGlobal(): void {
  setActiveGlobalUser(null)
  unsubscribeGlobal()
}

/**
 * Manual repair: rewind the global pull cursor to zero and re-pull. Mirrors
 * repairSyncedCampaigns for the global channel (used by the Backup page button).
 */
export async function repairGlobalSync(ownerId: string): Promise<void> {
  if (!(await db.globalSyncState.get(ownerId))) return
  await db.globalSyncState.update(ownerId, { pullCursor: CURSOR_ZERO })
  await syncGlobal(ownerId)
}

// ---- realtime -------------------------------------------------------------

let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null
let pullTimer: ReturnType<typeof setTimeout> | null = null

function subscribeGlobal(ownerId: string): void {
  if (!supabase || channel) return
  channel = supabase
    .channel(`user_records-${ownerId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_records', filter: `owner_id=eq.${ownerId}` },
      () => scheduleLivePull(ownerId),
    )
    .subscribe()
}

function unsubscribeGlobal(): void {
  if (channel && supabase) supabase.removeChannel(channel)
  channel = null
  if (pullTimer) clearTimeout(pullTimer)
  pullTimer = null
}

function scheduleLivePull(ownerId: string): void {
  if (pullTimer) clearTimeout(pullTimer)
  pullTimer = setTimeout(() => {
    pullTimer = null
    syncGlobal(ownerId).catch(() => {})
  }, 400)
}
