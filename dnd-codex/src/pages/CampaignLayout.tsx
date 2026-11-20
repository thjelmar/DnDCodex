import { useParams, Outlet, useOutletContext, useLocation, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { SyncToggle } from '../auth/SyncToggle'
import { InvitePlayers } from '../auth/InvitePlayers'
import { PushChangesPanel } from '../components/PushChangesPanel'
import { CampaignNav } from '../components/CampaignNav'
import { Icon } from '../components/Icon'
import { LiveSceneKeeper } from './LiveSceneKeeper'
import { campaignPageLabel } from '../lib/campaignNav'
import type { Campaign } from '../db/types'

interface CampaignContext {
  campaign: Campaign
}

/** Child pages read the active campaign via useCampaign(). */
export function useCampaign(): Campaign {
  return useOutletContext<CampaignContext>().campaign
}

export function CampaignLayout() {
  const { campaignId } = useParams()
  // The battle map is a spatial tool, so it drops the text-column width cap and
  // fills the screen; the reading-width tabs keep the default .content width.
  const path = useLocation().pathname
  const wideTab = path.endsWith('/battlemap') || path.endsWith('/worldmap')
  const campaign = useLiveQuery(
    // `?? null` so a missing campaign reads as "not found", not "still loading".
    async () => (campaignId ? ((await db.campaigns.get(campaignId)) ?? null) : null),
    [campaignId],
  )
  if (campaign === undefined) {
    return <div className="content faint">Loading…</div>
  }
  if (campaign === null || !campaign) {
    return (
      <div className="content">
        <div className="empty">
          <div className="big">🗺️</div>
          <p>That campaign doesn't exist.</p>
          <Link className="btn" to="/">
            Back to campaigns
          </Link>
        </div>
      </div>
    )
  }

  const base = `/campaign/${campaign.id}`
  const sub = path.startsWith(base) ? path.slice(base.length).replace(/^\/+/, '') : ''
  const pageLabel = sub === '' ? null : campaignPageLabel(sub)

  return (
    <div className={`content${wideTab ? ' content-wide' : ''}${sub === '' ? ' content-overview' : ''}`}>
      <div className="camp-head">
        {/* Breadcrumb: where you are. The page's own navigation is the sidebar
            tree (components/CampaignTree.tsx); the Overview shows the big title. */}
        <nav className="camp-crumb" aria-label="Breadcrumb">
          <Link to="/" className="camp-crumb-link">
            <Icon name="arrow-left" size={13} /> All campaigns
          </Link>
          <span className="camp-crumb-sep" aria-hidden>/</span>
          <span aria-hidden className="camp-dot" style={{ background: campaign.color }} />
          <Link to={base} className="camp-crumb-link camp-crumb-name">
            {campaign.name}
          </Link>
          {pageLabel && (
            <>
              <span className="camp-crumb-sep" aria-hidden>/</span>
              <span className="camp-crumb-page" aria-current="page">{pageLabel}</span>
            </>
          )}
        </nav>
        <div className="camp-actions">
          <Link to={`/run/${campaign.id}`} className="btn primary small" title="At-the-table screen: session notes, what's in play, combat and dice">
            <Icon name="play" size={12} color="inherit" /> Run session
          </Link>
          <PushChangesPanel campaignId={campaign.id} />
          <InvitePlayers campaign={{ id: campaign.id, name: campaign.name }} />
          <SyncToggle campaign={{ id: campaign.id, name: campaign.name }} />
        </div>
      </div>

      {/* The tab bar only returns when the desktop sidebar is collapsed (the
          tree is hidden then); CSS decides, see .camp-tabbar-fallback. */}
      <div className="camp-tabbar-fallback">
        <CampaignNav />
      </div>

      <Outlet context={{ campaign } satisfies CampaignContext} />
      {/* Keeps a live battle map in sync when its editor isn't open. */}
      <LiveSceneKeeper campaign={campaign} />
    </div>
  )
}
