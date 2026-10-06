import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../auth/AuthProvider'
import { getSessionRsvps, type SessionRsvp } from '../auth/cloud'

// Subscribes to a campaign's session RSVPs and keeps them live over Realtime.
// Used by both sides: the player hero (to show the party + the player's own
// choice) and the DM overview (to tally responses). Pass the cloud campaign id
// — the DM's own campaign.id, or the player's campaign.linkedCampaignId.

export function useSessionRsvps(cloudCampaignId: string | undefined | null): SessionRsvp[] {
  const [rsvps, setRsvps] = useState<SessionRsvp[]>([])
  // Gate the Realtime channel on the auth token (see useLiveSession for why).
  const { session } = useAuth()
  const token = session?.access_token ?? null

  useEffect(() => {
    if (!cloudCampaignId) {
      setRsvps([])
      return
    }
    let cancelled = false
    const refresh = async () => {
      const r = await getSessionRsvps(cloudCampaignId)
      if (!cancelled) setRsvps(r)
    }
    refresh()
    if (!supabase || !token) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const debounced = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, 300)
    }
    const channel = supabase
      .channel(`session-rsvps-${cloudCampaignId}-${crypto.randomUUID().slice(0, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_rsvps', filter: `campaign_id=eq.${cloudCampaignId}` },
        debounced,
      )
      .subscribe()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      supabase!.removeChannel(channel)
    }
  }, [cloudCampaignId, token])

  return rsvps
}
