import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { PlayerNav } from '../components/PlayerNav'
import { RecapTimeline, hasRecap } from '../components/RecapTimeline'
import { useSharedEntities } from '../components/SharedEntities'
import type { PlayerNote } from '../db/types'

// The full "Story so far" recap on its own tab: the DM's shared session beats
// woven with the player's own journal. The landing shows a short preview that
// links here.
export function PlayerStoryPage() {
  const { campaignId } = useParams()
  const campaign = useLiveQuery(
    async () => (campaignId ? ((await db.campaigns.get(campaignId)) ?? null) : null),
    [campaignId],
  )
  const journal = useLiveQuery(
    () =>
      campaignId
        ? db.playerNotes.where('campaignId').equals(campaignId).and((n) => n.section === 'journal').toArray()
        : Promise.resolve<PlayerNote[]>([]),
    [campaignId],
  )
  const sharedRows = useSharedEntities(campaign?.linkedCampaignId)

  if (campaign === undefined) return <div className="content faint">Loading…</div>
  if (!campaign || !campaignId) {
    return (
      <div className="content">
        <div className="empty">
          <p>That campaign doesn't exist.</p>
          <Link className="btn" to="/">Back to campaigns</Link>
        </div>
      </div>
    )
  }

  const journalNotes = (journal ?? []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  const show = hasRecap(sharedRows, journalNotes)

  return (
    <div className="content player-page">
      <PlayerNav campaignId={campaign.id} />
      <h1 style={{ marginTop: 4 }}>Story so far</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        How the campaign has unfolded — your DM's recaps and your own journal, in order.
      </p>
      {show ? (
        <RecapTimeline sharedRows={sharedRows} journal={journalNotes} />
      ) : (
        <p className="faint">
          Nothing to recap yet. Session notes you write and recaps your DM shares will appear here.
        </p>
      )}
    </div>
  )
}
