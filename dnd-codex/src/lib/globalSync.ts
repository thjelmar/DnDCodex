import { db, now } from '../db/db'
import { supabase } from './supabase'
import { GLOBAL_SYNC_TABLES, GLOBAL_TABLE_KEY, kindForGlobalTable, tableForGlobalKind } from './globalSyncKinds'
import { cloudIdFor } from './globalSyncId'
import { logSyncError } from './errorLog'
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

type CloudWrite = { owner_id: string; kind: string; id: string; data: unknown; deleted: boolean }

/** A readable message from an Error or from a Supabase PostgrestError (a plain object). */
function errorText(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const o = e as { code?: unknown; message?: unknown }
    if (typeof o.message === 'string') return o.code ? `${String(o.code)}: ${o.message}` : o.message
  }
  return String(e)
}

/**
 * Drains the global outbox, upserting records + tombstones to user_records.
 *
 * Rows go up as one batch. If the batch is rejected for a reason that belongs to
 * the data (the server answered with an error code), each row is retried on its
 * own so one bad row can never block the rest (T-93). A row that still fails is
 * logged and stays in the outbox; the others are flushed. A network failure (no
 * error code) aborts the push, as before, because every row would fail the same way.
 */
async function pushGlobal(ownerId: string): Promise<void> {
  if (!supabase) return
  const pend = await db.pendingGlobal.toArray()
  if (pend.length === 0) return

  // Coalesce to the last op per (table, recordId).
  const latest = new Map<string, (typeof pend)[number]>()
  for (const p of pend) latest.set(`${p.table}|${p.recordId}`, p)

  const nowIso = now()
  const entries: { write: CloudWrite; key: string; outboxIds: number[] }[] = []
  for (const c of latest.values()) {
    const kind = kindForGlobalTable(c.table)
    const keyField = GLOBAL_TABLE_KEY[c.table]
    const id = await cloudIdFor(kind, c.recordId)
    const tombstone = { id: c.recordId, [keyField]: c.recordId, updatedAt: nowIso }
    let write: CloudWrite
    if (c.op === 'del') {
      write = { owner_id: ownerId, kind, id, data: tombstone, deleted: true }
    } else {
      const rec = (await db.table(c.table).get(c.recordId)) as { updatedAt?: string } | undefined
      write = rec
        ? { owner_id: ownerId, kind, id, data: rec, deleted: false }
        : { owner_id: ownerId, kind, id, data: tombstone, deleted: true }
    }
    const outboxIds = pend.filter((p) => p.table === c.table && p.recordId === c.recordId).map((p) => p.id!)
    entries.push({ write, key: `${c.table}|${c.recordId}`, outboxIds })
  }

  const upsert = (rows: CloudWrite[]) => supabase!.from('user_records').upsert(rows, { onConflict: 'owner_id,kind,id' })
  const flushed: number[] = []
  const failed: string[] = []

  const batch = await upsert(entries.map((e) => e.write))
  if (!batch.error) {
    for (const e of entries) flushed.push(...e.outboxIds)
  } else if (!batch.error.code || entries.length === 1) {
    // No code means the request never got an answer (offline). One row means there is nothing to isolate.
    if (entries.length === 1 && batch.error.code) logSyncError(`global sync: ${entries[0].key} rejected: ${errorText(batch.error)}`)
    throw batch.error
  } else {
    for (const e of entries) {
      const one = await upsert([e.write])
      if (!one.error) {
        flushed.push(...e.outboxIds)
      } else if (!one.error.code) {
        throw one.error // went offline mid-way: keep the rest queued
      } else {
        failed.push(e.key)
        logSyncError(`global sync: ${e.key} rejected: ${errorText(one.error)}`)
      }
    }
  }

  // We deliberately do NOT advance the cursor past our own writes; the next pull
  // re-fetches them, but applyGlobalRows is idempotent, so there's no echo.
  if (flushed.length) await db.pendingGlobal.bulkDelete(flushed)
  if (failed.length) throw new Error(`global sync: ${failed.length} record(s) rejected (${failed.join(', ')})`)
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

/**
 * The Dexie primary key for a pulled row. Read from the record body (`slot`,
 * `day`, or `id`), never decoded from the cloud id, because the cloud id of a
 * slot or day is a hash. Null when the body carries no usable key (skip the row).
 */
function localKeyOf(table: GlobalSyncTable, row: CloudRow): string | null {
  const v = row.data?.[GLOBAL_TABLE_KEY[table]]
  if (typeof v === 'string' && v) return v
  if (GLOBAL_TABLE_KEY[table] === 'id' && row.id) return row.id // uuid-keyed tables: the cloud id is the key
  return null
}

/** Applies pulled rows to Dexie via RAW writes (never through the outbox). */
async function applyGlobalRows(rows: CloudRow[]): Promise<void> {
  const pendingDeletes = new Set(
    (await db.pendingGlobal.filter((p) => p.op === 'del').toArray()).map((p) => `${p.table}|${p.recordId}`),
  )
  for (const row of rows) {
    const table = tableForGlobalKind(row.kind)
    if (!table) continue // unknown/future kind — ignore
    const key = localKeyOf(table, row)
    if (key == null) continue // no key in the body (a tombstone from before T-93): nothing to map to
    const remoteAt = row.data?.updatedAt ?? row.updated_at
    const local = (await db.table(table).get(key)) as { updatedAt?: string } | undefined
    const localAt = local?.updatedAt ?? ''
    if (row.deleted) {
      if (local && localAt <= remoteAt) await db.table(table).delete(key)
    } else if (pendingDeletes.has(`${table}|${key}`)) {
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
    const msg = errorText(e)
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
