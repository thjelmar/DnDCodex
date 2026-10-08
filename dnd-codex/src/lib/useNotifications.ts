import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../auth/AuthProvider'
import { getNotifications, type AppNotification } from '../auth/cloud'

// The signed-in user's in-app notifications, kept live over Realtime (T-19
// Phase 2). Mirrors useSessionRsvps, but the feed is per-USER (across every
// campaign they belong to), not per-campaign — the bell lives in the global
// sidebar. RLS already limits rows to the recipient; the channel filters on
// recipient_id so each client only wakes for its own notifications.

export function useNotifications(userId: string | null | undefined): AppNotification[] {
  const [items, setItems] = useState<AppNotification[]>([])
  // Gate the Realtime channel on the auth token (see useLiveSession for why).
  const { session } = useAuth()
  const token = session?.access_token ?? null

  useEffect(() => {
    if (!userId) {
      setItems([])
      return
    }
    let cancelled = false
    const refresh = async () => {
      const r = await getNotifications(userId)
      if (!cancelled) setItems(r)
    }
    refresh()
    if (!supabase || !token) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const debounced = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, 300)
    }
    const channel = supabase
      .channel(`notifications-${userId}-${crypto.randomUUID().slice(0, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        debounced,
      )
      .subscribe()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      supabase!.removeChannel(channel)
    }
  }, [userId, token])

  return items
}
