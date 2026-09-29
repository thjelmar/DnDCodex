import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAuth } from '../auth/AuthProvider'
import { getLiveScene } from '../auth/liveScene'
import { PlayerJournalPanel } from './PlayerJournalPanel'
import { supabase } from '../lib/supabase'
import { PlayerLiveBoard } from '../components/PlayerLiveBoard'
import { Icon } from '../components/Icon'

// The standalone player battle map page: the DM's live map outside a live
// session (e.g. between sessions). Full screen puts the player's Session
// Journal beside the map. During a live session the same board lives in the
// session page's Tabletop card.

export function PlayerBattleMapPage() {
  const { campaignId } = useParams()
  const campaign = useLiveQuery(
    async () => (campaignId ? ((await db.campaigns.get(campaignId)) ?? null) : null),
    [campaignId],
  )

  if (campaign === undefined) return <div className="content faint">Loading…</div>
  if (!campaign || !campaign.linkedCampaignId) {
    return (
      <div className="content">
        <div className="empty">
          <div className="big">🗺️</div>
          <p>This campaign isn't linked to a DM yet, so there's no battle map to show.</p>
          <Link className="btn" to={campaignId ? `/player/${campaignId}` : '/'}>← Back</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="content player-battlemap">
      <div className="row between" style={{ marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <h1 className="mb-0">
          <span aria-hidden style={{ marginRight: 8 }}>🗺️</span>Battle Map
        </h1>
        <Link to={`/player/${campaign.id}`} className="btn ghost small">
          <Icon name="arrow-left" size={14} /> {campaign.name}
        </Link>
      </div>
      <PlayerLiveBoard
        linkedCampaignId={campaign.linkedCampaignId}
        notes={<PlayerJournalPanel campaignId={campaign.id} />}
        notesLabel="Journal"
      />
    </div>
  )
}

/**
 * Player-home entry point: a card that appears while the DM is showing a map.
 * Watches only the scene row (not tokens or the map image) to stay light.
 */
export function LiveMapLink({ campaignId, linkedCampaignId }: { campaignId: string; linkedCampaignId: string }) {
  const { session } = useAuth()
  const token = session?.access_token ?? null
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase || !token) return
    let cancelled = false
    const load = () =>
      getLiveScene(linkedCampaignId).then((s) => {
        if (!cancelled) setName(s ? s.name || 'Battle Map' : null)
      })
    load()
    const channel = supabase
      .channel(`live-scene-card-${linkedCampaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_scenes', filter: `campaign_id=eq.${linkedCampaignId}` }, load)
      .subscribe()
    return () => {
      cancelled = true
      supabase!.removeChannel(channel)
    }
  }, [linkedCampaignId, token])

  // Only while the DM is showing a map (the player home stays uncluttered).
  if (!name) return null
  return (
    <Link to={`/player/${campaignId}/battlemap`} className="battlemap-card live">
      <span className="battlemap-card-icon" aria-hidden>🗺️</span>
      <span className="battlemap-card-text">
        <strong>Battle Map</strong>
        <span className="faint">Your DM is showing “{name}”, live</span>
      </span>
      <span className="battlemap-live-pill"><span className="battlemap-live-dot" aria-hidden /> Live</span>
    </Link>
  )
}
