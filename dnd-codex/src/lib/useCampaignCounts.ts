import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { CampaignCountKey } from './campaignNav'

export type CampaignCounts = Record<CampaignCountKey, number>

/** Live entity counts for a campaign (undefined while loading or with no id). */
export function useCampaignCounts(campaignId: string | undefined): CampaignCounts | undefined {
  return useLiveQuery(async () => {
    if (!campaignId) return undefined
    const [sessions, notes, npcs, locations, items, tables] = await Promise.all([
      db.sessions.where('campaignId').equals(campaignId).count(),
      db.notes.where('campaignId').equals(campaignId).count(),
      db.npcs.where('campaignId').equals(campaignId).count(),
      db.locations.where('campaignId').equals(campaignId).count(),
      db.items.where('campaignId').equals(campaignId).count(),
      db.rollTables.where('campaignId').equals(campaignId).count(),
    ])
    return { sessions, notes, npcs, locations, items, tables }
  }, [campaignId])
}
