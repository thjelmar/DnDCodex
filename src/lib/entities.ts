import { db } from '../db/db'
import type { Id } from '../db/types'

// A normalized view over every tagged entity in a campaign, used by the tag
// browser, the tag autocomplete, and tag chips. Each entity is reduced to a
// common shape with a display name, its tags, an icon, and a ?sel= deep link.

export type TaggedKind = 'session' | 'npc' | 'location' | 'item' | 'note' | 'rolltable'

export interface TaggedEntity {
  kind: TaggedKind
  id: Id
  name: string
  tags: string[]
  icon: string
  to: string
}

export const KIND_ICON: Record<TaggedKind, string> = {
  session: '📝',
  npc: '🧑',
  location: '📍',
  item: '⚔️',
  note: '📄',
  rolltable: '🎲',
}

export const KIND_LABEL: Record<TaggedKind, string> = {
  session: 'Sessions',
  npc: 'NPCs',
  location: 'Locations',
  item: 'Items',
  note: 'Notes',
  rolltable: 'Roll Tables',
}

/** Loads every tagged entity in the campaign as a normalized list. */
export async function loadTaggedEntities(campaignId: Id): Promise<TaggedEntity[]> {
  const [sessions, npcs, locations, items, notes, tables] = await Promise.all([
    db.sessions.where('campaignId').equals(campaignId).toArray(),
    db.npcs.where('campaignId').equals(campaignId).toArray(),
    db.locations.where('campaignId').equals(campaignId).toArray(),
    db.items.where('campaignId').equals(campaignId).toArray(),
    db.notes.where('campaignId').equals(campaignId).toArray(),
    db.rollTables.where('campaignId').equals(campaignId).toArray(),
  ])
  const out: TaggedEntity[] = []
  const base = `/campaign/${campaignId}`
  sessions.forEach((s) =>
    out.push({ kind: 'session', id: s.id, name: s.title, tags: s.tags ?? [], icon: KIND_ICON.session, to: `${base}/sessions?sel=${s.id}` }))
  npcs.forEach((n) =>
    out.push({ kind: 'npc', id: n.id, name: n.name, tags: n.tags ?? [], icon: KIND_ICON.npc, to: `${base}/npcs?sel=${n.id}` }))
  locations.forEach((l) =>
    out.push({ kind: 'location', id: l.id, name: l.name, tags: l.tags ?? [], icon: KIND_ICON.location, to: `${base}/locations?sel=${l.id}` }))
  items.forEach((i) =>
    out.push({ kind: 'item', id: i.id, name: i.name, tags: i.tags ?? [], icon: KIND_ICON.item, to: `${base}/items?sel=${i.id}` }))
  notes.forEach((nt) =>
    out.push({ kind: 'note', id: nt.id, name: nt.title, tags: nt.tags ?? [], icon: KIND_ICON.note, to: `${base}/notes?sel=${nt.id}` }))
  tables.forEach((t) =>
    out.push({ kind: 'rolltable', id: t.id, name: t.name, tags: t.tags ?? [], icon: KIND_ICON.rolltable, to: `${base}/tables?sel=${t.id}` }))
  return out
}

export interface TagCount {
  tag: string
  count: number
}

/** Aggregates all distinct tags across the given entities, with usage counts. */
export function aggregateTags(entities: TaggedEntity[]): TagCount[] {
  const counts = new Map<string, number>()
  for (const e of entities) {
    for (const tag of e.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
