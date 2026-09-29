import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../auth/AuthProvider'
import { getLiveSession, type LiveSession } from '../auth/cloud'

// Subscribes a player to the campaign's live-session signal. Returns the live
// session while the DM has one running (from Run mode's "Start live session"),
// or null. A row older than STALE_MS is treated as null — a safety net for a
// session the DM forgot to end (no heartbeat in v1).
const STALE_MS = 12 * 60 * 60 * 1000

export function useLiveSession(linkedCampaignId: string | undefined | null): LiveSession | null {
  const [live, setLive] = useState<LiveSession | null>(null)
  // Gate the Realtime channel on the auth token (see SharedGallery for why).
  const { session } = useAuth()
  const token = session?.access_token ?? null

  useEffect(() => {
    if (!linkedCampaignId) {
      setLive(null)
      return
    }
    let cancelled = false
    const fresh = (ls: LiveSession | null) =>
      ls && Date.now() - new Date(ls.startedAt).getTime() < STALE_MS ? ls : null
    const refresh = async () => {
      const ls = await getLiveSession(linkedCampaignId)
      if (!cancelled) setLive(fresh(ls))
    }
    refresh()
    if (!supabase || !token) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, 300)
    }
    const channel = supabase
      .channel(`live-session-${linkedCampaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_sessions', filter: `campaign_id=eq.${linkedCampaignId}` },
        schedule,
      )
      .subscribe()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      supabase!.removeChannel(channel)
    }
  }, [linkedCampaignId, token])

  return live
}
