import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from '../auth/AuthProvider'
import {
  getSessionCandidates,
  getSessionAvailability,
  type SessionCandidate,
  type SessionAvailability,
} from '../auth/cloud'

// Live subscriptions for the session date poll (T-19): the candidate days and
// everyone's per-day availability. Both mirror useSessionRsvps — refetch on any
// change to the campaign's rows, gated on the auth token. Pass the cloud campaign
// id (the DM's own campaign.id, or the player's campaign.linkedCampaignId).

function useRealtimeList<T>(
  cloudCampaignId: string | undefined | null,
  table: string,
  fetcher: (id: string) => Promise<T[]>,
): T[] {
  const [rows, setRows] = useState<T[]>([])
  const { session } = useAuth()
  const token = session?.access_token ?? null

  useEffect(() => {
    if (!cloudCampaignId) {
      setRows([])
      return
    }
    let cancelled = false
    const refresh = async () => {
      const r = await fetcher(cloudCampaignId)
      if (!cancelled) setRows(r)
    }
    refresh()
    if (!supabase || !token) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const debounced = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, 300)
    }
    const channel = supabase
      .channel(`${table}-${cloudCampaignId}-${crypto.randomUUID().slice(0, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `campaign_id=eq.${cloudCampaignId}` },
        debounced,
      )
      .subscribe()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      supabase!.removeChannel(channel)
    }
    // fetcher is a stable module function; intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudCampaignId, token, table])

  return rows
}

export function useSessionCandidates(cloudCampaignId: string | undefined | null): SessionCandidate[] {
  return useRealtimeList(cloudCampaignId, 'session_candidates', getSessionCandidates)
}

export function useSessionAvailability(cloudCampaignId: string | undefined | null): SessionAvailability[] {
  return useRealtimeList(cloudCampaignId, 'session_availability', getSessionAvailability)
}
