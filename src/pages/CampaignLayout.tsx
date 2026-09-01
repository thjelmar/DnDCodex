import { useState } from 'react'
import { useParams, NavLink, Outlet, useOutletContext, Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { updateCampaign } from '../db/repo'
import { SyncToggle } from '../auth/SyncToggle'
import { InvitePlayers } from '../auth/InvitePlayers'
import type { Campaign } from '../db/types'

interface CampaignContext {
  campaign: Campaign
}

/** Child pages read the active campaign via useCampaign(). */
export function useCampaign(): Campaign {
  return useOutletContext<CampaignContext>().campaign
}

const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'sessions', label: 'Sessions' },
  { to: 'notes', label: 'World' },
  { to: 'npcs', label: 'NPCs' },
  { to: 'locations', label: 'Locations' },
  { to: 'items', label: 'Items' },
  { to: 'tables', label: 'Tables' },
  { to: 'encounters', label: 'Encounters' },
  { to: 'map', label: 'Map' },
  { to: 'tags', label: 'Tags' },
]

export function CampaignLayout() {
  const { campaignId } = useParams()
  const campaign = useLiveQuery(
    () => (campaignId ? db.campaigns.get(campaignId) : undefined),
    [campaignId],
  )
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

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

  const startRename = () => {
    setNameDraft(campaign.name)
    setRenaming(true)
  }
  const commitRename = async () => {
    const next = nameDraft.trim()
    setRenaming(false)
    if (next && next !== campaign.name) await updateCampaign(campaign.id, { name: next })
  }

  return (
    <div className="content">
      <div className="row between" style={{ marginBottom: 6, gap: 12, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 12, alignItems: 'center', minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: campaign.color,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          {renaming ? (
            <input
              className="input"
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                else if (e.key === 'Escape') setRenaming(false)
              }}
              style={{
                fontFamily: 'var(--serif)',
                fontSize: 26,
                fontWeight: 600,
                padding: '2px 8px',
                maxWidth: 460,
              }}
            />
          ) : (
            <>
              <h1 className="mb-0">{campaign.name}</h1>
              <button
                className="btn ghost small"
                title="Rename campaign"
                aria-label="Rename campaign"
                onClick={startRename}
                style={{ flexShrink: 0 }}
              >
                ✎
              </button>
            </>
          )}
        </div>
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <InvitePlayers campaign={{ id: campaign.id, name: campaign.name }} />
          <SyncToggle campaign={{ id: campaign.id, name: campaign.name }} />
          <Link to="/" className="btn ghost small">
            ← All campaigns
          </Link>
        </div>
      </div>
      {campaign.summary && (
        <div className="subtitle" style={{ marginBottom: 16 }}>
          {campaign.summary}
        </div>
      )}

      <div className="subnav">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {t.label}
          </NavLink>
        ))}
      </div>

      <Outlet context={{ campaign } satisfies CampaignContext} />
    </div>
  )
}
