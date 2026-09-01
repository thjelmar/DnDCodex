import { db, now } from '../db/db'
import { supabase } from './supabase'
import { SYNC_TABLES, kindForTable, tableForKind } from './syncKinds'
import {
  addSyncedCampaign,
  removeSyncedCampaign,
  syncedCampaignIds,
  onLocalChange,
} from './syncQueue'
import type { SyncTable } from '../db/types'

// ---------------------------------------------------------------------------
// Phase 3: full campaign sync.
//
// Every campaign the user OWNS is mirrored to Supabase's generic `records` table
// (one JSONB row per entity, keyed by campaign_id + kind + id). Dexie stays the
// source of truth for reads and offline work; the cloud is a sync + backup
// channel that lets a campaign follow the account across devices.
//
// Conflict resolution is last-write-wins per record, compared on the record's
// own `updatedAt`. The pull cursor uses the SERVER's `updated_at` (a trigger
// stamps now() on every write) so it's monotonic and immune to client clock
// skew. Deletes travel as tombstone rows (deleted = true).
// ---------------------------------------------------------------------------

const CURSOR_ZERO = '1970-01-01T00:00:00Z'
const PAGE = 500

// The currently signed-in owner. Set by the SyncProvider; lets a local edit
// schedule its own push without the UI having to thread the user id through.
let activeOwner: string | null = null

export function setActiveUser(ownerId: string | null): void {
  activeOwner = ownerId
}

// Debounced auto-push after local edits (the outbox notifies us on every change).
let pushTimer: ReturnType<typeof setTimeout> | null = null
function requestSync(): void {
  if (!activeOwner) return
  if (pushTimer) clearTimeout(pushTimer)
  const owner = activeOwner
  pushTimer = setTimeout(() => {
    pushTimer = null
    syncAll(owner).catch(() => {})
  }, 1200)
}
onLocalChange(requestSync)

// ---- status store (for the sidebar indicator) ----------------------------

export interface SyncStatus {
  /** Number of campaigns currently synced. */
  campaigns: number
  /** True while a push/pull is in flight. */
  syncing: boolean
  /** ISO time of the last successful sync, or null. */
  lastSyncedAt: string | null
  /** Last error message, or null. */
  error: string | null
}

let status: SyncStatus = { campaigns: 0, syncing: false, lastSyncedAt: null, error: null }
const listeners = new Set<(s: SyncStatus) => void>()

export function getSyncStatus(): SyncStatus {
  return status
}

export function onSyncStatus(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  for (const fn of listeners) fn(status)
}

function refreshCampaignCount() {
  setStatus({ campaigns: syncedCampaignIds().length })
}

// ---- cloud campaign shell -------------------------------------------------

function isDuplicateError(err: { code?: string } | null): boolean {
  return err?.code === '23505'
}

/**
 * Ensures a cloud `campaigns` row exists for this campaign, owned by the user.
 * A pure-sync campaign needs no join code (that's only for inviting players), so
 * we insert without one; enableCampaignSharing adds a code later if needed.
 */
async function ensureCloudCampaign(campaignId: string, name: string, ownerId: string): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase.from('campaigns').select('id, owner_id').eq('id', campaignId).maybeSingle()
  if (data) {
    // Someone else already owns a campaign with this id — refuse to hijack it.
    return (data.owner_id as string) === ownerId
  }
  const { error } = await supabase.from('campaigns').insert({ id: campaignId, owner_id: ownerId, name })
  if (error && !isDuplicateError(error)) throw error
  await supabase
    .from('campaign_members')
    .upsert({ campaign_id: campaignId, user_id: ownerId, role: 'dm' }, { onConflict: 'campaign_id,user_id', ignoreDuplicates: true })
  return true
}

// ---- enable / disable -----------------------------------------------------

