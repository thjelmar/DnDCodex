import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSharedImages, type SharedImage } from '../auth/cloud'
import { Modal } from './Modal'

/**
 * The player's live view of the images their DM shared for this campaign. Reads
 * `shared_images` directly (RLS lets members select) and re-fetches on realtime
 * changes, so images appear or disappear as the DM toggles sharing. Renders
 * nothing until something is shared.
 *
 * With `limit`, shows only the most recent N and a "Show all" link to the full
 * gallery page (used on the campaign home); without it, shows everything.
 */
export function SharedGallery({
  campaignId,
  linkedCampaignId,
  limit,
  showHeading = true,
}: {
  /** The local player campaign id — used to build the "show all" link. */
  campaignId: string
  /** The cloud campaign id shared images are read from. */
  linkedCampaignId: string
  limit?: number
  showHeading?: boolean
}) {
  const [images, setImages] = useState<SharedImage[]>([])
  const [lightbox, setLightbox] = useState<SharedImage | null>(null)

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const imgs = await getSharedImages(linkedCampaignId)
      if (!cancelled) setImages(imgs)
    }
    refresh()
    if (!supabase) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(refresh, 300)
    }
    const channel = supabase
      .channel(`shared-images-${linkedCampaignId}`)
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
  }, [linkedCampaignId])

  if (images.length === 0) return null

  const shown = limit ? images.slice(0, limit) : images
  const remaining = images.length - shown.length

  return (
    <div style={{ marginBottom: 24 }}>
      {showHeading && (
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>
          <span aria-hidden style={{ marginRight: 8 }}>🖼️</span>
          Shared gallery
        </h2>
      )}
      <div className="gallery-grid">
        {shown.map((img) => (
          <button
            key={img.id}
            className="gallery-card"
            onClick={() => setLightbox(img)}
            style={{ padding: 0, border: '1px solid var(--border)', cursor: 'zoom-in', textAlign: 'left' }}
            title="Click to enlarge"
          >
            <img src={img.dataUrl} alt={img.caption ?? ''} className="gallery-thumb" />
            {img.caption && (
              <div className="gallery-card-body">
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{img.caption}</span>
              </div>
            )}
          </button>
        ))}
      </div>
      {remaining > 0 && (
        <div style={{ marginTop: 12 }}>
          <Link className="btn small" to={`/player/${campaignId}/gallery`}>
            Show all {images.length} images →
          </Link>
        </div>
      )}
      {lightbox && (
        <Modal title={lightbox.caption || 'Shared image'} onClose={() => setLightbox(null)}>
          <img src={lightbox.dataUrl} alt={lightbox.caption ?? ''} style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
        </Modal>
      )}
    </div>
  )
}
