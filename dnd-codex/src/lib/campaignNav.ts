// The campaign's page list, grouped the way a DM works: Prep, Run, World,
// Reference. This is the single source for the sidebar/drawer tree
// (components/CampaignTree.tsx) and the breadcrumb in the campaign header.
// `to` is the route segment after /campaign/:id ('' is the Overview).

export type CampaignCountKey = 'sessions' | 'notes' | 'npcs' | 'locations' | 'items' | 'tables'

export interface CampaignNavItem {
  to: string
  label: string
  /** Shows a live count badge when set. */
  count?: CampaignCountKey
}

export interface CampaignNavGroup {
  key: string
  label: string
  items: CampaignNavItem[]
}

export const CAMPAIGN_NAV_GROUPS: CampaignNavGroup[] = [
  {
    key: 'prep',
    label: 'Prep',
    items: [
      { to: 'sessions', label: 'Sessions', count: 'sessions' },
      { to: 'timeline', label: 'Timeline' },
      { to: 'tables', label: 'Tables', count: 'tables' },
      { to: 'handouts', label: 'Handouts' },
    ],
  },
  {
    key: 'run',
    label: 'Run',
    items: [
      { to: 'battlemap', label: 'Battle Map' },
      { to: 'loot', label: 'Loot' },
      { to: 'gallery', label: 'Gallery' },
    ],
  },
  {
    key: 'world',
    label: 'World',
    items: [
      { to: 'notes', label: 'World notes', count: 'notes' },
      { to: 'locations', label: 'Locations', count: 'locations' },
      { to: 'map', label: 'Map' },
      { to: 'worldmap', label: 'World Map' },
      { to: 'npcs', label: 'NPCs', count: 'npcs' },
      { to: 'families', label: 'Families' },
      { to: 'races', label: 'Races' },
    ],
  },
  {
    key: 'reference',
    label: 'Reference',
    items: [
      { to: 'items', label: 'Items', count: 'items' },
      { to: 'tags', label: 'Tags' },
    ],
  },
]

/** The label for a campaign sub-route ('' → Overview), or null if unknown. */
export function campaignPageLabel(sub: string): string | null {
  if (sub === '') return 'Overview'
  for (const g of CAMPAIGN_NAV_GROUPS) {
    const hit = g.items.find((i) => i.to === sub)
    if (hit) return hit.label
  }
  return null
}

/** The group a sub-route belongs to (used to open it by default). */
export function campaignGroupKey(sub: string): string | null {
  for (const g of CAMPAIGN_NAV_GROUPS) {
    if (g.items.some((i) => i.to === sub)) return g.key
  }
  return null
}
