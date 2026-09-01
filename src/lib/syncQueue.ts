import { db, now } from '../db/db'
import type { SyncTable } from '../db/types'

// The push outbox. Every local mutation that touches a synced campaign is
// recorded here so the sync engine can mirror it to the cloud, then drop it.
//
// Design notes:
// - Enqueue is GATED by an in-memory set of synced campaign ids. Local-only
//   users (never signed in / never enabled sync) create zero outbox rows and pay
//   no overhead — `syncActive()` short-circuits before any IndexedDB read.
// - The set is seeded from the persisted `syncState` table at startup, so edits
//   made while offline (or before auth resolves) are still captured and flushed
//   on reconnect.
// - Applying PULLED rows must NOT go through here (it writes via raw `db.*`),
//   otherwise a pulled change would be re-pushed and ping-pong forever.

const synced = new Set<string>()

// The sync engine registers a handler here so a queued change can schedule a
// push. Kept as a callback (not a direct import) so the dependency stays
// one-way: the engine imports the queue, never the reverse.
let changeHandler: (() => void) | null = null
export function onLocalChange(fn: () => void): void {
  changeHandler = fn
}
function notifyChange(): void {
  changeHandler?.()
}

/** True if at least one campaign is synced (cheap gate for the edit hot path). */
export function syncActive(): boolean {
  return synced.size > 0
}

export function isSynced(campaignId: string): boolean {
  return synced.has(campaignId)
}

export function syncedCampaignIds(): string[] {
  return [...synced]
}

export function addSyncedCampaign(campaignId: string): void {
  synced.add(campaignId)
}

export function removeSyncedCampaign(campaignId: string): void {
  synced.delete(campaignId)
}

/** Seed the synced set from persisted sync state (call once at startup). */
export async function loadSyncedCampaigns(): Promise<void> {
  const rows = await db.syncState.toArray()
  synced.clear()
  for (const r of rows) synced.add(r.campaignId)
}

/** Queue an upsert of a record whose campaign is known (create paths). */
export async function enqueuePut(table: SyncTable, recordId: string, campaignId: string): Promise<void> {
  if (!synced.has(campaignId)) return
  await db.pending.add({ table, recordId, campaignId, op: 'put', at: now() })
  notifyChange()
}

/**
 * Queue an upsert when only the record id is known (update paths): looks up the
 * record to find its campaign, then enqueues if that campaign is synced.
 */
export async function enqueuePutById(table: SyncTable, recordId: string): Promise<void> {
  if (!syncActive()) return
  const campaignId = table === 'campaigns' ? recordId : await lookupCampaignId(table, recordId)
  if (campaignId && synced.has(campaignId)) {
    await db.pending.add({ table, recordId, campaignId, op: 'put', at: now() })
    notifyChange()
  }
}

/** Queue a tombstone (delete). campaignId must be captured before the row is gone. */
export async function enqueueDel(table: SyncTable, recordId: string, campaignId: string): Promise<void> {
  if (!synced.has(campaignId)) return
  await db.pending.add({ table, recordId, campaignId, op: 'del', at: now() })
  notifyChange()
}

async function lookupCampaignId(table: SyncTable, recordId: string): Promise<string | null> {
  const rec = (await db.table(table).get(recordId)) as { campaignId?: string } | undefined
  return rec?.campaignId ?? null
}
