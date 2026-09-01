import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthProvider'
import { supabase } from '../lib/supabase'
import { getInboxCounts, type InboxCounts } from './cloud'

// A single, app-wide subscription to the signed-in user's share inbox, so the
// sidebar can show a live "new shares" badge from anywhere. One channel + one
// count query, refreshed (debounced) whenever a share addressed to me changes —
// a DM sending one bumps it up; importing one (markShareConsumed) drops it.

const EMPTY: InboxCounts = { total: 0, byCampaign: {} }

const ShareInboxContext = createContext<InboxCounts>(EMPTY)

/** `{ total, byCampaign }` pending-share counts for the current user. */
export function useShareInbox(): InboxCounts {
  return useContext(ShareInboxContext)
}

export function ShareInboxProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [counts, setCounts] = useState<InboxCounts>(EMPTY)
  const userId = user?.id ?? null

  const refresh = useCallback(async () => {
    if (!userId) {
      setCounts(EMPTY)
      return
    }
    try {
      setCounts(await getInboxCounts(userId))
    } catch {
      // table missing / offline — leave the last known counts, badge just stale
    }
  }, [userId])

  useEffect(() => {
    refresh()
    if (!supabase || !userId) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, 300)
    }
    const channel = supabase
      .channel('inbox-global')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shares', filter: `to_user=eq.${userId}` },
        schedule,
      )
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase!.removeChannel(channel)
    }
  }, [userId, refresh])

  return <ShareInboxContext.Provider value={counts}>{children}</ShareInboxContext.Provider>
}

/** Small notification pill; renders nothing when count is 0. */
export function ShareBadge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span
      aria-label={`${count} new`}
      style={{
        marginLeft: 6,
        background: 'var(--accent)',
        color: '#fff',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        lineHeight: '16px',
        minWidth: 16,
        height: 16,
        padding: '0 5px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {count}
    </span>
  )
}
