import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Item, Location, Note, NPC, RollTable, Session } from '../db/types'
import type { SceneSummary } from './hubCards'

// One local read for everything the campaign Overview derives from: the prep
// checklist, the recently edited feed and the hub cards. Sharing it means each
// table is read once per change instead of once per panel. Everything is
// Dexie only (no cloud call), so it works offline and in the demo.
//
// Scene and world-map rows are loaded in full (the stores have no index that
// would read less: `scenes` is indexed by id, campaignId, name and updatedAt
// separately, so there is no way to read one campaign's newest scene alone), but only
// five scene fields and the pin location ids are kept. Both are small next to
// images. The `images` table is never read here, because it holds the large data
// URLs; the cover image is a single get by id in CampaignHero.
//
// There is deliberately no handouts count: `images` is indexed by campaignId only
// (a boolean can't be an IndexedDB key), so counting handouts means reading every
// image record. It can come back later behind an indexed numeric flag, which
// needs its own Dexie version (see T-75).

export interface OverviewData {
  sessions: Session[]
  npcs: NPC[]
  locations: Location[]
  items: Item[]
  notes: Note[]
  tables: RollTable[]
  scenes: SceneSummary[]
  /** Ids of locations that have a pin on a world map. */
  mappedLocationIds: string[]
  timelineCount: number
  familyCount: number
}

export function useOverviewData(campaignId: string): OverviewData | undefined {
  return useLiveQuery(async () => {
    const id = campaignId
    const [sessions, npcs, locations, items, notes, tables, scenes, worldMaps, timelineCount, familyCount] =
      await Promise.all([
        db.sessions.where('campaignId').equals(id).toArray(),
        db.npcs.where('campaignId').equals(id).toArray(),
        db.locations.where('campaignId').equals(id).toArray(),
        db.items.where('campaignId').equals(id).toArray(),
        db.notes.where('campaignId').equals(id).toArray(),
        db.rollTables.where('campaignId').equals(id).toArray(),
        db.scenes.where('campaignId').equals(id).toArray(),
        db.worldMaps.where('campaignId').equals(id).toArray(),
        db.timelineEvents.where('campaignId').equals(id).count(),
        db.families.where('campaignId').equals(id).count(),
      ])
    const mapped = new Set<string>()
    for (const m of worldMaps) {
      for (const p of m.pins ?? []) if (p.ref?.kind === 'location') mapped.add(p.ref.id)
    }
    return {
      sessions,
      npcs,
      locations,
      items,
      notes,
      tables,
      scenes: scenes.map((s) => ({
        id: s.id,
        name: s.name,
        width: s.width,
        height: s.height,
        cellPx: s.grid?.cellPx ?? 0,
        updatedAt: s.updatedAt,
      })),
      mappedLocationIds: [...mapped],
      timelineCount,
      familyCount,
    }
  }, [campaignId])
}