/** Marks every local record of a campaign as needing a push (full re-upload). */
async function enqueueWholeCampaign(campaignId: string): Promise<void> {
  const rows: { table: SyncTable; recordId: string; campaignId: string; op: 'put'; at: string }[] = []
  const ts = now()
  for (const table of SYNC_TABLES) {
    if (table === 'campaigns') {
      rows.push({ table, recordId: campaignId, campaignId, op: 'put', at: ts })
      continue
    }
    const recs = (await db.table(table).where('campaignId').equals(campaignId).toArray()) as { id: string }[]
    for (const r of recs) rows.push({ table, recordId: r.id, campaignId, op: 'put', at: ts })
  }
  if (rows.length) await db.pending.bulkAdd(rows)
}

/**
 * Turns on sync for a campaign: registers the cloud shell, records local sync
 * state, queues a full upload, then runs an initial sync. Idempotent.
 */
export async function enableSync(
  campaign: { id: string; name: string },
  ownerId: string,
): Promise<void> {
  if (!supabase) return
  const owns = await ensureCloudCampaign(campaign.id, campaign.name, ownerId)
  if (!owns) return // conflicting owner; leave this campaign local-only.

  const existing = await db.syncState.get(campaign.id)
  if (!existing) {
    await db.syncState.put({ campaignId: campaign.id, ownerId, pullCursor: CURSOR_ZERO, lastSyncedAt: null, lastError: null })
    addSyncedCampaign(campaign.id)
    await enqueueWholeCampaign(campaign.id)
    refreshCampaignCount()
  } else {
    addSyncedCampaign(campaign.id)
    refreshCampaignCount()
  }
  await syncCampaign(campaign.id, ownerId)
  subscribeCampaign(campaign.id, ownerId)
}

/**
 * Re-queues every record of all synced campaigns for push. Used after a bulk
 * restore (importSnapshot) whose writes bypass the per-record outbox.
 */
export async function resyncSyncedCampaigns(): Promise<void> {
  for (const id of syncedCampaignIds()) await enqueueWholeCampaign(id)
  requestSync()
}

/** Stops syncing a campaign locally (leaves cloud data intact). */
export async function disableSync(campaignId: string): Promise<void> {
  unsubscribeCampaign(campaignId)
  removeSyncedCampaign(campaignId)
  await db.syncState.delete(campaignId)
  await db.pending.where('campaignId').equals(campaignId).delete()
  refreshCampaignCount()
}

// ---- push -----------------------------------------------------------------

/** Drains the outbox for one campaign, upserting records + tombstones. */
async function pushCampaign(campaignId: string, ownerId: string): Promise<void> {
  if (!supabase) return
  const pend = await db.pending.where('campaignId').equals(campaignId).toArray()
  if (pend.length === 0) return

  // A queued delete of the campaign itself means "delete everything" — drop the
  // cloud campaigns row (records cascade) and tear down local sync state.
  const campaignDel = pend.find((p) => p.table === 'campaigns' && p.op === 'del')
  if (campaignDel) {
    await supabase.from('campaigns').delete().eq('id', campaignId).eq('owner_id', ownerId)
    unsubscribeCampaign(campaignId)
    await db.pending.where('campaignId').equals(campaignId).delete()
    await db.syncState.delete(campaignId)
    removeSyncedCampaign(campaignId)
    refreshCampaignCount()
    return
  }

  // Coalesce to the last op per (table, recordId).
  const latest = new Map<string, (typeof pend)[number]>()
  for (const p of pend) latest.set(`${p.table}|${p.recordId}`, p)

  const nowIso = now()
  const rows: { campaign_id: string; kind: string; id: string; data: unknown; deleted: boolean }[] = []
  for (const c of latest.values()) {
    const kind = kindForTable(c.table)
    if (c.op === 'del') {
      rows.push({ campaign_id: campaignId, kind, id: c.recordId, data: { id: c.recordId, updatedAt: nowIso }, deleted: true })
      continue
    }
    const rec = (await db.table(c.table).get(c.recordId)) as { updatedAt?: string } | undefined
    if (!rec) {
      // Created then deleted before push — send a tombstone.
      rows.push({ campaign_id: campaignId, kind, id: c.recordId, data: { id: c.recordId, updatedAt: nowIso }, deleted: true })
    } else {
      rows.push({ campaign_id: campaignId, kind, id: c.recordId, data: rec, deleted: false })
    }
  }

  const { error } = await supabase.from('records').upsert(rows, { onConflict: 'campaign_id,kind,id' })
  if (error) throw error

  // We deliberately do NOT advance the pull cursor past our own writes. The next
  // pull will re-fetch them, but applyRows is idempotent (equal updatedAt → same
  // data, no re-queue), so there's no echo — and crucially we never risk hopping
  // the cursor past a concurrent write from another device.
  await db.pending.bulkDelete(pend.map((p) => p.id!).filter((id) => id != null))
}

