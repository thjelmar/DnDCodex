import { Icon } from '../components/Icon'
import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { getSharedImages, type SharedImage } from '../auth/cloud'
import { Modal } from '../components/Modal'
import { PlayerNav } from '../components/PlayerNav'
import { formatDate } from '../lib/format'

/** The player's full handouts view — every handout the DM is currently showing,
 *  grouped and filterable by the session it was given in. Live over Realtime. */
export function PlayerHandoutsPage() {
  const { campaignId } = useParams()
  const campaign = useLiveQuery(() => (campaignId ? db.campaigns.get(campaignId) : undefined), [campaignId])

  if (campaign === undefined) return <div className="content faint">Loading…</div>
  if (!campaign || !campaign.linkedCampaignId) {
    return (
      <div className="content">
        <div className="empty">
          <div className="big"><Icon name="image" size={40} strokeWidth={1.4} /></div>
          <p>This campaign has no handouts.</p>
          <Link className="btn" to={campaignId ? `/player/${campaignId}` : '/'}>← Back</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="content">
      <PlayerNav campaignId={campaign.id} />
      <div className="row between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h1 className="mb-0">
          <span aria-hidden style={{ marginRight: 8, display: 'inline-flex' }}><Icon name="image" size={20} /></span>
          {campaign.name} — Handouts
        </h1>
      </div>
      <HandoutsBySession linkedCampaignId={campaign.linkedCampaignId} />
    </div>
  )
}

function HandoutsBySession({ linkedCampaignId }: { linkedCampaignId: string }) {
  const [handouts, setHandouts] = useState<SharedImage[]>([])
  const [lightbox, setLightbox] = useState<SharedImage | null>(null)
  const [sel, setSel] = useState<string>('all')
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
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(refresh, 300) }
    const channel = supabase
      .channel(`handouts-page-${linkedCampaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_images', filter: `campaign_id=eq.${linkedCampaignId}` }, schedule)
      .subscribe()
    return () => { cancelled = true; if (timer) clearTimeout(timer); supabase!.removeChannel(channel) }
  }, [linkedCampaignId, token])

  const groups = useMemo(() => {
    const m = new Map<string, { key: string; label: string; date: string; items: SharedImage[] }>()
    for (const h of handouts) {
      const key = h.sessionId || (h.sessionTitle ? `t:${h.sessionTitle}` : 'none')
      const label = h.sessionTitle || (key === 'none' ? 'No session' : 'Session')
      if (!m.has(key)) m.set(key, { key, label, date: h.sessionDate || '', items: [] })
      m.get(key)!.items.push(h)
    }
    return [...m.values()].sort((a, b) => {
      if (a.key === 'none') return 1
      if (b.key === 'none') return -1
      return (b.date || '').localeCompare(a.date || '')
    })
  }, [handouts])

  if (handouts.length === 0) {
    return <p className="faint">No handouts are being shown right now. They’ll appear here when your DM shows one.</p>
  }

  const visible = sel === 'all' ? groups : groups.filter((g) => g.key === sel)

  return (
    <>
      {groups.length > 1 && (
        <div className="handout-filter" role="group" aria-label="Filter handouts by session">
          <button className={sel === 'all' ? 'active' : ''} onClick={() => setSel('all')}>All</button>
          {groups.map((g) => (
            <button key={g.key} className={sel === g.key ? 'active' : ''} onClick={() => setSel(g.key)}>{g.label}</button>
          ))}
        </div>
      )}

      {visible.map((g) => (
        <div key={g.key} className="handout-group">
          <div className="handout-group-head">
            <span className="handout-group-label">{g.label}</span>
            {g.date && <span className="faint" style={{ fontSize: 12.5 }}>{formatDate(g.date)}</span>}
            <span className="faint" style={{ fontSize: 12.5 }}>· {g.items.length}</span>
          </div>
          <div className="handout-view-grid">
            {g.items.map((img) => (
              <button key={img.id} className="handout-view-card" onClick={() => setLightbox(img)} title="Click to enlarge">
                <img src={img.dataUrl} alt={img.caption ?? 'Handout'} className="handout-view-thumb" />
                {img.caption && <div className="handout-view-title">{img.caption}</div>}
              </button>
            ))}
          </div>
        </div>
      ))}

      {lightbox && (
        <Modal title={lightbox.caption || 'Handout'} onClose={() => setLightbox(null)}>
          <img src={lightbox.dataUrl} alt={lightbox.caption ?? 'Handout'} style={{ maxWidth: '100%', borderRadius: 8, display: 'block' }} />
        </Modal>
      )}
    </>
  )
}
