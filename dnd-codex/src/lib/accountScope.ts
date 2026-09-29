import { db } from '../db/db'
import { loadSyncedCampaigns, removeSyncedCampaign } from './syncQueue'

// ---------------------------------------------------------------------------
// Account isolation.
//
// IndexedDB is per-browser-origin, NOT per-account: without this, account A's
// local campaigns would still be present after A signs out and B signs in, and
// bootstrap() would even back them up into B's cloud. The cloud itself is
// RLS-isolated, so this is purely about the local cache.
//
// The model: the local Dexie DB is a CACHE of the signed-in account's cloud.
//  - Anonymous → first sign-in: no wipe (the anonymous data is adopted).
//  - Same account returning: no wipe (resume the cache).
//  - A DIFFERENT account signs in: full wipe, then bootstrap re-pulls fresh.
//  - Sign-out: evict only campaigns confirmed in the cloud (see below), so a
//    genuinely un-synced local campaign is never silently destroyed.
// ---------------------------------------------------------------------------

const LAST_USER_KEY = 'codex.lastUserId'

// Campaign-scoped data tables (everything keyed by `campaignId`), minus the
// `campaigns` table itself which is keyed by `id` and handled separately.
const CHILD_TABLES = [
  'sessions',
  'locations',
  'npcs',
  'items',
  'notes',
  'rollTables',
  'playerNotes',
  'images',
  'links',
  'encounters',
] as const

/** The last account to be active on this browser, or null if never signed in. */
export function getLastUserId(): string | null {
  try {
    return localStorage.getItem(LAST_USER_KEY)
  } catch {
    return null
  }
}

/** Remember the active account (persisted so a switch is detectable next load). */
export function setLastUserId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_USER_KEY, id)
    else localStorage.removeItem(LAST_USER_KEY)
  } catch {
    // localStorage may be unavailable (private mode) — isolation degrades to
    // "no memory of the last account", which is safe: we simply never wipe.
  }
}

/** Whether signing in as `userId` means a different account is taking over. */
export function isAccountSwitch(userId: string): boolean {
  const last = getLastUserId()
  return last !== null && last !== userId
}

/**
 * Full wipe of the local cache — every data table plus the local-only sync
 * bookkeeping. Used when a different account signs in. The cloud is untouched,
 * so the incoming account's bootstrap re-pulls its own data.
 */
export async function clearAllLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
  // Reset the in-memory "which campaigns are synced" set (now empty).
  await loadSyncedCampaigns()
}

/**
 * Evict the cached copy of campaigns that are safely in the cloud — those with
 * a sync-state row and no un-pushed edits in the outbox. Campaigns that are
 * opted out of sync, created offline, or mid-push are KEPT, so local-only work
 * is never silently lost. Used on sign-out.
 */
export async function clearSyncedCache(): Promise<void> {
  const states = await db.syncState.toArray()
  const evict: string[] = []
  for (const st of states) {
    const pendingCount = await db.pending.where('campaignId').equals(st.campaignId).count()
    if (pendingCount === 0) evict.push(st.campaignId)
  }
  if (evict.length === 0) return

  await db.transaction('rw', db.tables, async () => {
    for (const id of evict) {
      await db.campaigns.delete(id)
      await db.syncState.delete(id)
    }
    for (const table of CHILD_TABLES) {
      await db.table(table).where('campaignId').anyOf(evict).delete()
    }
  })
  for (const id of evict) removeSyncedCampaign(id)
}