// ---- pull -----------------------------------------------------------------

/** Fetches cloud changes since the cursor and applies them (last-write-wins). */
async function pullCampaign(campaignId: string): Promise<void> {
  if (!supabase) return
  const st = await db.syncState.get(campaignId)
  let cursor = st?.pullCursor ?? CURSOR_ZERO

  for (;;) {
    const { data, error } = await supabase
      .from('records')
      .select('kind, id, data, deleted, updated_at')
      .eq('campaign_id', campaignId)
      .gt('updated_at', cursor)
      .order('updated_at', { ascending: true })
      .limit(PAGE)
    if (error) throw error
    const rows = data ?? []
    if (rows.length === 0) break
    await applyRows(rows as CloudRow[])
    cursor = rows[rows.length - 1].updated_at as string
    await db.syncState.update(campaignId, { pullCursor: cursor })
    if (rows.length < PAGE) break
  }
}

interface CloudRow {
  kind: string
  id: string
  data: { id: string; updatedAt?: string; [k: string]: unknown }
  deleted: boolean
  updated_at: string
}

/** Applies pulled rows to Dexie via RAW writes (never through the outbox). */
async function applyRows(rows: CloudRow[]): Promise<void> {
  for (const row of rows) {
    const table = tableForKind(row.kind)
    if (!table) continue // unknown/future kind — ignore
    const remoteAt = row.data?.updatedAt ?? row.updated_at
    const local = (await db.table(table).get(row.id)) as { updatedAt?: string } | undefined
    const localAt = local?.updatedAt ?? ''
    if (row.deleted) {
      if (local && localAt <= remoteAt) await db.table(table).delete(row.id)
    } else if (!local || localAt <= remoteAt) {
      await db.table(table).put(row.data)
    }
  }
}

// ---- orchestration --------------------------------------------------------

