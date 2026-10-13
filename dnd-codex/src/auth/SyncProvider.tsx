import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAuth } from './AuthProvider'
import {
  bootstrap,
  enableSync,
  teardown,
  setActiveUser,
  syncAll,
  repairSyncedCampaigns,
  getSyncStatus,
  onSyncStatus,
  type SyncStatus,
} from '../lib/sync'
import { bootstrapGlobal, teardownGlobal, syncGlobal, repairGlobalSync } from '../lib/globalSync'
import { loadSyncedCampaigns } from '../lib/syncQueue'
import {
  clearAllLocalData,
  clearSyncedCache,
  isAccountSwitch,
  setLastUserId,
} from '../lib/accountScope'

interface SyncContextValue {
  status: SyncStatus
  /**
   * Force a full re-pull of every synced campaign from the cloud (self-heal for
   * records the forward-only cursor can't recover). Resolves to the number of
   * campaigns re-synced; 0 when signed out or nothing is synced.
   */
  repair: () => Promise<number>
}

const SyncContext = createContext<SyncContextValue>({ status: getSyncStatus(), repair: async () => 0 })

export function useSync(): SyncContextValue {
  return useContext(SyncContext)
}

/**
 * Wires the sync engine to auth: bootstraps on sign-in (pull owned campaigns +
 * back up local ones), auto-enables sync for campaigns created later, and
 * periodically flushes while the tab is active. A no-op when the backend isn't
 * configured or nobody is signed in — the app stays fully local-first.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus())
  const bootstrapped = useRef(false)
  const enabling = useRef<Set<string>>(new Set())

  // Seed the "which campaigns are synced" set from persisted state once, so
  // edits made before auth resolves (or offline) are still captured.
  useEffect(() => {
    loadSyncedCampaigns()
  }, [])

  // Mirror the engine's status into React state for the indicator.
  useEffect(() => onSyncStatus(setStatus), [])

  // Bootstrap on sign-in; tear down on sign-out. Enforce account isolation: the
  // local DB is a cache of the signed-in account, so a DIFFERENT account signing
  // in wipes it (bootstrap re-pulls fresh), and a real sign-out drops the
  // cloud-backed cache while keeping any un-synced local work.
  const userId = user?.id ?? null
  const prevUserId = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevUserId.current
    prevUserId.current = userId

    if (!userId) {
      bootstrapped.current = false
      setActiveUser(null)
      teardown()
      teardownGlobal()
      // Only on an actual sign-out (was signed in), never on the initial
      // pre-auth mount where userId starts null.
      if (prev) clearSyncedCache().catch(() => {})
      return
    }

    bootstrapped.current = false
    let cancelled = false
    ;(async () => {
      if (isAccountSwitch(userId)) {
        teardown()
        await clearAllLocalData()
        if (cancelled) return
      }
      setLastUserId(userId)
      setActiveUser(userId)
      await bootstrap(userId)
      await bootstrapGlobal(userId).catch(() => {})
      if (!cancelled) bootstrapped.current = true
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  // Auto-enable sync for any campaign that appears after bootstrap (e.g. a new
  // campaign the user just created while signed in).
  const campaignIds = useLiveQuery(
    () => db.campaigns.toArray().then((cs) => cs.map((c) => ({ id: c.id, name: c.name }))),
    [],
  )
  useEffect(() => {
    if (!userId || !campaignIds) return
    let cancelled = false
    ;(async () => {
      if (!bootstrapped.current) return
      for (const c of campaignIds) {
        if (cancelled) break
        if (enabling.current.has(c.id)) continue
        if (await db.syncState.get(c.id)) continue
        if (await db.syncOptOut.get(c.id)) continue // user kept this one local
        enabling.current.add(c.id)
        try {
          await enableSync(c, userId)
        } finally {
          enabling.current.delete(c.id)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId, campaignIds])

  // Flush when the tab regains focus / comes back online, plus a gentle poll.
  useEffect(() => {
    if (!userId) return
    const flush = () => {
      syncAll(userId).catch(() => {})
      syncGlobal(userId).catch(() => {})
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') flush()
    }
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', onVisible)
    const interval = setInterval(flush, 60_000)
    return () => {
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [userId])

  const repair = useCallback(async () => {
    if (!userId) return 0
    await repairGlobalSync(userId).catch(() => {})
    return repairSyncedCampaigns(userId)
  }, [userId])

  return <SyncContext.Provider value={{ status, repair }}>{children}</SyncContext.Provider>
}
