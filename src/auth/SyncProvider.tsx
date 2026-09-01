import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAuth } from './AuthProvider'
import {
  bootstrap,
  enableSync,
  teardown,
  setActiveUser,
  syncAll,
  getSyncStatus,
  onSyncStatus,
  type SyncStatus,
} from '../lib/sync'
import { loadSyncedCampaigns } from '../lib/syncQueue'

interface SyncContextValue {
  status: SyncStatus
}

const SyncContext = createContext<SyncContextValue>({ status: getSyncStatus() })

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

  // Bootstrap on sign-in; tear down on sign-out.
  const userId = user?.id ?? null
  useEffect(() => {
    if (!userId) {
      bootstrapped.current = false
      setActiveUser(null)
      teardown()
      return
    }
    setActiveUser(userId)
    bootstrapped.current = false
    ;(async () => {
      await bootstrap(userId)
      bootstrapped.current = true
    })()
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
    const flush = () => syncAll(userId).catch(() => {})
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

  return <SyncContext.Provider value={{ status }}>{children}</SyncContext.Provider>
}
