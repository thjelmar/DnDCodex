import { Icon } from './Icon'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { getSharedImages, type SharedImage } from '../auth/cloud'
import { Modal } from './Modal'

/**
 * The player's live view of the handouts their DM has shown for this campaign —
 * maps, letters, art the DM hands over deliberately, kept separate from the
 * passive Shared gallery. Reads `shared_images` (RLS lets members select),
 * filters to kind='handout', and re-fetches on realtime changes so a handout
 * appears (or disappears) the moment the DM shows or hides it. Renders nothing
 * until a handout is shown.
 */
export function SharedHandouts({
  linkedCampaignId,
  compact = false,
  campaignId,
  limit = 4,
}: {
  linkedCampaignId: string
  /** Compact rail card: small capped thumbnails + a link to the full page. */
  compact?: boolean
  /** Local player campaign id — needed for the "all handouts" link in compact. */
  campaignId?: string
  limit?: number
}) {
  const [handouts, setHandouts] = useState<SharedImage[]>([])
  const [lightbox, setLightbox] = useState<SharedImage | null>(null)
  // Gate the Realtime channel on the auth token (see SharedGallery/useSharedEntities).
  const { session } = useAuth()
  const token = session?.access_token ?? null

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const imgs = await getSharedImages(linkedCampaignId)
      if (!cancelled) setHandouts(imgs.filter((i) => i.kind === 'handout'))
    }
    refresh()
    if (!supabase || !token) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, 300)
    }
    const channel = supabase
      .channel(`handouts-${linkedCampaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_images', filter: `campaign_id=eq.${linkedCampaignId}` },
        schedule,
      )
      .subscribe()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      supabase!.removeChannel(channel)
    }
  }, [linkedCampaignId, token])

  if (handouts.length === 0) return null

  const lb = lightbox && (
    <Modal title={lightbox.caption || 'Handout'} onClose={() => setLightbox(null)}>
      <img src={lightbox.dataUrl} alt={lightbox.caption ?? 'Handout'} style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
    </Modal>
  )

  if (compact) {
    const shown = handouts.slice(0, limit)
    return (
      <div className="card rail-card">
        <div className="rail-card-head">
          <span className="rail-card-title"><Icon name="image" size={15} /> Handouts <span className="faint">{handouts.length}</span></span>
        </div>
        <div className="handout-rail-grid">
          {shown.map((img) => (
            <button key={img.id} className="handout-rail-card" onClick={() => setLightbox(img)} title={img.caption || 'Handout'}>
              <img src={img.dataUrl} alt={img.caption ?? 'Handout'} className="handout-rail-thumb" />
              {img.caption && <span className="handout-rail-cap">{img.caption}</span>}
            </button>
          ))}
        </div>
        {campaignId && (
          <Link className="rail-link" to={`/player/${campaignId}/handouts`}>
            {handouts.length > limit ? `Show all ${handouts.length}` : 'All handouts, by session'} →
          </Link>
        )}
        {lb}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, marginBottom: 10 }}>
        <span aria-hidden style={{ marginRight: 8, display: 'inline-flex' }}><Icon name="image" size={18} /></span>
        Handouts
      </h2>
      <div className="handout-view-grid">
        {handouts.map((img) => (
          <button
            key={img.id}
            className="handout-view-card"
            onClick={() => setLightbox(img)}
            title="Click to enlarge"
          >
            <img src={img.dataUrl} alt={img.caption ?? 'Handout'} className="handout-view-thumb" />
            {img.caption && <div className="handout-view-title">{img.caption}</div>}
          </button>
        ))}
      </div>
      {lb}
    </div>
  )
}
