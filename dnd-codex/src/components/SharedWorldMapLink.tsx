import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { getSharedWorldMap } from '../auth/cloud'
import { Icon } from './Icon'

/** A one-line "World Map →" link on the player home, shown only when the DM has
 *  shared a world map. Lives next to the gallery/handouts rail links. */
export function SharedWorldMapLink({ campaignId, linkedCampaignId }: { campaignId: string; linkedCampaignId: string }) {
  const { session } = useAuth()
  const token = session?.access_token ?? null
  const [name, setName] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const m = await getSharedWorldMap(linkedCampaignId)
      if (!cancelled) setName(m ? (m.name?.trim() || 'World Map') : null)
    }
    refresh()
    if (!supabase || !token) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(refresh, 300) }
    const channel = supabase
      .channel(`sharedwm-link-${linkedCampaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_world_maps', filter: `campaign_id=eq.${linkedCampaignId}` }, schedule)
      .subscribe()
    return () => { cancelled = true; if (timer) clearTimeout(timer); supabase!.removeChannel(channel) }
  }, [linkedCampaignId, token])

  if (!name) return null
  return (
    <Link className="rail-link-row" to={`/player/${campaignId}/worldmap`}>
      <Icon name="map" size={15} />
      <span>World Map</span>
      <span className="rail-link-arrow">→</span>
    </Link>
  )
}