/** One full sync of a campaign: pull remote changes, then push local ones. */
export async function syncCampaign(campaignId: string, ownerId: string): Promise<void> {
  try {
    // If the whole campaign was deleted locally, push that FIRST and skip the
    // pull — otherwise the pull would resurrect it from the cloud before the
    // delete lands. pushCampaign's campaign-delete branch tears everything down.
    const pendingDelete = await db.pending
      .where('campaignId')
      .equals(campaignId)
      .filter((p) => p.table === 'campaigns' && p.op === 'del')
      .count()
    if (pendingDelete > 0) {
      await pushCampaign(campaignId, ownerId)
      setStatus({ lastSyncedAt: now(), error: null })
      return
    }
    await pullCampaign(campaignId)
    await pushCampaign(campaignId, ownerId)
    await db.syncState.update(campaignId, { lastSyncedAt: now(), lastError: null })
    setStatus({ lastSyncedAt: now(), error: null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await db.syncState.update(campaignId, { lastError: msg }).catch(() => {})
    setStatus({ error: msg })
    throw e
  }
}

/** Syncs every campaign that currently has sync enabled. */
export async function syncAll(ownerId: string): Promise<void> {
  const ids = syncedCampaignIds()
  if (ids.length === 0) return
  setStatus({ syncing: true })
  try {
    for (const id of ids) {
      try {
        await syncCampaign(id, ownerId)
      } catch {
        // keep going with the other campaigns; error already recorded
      }
    }
  } finally {
    setStatus({ syncing: false })
  }
}

/**
 * On sign-in: pull down every campaign the account owns (creating any that
 * aren't local yet), enable sync for local campaigns that aren't in the cloud,
 * reconcile remote deletions, then do a full sync and subscribe to live updates.
 */
export async function bootstrap(ownerId: string): Promise<void> {
  if (!supabase) return
  setStatus({ syncing: true, error: null })
  try {
    // 1. Cloud campaigns this user owns.
    const { data: owned, error } = await supabase.from('campaigns').select('id, name').eq('owner_id', ownerId)
    if (error) throw error
    const ownedIds = new Set((owned ?? []).map((c) => c.id as string))

    // 2. Ensure sync state for each owned cloud campaign. If it already exists
    //    locally but is being synced for the first time (fresh Phase-3 state),
    //    queue a full upload so pre-existing local data reaches the cloud. On a
    //    brand-new device the campaign isn't local yet — the pull in step 5
    //    creates it from cloud records, so nothing is queued here.
    for (const c of owned ?? []) {
      const id = c.id as string
      if (!(await db.syncState.get(id))) {
        await db.syncState.put({ campaignId: id, ownerId, pullCursor: CURSOR_ZERO, lastSyncedAt: null, lastError: null })
        addSyncedCampaign(id)
        if (await db.campaigns.get(id)) await enqueueWholeCampaign(id)
      } else {
        addSyncedCampaign(id)
      }
    }
    refreshCampaignCount()

    // NOTE: we intentionally do NOT delete local campaigns that are missing from
    // the cloud list. Treating "absent from a cloud query" as "delete my local
    // data" is unsafe — a transient error returning [] would wipe real work.
    // Cross-device campaign deletion is therefore not auto-propagated (a
    // campaign deleted on one device may be re-pushed by another); losing a
    // campaign is far worse than an occasional resurrection. See docs.

    // 4. Enable sync for local campaigns not yet mirrored to the cloud
    //    (campaigns created before signing in — back them up under the account).
    const localCampaigns = await db.campaigns.toArray()
    for (const camp of localCampaigns) {
      if (!ownedIds.has(camp.id) && !(await db.syncState.get(camp.id))) {
        await enableSync({ id: camp.id, name: camp.name }, ownerId).catch(() => {})
      }
    }

    // 5. Full sync + live subscriptions.
    await syncAll(ownerId)
    for (const id of syncedCampaignIds()) subscribeCampaign(id, ownerId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    setStatus({ error: msg })
  } finally {
    setStatus({ syncing: false })
  }
}

/** On sign-out: stop all live subscriptions (local data + outbox stay put). */
export function teardown(): void {
  for (const id of [...channels.keys()]) unsubscribeCampaign(id)
}

// ---- realtime -------------------------------------------------------------

// Debounced live pulls: a burst of record writes coalesces into one sync.
const channels = new Map<string, ReturnType<NonNullable<typeof supabase>['channel']>>()
const pullTimers = new Map<string, ReturnType<typeof setTimeout>>()

function subscribeCampaign(campaignId: string, ownerId: string): void {
  if (!supabase || channels.has(campaignId)) return
  const channel = supabase
    .channel(`records-${campaignId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'records', filter: `campaign_id=eq.${campaignId}` },
      () => scheduleLivePull(campaignId, ownerId),
    )
    .subscribe()
  channels.set(campaignId, channel)
}

function unsubscribeCampaign(campaignId: string): void {
  const channel = channels.get(campaignId)
  if (channel && supabase) supabase.removeChannel(channel)
  channels.delete(campaignId)
  const t = pullTimers.get(campaignId)
  if (t) clearTimeout(t)
  pullTimers.delete(campaignId)
}

function scheduleLivePull(campaignId: string, ownerId: string): void {
  const prev = pullTimers.get(campaignId)
  if (prev) clearTimeout(prev)
  pullTimers.set(
    campaignId,
    setTimeout(() => {
      pullTimers.delete(campaignId)
      syncCampaign(campaignId, ownerId).catch(() => {})
    }, 400),
  )
}

