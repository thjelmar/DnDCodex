// A "recently edited" feed for the campaign Overview, built from the updatedAt
// stamp every record already carries. No new data and no sync: it reads the local
// tables, so it works offline and in the demo.

export type ActivityKind = 'session' | 'npc' | 'location' | 'item' | 'note' | 'rolltable'

export interface ActivityRecord {
  id: string
  /** Display name (title for sessions and notes). */
  name: string
  createdAt: string
  updatedAt: string
}

export interface ActivityEntry {
  kind: ActivityKind
  id: string
  name: string
  /** 'added' when the record has not been edited since it was created. */
  action: 'added' | 'edited'
  at: string
  /** Route under /campaign/:id. */
  to: string
}

const ROUTE: Record<ActivityKind, string> = {
  session: 'sessions',
  npc: 'npcs',
  location: 'locations',
  item: 'items',
  note: 'notes',
  rolltable: 'tables',
}

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  session: 'Session',
  npc: 'NPC',
  location: 'Location',
  item: 'Item',
  note: 'World note',
  rolltable: 'Roll table',
}

/** Merge several tables into one newest-first list, capped at `limit`. */
export function deriveRecentActivity(
  groups: Partial<Record<ActivityKind, ActivityRecord[]>>,
  limit = 6,
): ActivityEntry[] {
  const out: ActivityEntry[] = []
  for (const kind of Object.keys(groups) as ActivityKind[]) {
    for (const r of groups[kind] ?? []) {
      // Saves right after creation stamp updatedAt a moment later; treat anything
      // inside two seconds as "added".
      const gap = new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()
      out.push({
        kind,
        id: r.id,
        name: r.name || 'Untitled',
        action: gap < 2000 ? 'added' : 'edited',
        at: r.updatedAt,
        to: `${ROUTE[kind]}?sel=${r.id}`,
      })
    }
  }
  out.sort((a, b) => b.at.localeCompare(a.at))
  return out.slice(0, limit)
}
