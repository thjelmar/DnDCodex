import { Icon } from '../components/Icon'
import { useParams, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { SharedGallery } from '../components/SharedGallery'

/** The full shared gallery for a player campaign — every image the DM shared. */
export function PlayerGalleryPage() {
  const { campaignId } = useParams()
  const campaign = useLiveQuery(
    () => (campaignId ? db.campaigns.get(campaignId) : undefined),
    [campaignId],
  )

  if (campaign === undefined) {
    return <div className="content faint">Loading…</div>
  }
  if (!campaign || !campaign.linkedCampaignId) {
    return (
      <div className="content">
        <div className="empty">
          <div className="big"><Icon name="image" size={40} strokeWidth={1.4} /></div>
          <p>This campaign has no shared gallery.</p>
          <Link className="btn" to={campaignId ? `/player/${campaignId}` : '/'}>
            ← Back
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="content">
      <div className="row between" style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h1 className="mb-0">
          <span aria-hidden style={{ marginRight: 8, display: 'inline-flex' }}><Icon name="image" size={20} /></span>
          {campaign.name} — Shared gallery
        </h1>
        <Link to={`/player/${campaign.id}`} className="btn ghost small">
          ← Back to campaign
        </Link>
      </div>
      <SharedGallery campaignId={campaign.id} linkedCampaignId={campaign.linkedCampaignId} showHeading={false} />
    </div>
  )
}
