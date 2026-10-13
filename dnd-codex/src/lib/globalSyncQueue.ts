import { db, now } from '../db/db'
import type { GlobalSyncTable } from '../db/types'

// The push outbox for GLOBAL (per-user, cross-campaign) data — the mirror of
// syncQueue.ts for the campaign channel. Enqueue is gated on a signed-in owner:
// local-only users create zero rows and pay no overhead.

let activeOwner: string | null = null

/** Set/clear the signed-in owner. Enqueue is a no-op until this is set. */
export function setGlobalSyncOwner(ownerId: string | null): void {
  activeOwner = ownerId
}

export function globalSyncActive(): boolean {
  return activeOwner != null
}

// The engine registers a handler so a queued change can schedule a push. Kept as
// a callback so the dependency stays one-way (engine imports the queue).
let changeHandler: (() => void) | null = null
export function onGlobalChange(fn: () => void): void {
  changeHandler = fn
}

/** Queue an upsert of a global record. No-op when signed out. */
export async function enqueueGlobalPut(table: GlobalSyncTable, recordId: string): Promise<void> {
  if (!activeOwner) return
  await db.pendingGlobal.add({ table, recordId, op: 'put', at: now() })
  changeHandler?.()
}

/** Queue a tombstone (delete) of a global record. No-op when signed out. */
export async function enqueueGlobalDel(table: GlobalSyncTable, recordId: string): Promise<void> {
  if (!activeOwner) return
  await db.pendingGlobal.add({ table, recordId, op: 'del', at: now() })
  changeHandler?.()
}
