import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { getSharedWorldMap, getSharedImages, type SharedWorldMap } from '../auth/cloud'
import { WorldMapCanvas } from '../components/WorldMapCanvas'
import { Icon } from '../components/Icon'
import { PlayerNav } from '../components/PlayerNav'

/** The player's read-only view of the world map their DM shared. Reads
 *  `shared_world_maps` (pins) + `shared_images` (the picture) live via RLS, and
 *  re-fetches on realtime changes so edits and un-sharing propagate. */
export function PlayerWorldMapPage() {
  const { campaignId } = useParams()
  const campaign = useLiveQuery(
    async () => (campaignId ? ((await db.campaigns.get(campaignId)) ?? null) : null),
    [campaignId],
  )
  const linked = campaign?.linkedCampaignId ?? null

  const { session } = useAuth()
  const token = session?.access_token ?? null
  const [map, setMap] = useState<SharedWorldMap | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!linked) return
    let cancelled = false
    const refresh = async () => {
      const m = await getSharedWorldMap(linked)
      let url: string | null = null
      if (m?.imageId) {
        const imgs = await getSharedImages(linked)
        url = imgs.find((i) => i.kind === 'worldmap' && i.id === m.imageId)?.dataUrl ?? null
      }
      if (!cancelled) { setMap(m); setImageUrl(url); setLoaded(true) }
    }
    refresh()
    if (!supabase || !token) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(refresh, 300) }
    const channel = supabase
      .channel(`shared-worldmap-${linked}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_world_maps', filter: `campaign_id=eq.${linked}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_images', filter: `campaign_id=eq.${linked}` }, schedule)
      .subscribe()
    return () => { cancelled = true; if (timer) clearTimeout(timer); supabase!.removeChannel(channel) }
  }, [linked, token])

  if (campaign === undefined) return <div className="content faint">Loading…</div>
  if (!campaign || !linked) {
    return (
      <div className="content">
        <div className="empty">
          <div className="big"><Icon name="map" size={40} strokeWidth={1.4} /></div>
          <p>This campaign has no shared world map.</p>
          <Link className="btn" to={campaignId ? `/player/${campaignId}` : '/'}>← Back</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="content content-wide">
      <PlayerNav campaignId={campaign.id} />
      <div className="row between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h1 className="mb-0">
          <span aria-hidden style={{ marginRight: 8, display: 'inline-flex' }}><Icon name="map" size={20} /></span>
          {map?.name?.trim() || campaign.name} — World Map
        </h1>
      </div>

      {loaded && !map ? (
        <div className="empty"><p>Your DM hasn’t shared a world map yet.</p></div>
      ) : (
        <WorldMapCanvas
          imageUrl={imageUrl}
          width={map?.width ?? 0}
          height={map?.height ?? 0}
          pins={map?.pins ?? []}
        />
      )}
    </div>
  )
}
