import { useEffect } from 'react'
import { NavLink, useLocation, useMatch } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Icon } from './Icon'
import { CAMPAIGN_NAV_GROUPS, campaignGroupKey, type CampaignNavGroup } from '../lib/campaignNav'
import { useCampaignCounts, type CampaignCounts } from '../lib/useCampaignCounts'
import { useNavCollapsed } from '../lib/useNavCollapsed'

// The active campaign's pages as a tree in the sidebar (and so in the phone
// drawer): the campaign name links to its Overview, then four collapsible groups.
// It only renders on /campaign/:id routes, so other screens keep the plain
// sidebar. Groups start collapsed, animate open and closed, and remember their
// state per group, except the group holding the current page, which opens by
// itself and is marked in accent.

export function CampaignTree() {
  const match = useMatch('/campaign/:campaignId/*')
  const campaignId = match?.params.campaignId
  const campaign = useLiveQuery(
    async () => (campaignId ? ((await db.campaigns.get(campaignId)) ?? null) : null),
    [campaignId],
  )
  const counts = useCampaignCounts(campaignId)
  if (!campaignId || !campaign) return null
  const base = `/campaign/${campaignId}`

  return (
    <div className="ctree" aria-label={`${campaign.name} pages`}>
      <NavLink to={base} end className="nav-link ctree-head">
        <span className="ico" style={{ color: campaign.color }} aria-hidden>
          ●
        </span>
        <span className="ctree-name">{campaign.name}</span>
      </NavLink>
      {CAMPAIGN_NAV_GROUPS.map((g) => (
        <TreeGroup key={g.key} group={g} base={base} counts={counts} />
      ))}
    </div>
  )
}

function TreeGroup({
  group,
  base,
  counts,
}: {
  group: CampaignNavGroup
  base: string
  counts: CampaignCounts | undefined
}) {
  // Collapsed by default (T-68), remembered per browser. The group that holds the
  // current page is the exception: it opens on first render and whenever the route
  // moves into it (a reload, a deep link, a search result or a backlink), so the
  // current link is never hidden. That open is transient, so it doesn't overwrite
  // a stored choice; closing it by hand sticks until the route changes again.
  const { pathname } = useLocation()
  const sub = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : ''
  const hasActive = campaignGroupKey(sub) === group.key
  const [open, toggle, openNow] = useNavCollapsed(`ctree.${group.key}`, false, hasActive)
  useEffect(() => {
    if (hasActive) openNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hasActive])
  const panelId = `ctree-panel-${group.key}`
  return (
    <>
      <button
        className={`sidebar-heading sidebar-heading-btn ctree-group${hasActive ? ' has-active' : ''}`}
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span>{group.label}</span>
        <Icon
          name="chevron-right"
          size={12}
          color="currentColor"
          className={`sidebar-caret${open ? ' open' : ''}`}
        />
      </button>
      {/* Always mounted so the height can animate (grid rows 0fr to 1fr); while
          closed it's visibility:hidden, which also drops the links from the tab
          order and the accessibility tree once the close finishes. */}
      <div id={panelId} className="ctree-panel" data-open={open} role="group" aria-label={group.label}>
        <div className="ctree-panel-inner">
          {group.items.map((i) => {
            const n = i.count && counts ? counts[i.count] : undefined
            return (
              <NavLink key={i.to} to={`${base}/${i.to}`} className="nav-link ctree-link">
                <span>{i.label}</span>
                {n !== undefined && n > 0 && <span className="ctree-count">{n}</span>}
              </NavLink>
            )
          })}
        </div>
      </div>
    </>
  )
}
