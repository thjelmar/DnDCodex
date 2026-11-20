import { NavLink, useMatch } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Icon } from './Icon'
import { CAMPAIGN_NAV_GROUPS, type CampaignNavGroup } from '../lib/campaignNav'
import { useCampaignCounts, type CampaignCounts } from '../lib/useCampaignCounts'
import { useNavCollapsed } from '../lib/useNavCollapsed'

// The active campaign's pages as a tree in the sidebar (and so in the phone
// drawer): the campaign name links to its Overview, then four collapsible groups.
// It only renders on /campaign/:id routes, so other screens keep the plain
// sidebar. Collapsed/open state is remembered per group.

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
  const [open, toggle] = useNavCollapsed(`ctree.${group.key}`, true)
  return (
    <>
      <button
        className="sidebar-heading sidebar-heading-btn ctree-group"
        onClick={toggle}
        aria-expanded={open}
      >
        <span>{group.label}</span>
        <Icon
          name="chevron-right"
          size={12}
          color="currentColor"
          className={`sidebar-caret${open ? ' open' : ''}`}
        />
      </button>
      {open &&
        group.items.map((i) => {
          const n = i.count && counts ? counts[i.count] : undefined
          return (
            <NavLink key={i.to} to={`${base}/${i.to}`} className="nav-link ctree-link">
              <span>{i.label}</span>
              {n !== undefined && n > 0 && <span className="ctree-count">{n}</span>}
            </NavLink>
          )
        })}
    </>
  )
}
