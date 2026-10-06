import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../auth/AuthProvider'
import { getSessionSchedule, type CloudSessionSchedule } from '../auth/cloud'

// Subscribes a player to their campaign's next-session schedule, published by
// the DM. Returns the schedule (or null) and keeps it live over Realtime, the
// same shape as useLiveSession — the two together feed sessionStatus().

export function useSessionSchedule(
  linkedCampaignId: string | undefined | null,
): CloudSessionSchedule | null {
  const [schedule, setSchedule] = useState<CloudSessionSchedule | null>(null)
  // Gate the Realtime channel on the auth token (see useLiveSession for why).
  const { session } = useAuth()
  const token = session?.access_token ?? null

  useEffect(() => {
    if (!linkedCampaignId) {
      setSchedule(null)
      return
    }
    let cancelled = false
    const refresh = async () => {
      const s = await getSessionSchedule(linkedCampaignId)
      if (!cancelled) setSchedule(s)
    }
    refresh()
    if (!supabase || !token) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule2 = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, 300)
    }
    const channel = supabase
      .channel(`session-schedule-${linkedCampaignId}-${crypto.randomUUID().slice(0, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_schedule', filter: `campaign_id=eq.${linkedCampaignId}` },
        schedule2,
      )
      .subscribe()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      supabase!.removeChannel(channel)
    }
  }, [linkedCampaignId, token])

  return schedule
}
