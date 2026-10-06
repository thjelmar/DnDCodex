import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { PlayerNav } from '../components/PlayerNav'
import { PartyLoot } from '../components/PartyLoot'

// The shared party treasury and loot on its own tab (reached via the Shared
// menu). Only meaningful for a campaign joined to a DM's cloud campaign.
export function PlayerLootPage() {
  const { campaignId } = useParams()
  const campaign = useLiveQuery(
    async () => (campaignId ? ((await db.campaigns.get(campaignId)) ?? null) : null),
    [campaignId],
  )

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

  return (
    <div className="content player-page">
      <PlayerNav campaignId={campaign.id} />
      <h1 style={{ marginTop: 4 }}>Party loot</h1>
      <p className="subtitle" style={{ marginBottom: 20 }}>
        The party's shared treasury and unclaimed loot, kept in sync with your DM.
      </p>
      {campaign.linkedCampaignId ? (
        <PartyLoot cloudCampaignId={campaign.linkedCampaignId} />
      ) : (
        <p className="faint">
          Party loot shows up once you've joined your DM's campaign online.
        </p>
      )}
    </div>
  )
}
