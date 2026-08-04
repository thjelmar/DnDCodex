import Dexie, { type EntityTable } from 'dexie'
import type {
  Campaign,
  Session,
  Location,
  NPC,
  Item,
  Note,
  RollTable,
  StoredImage,
  Link,
} from './types'

// The Dexie instance. Each table is keyed by `id`; the strings after `id`
// declare additional indexes used for lookups (e.g. all sessions in a
// campaign). Only indexed fields are listed here — Dexie stores the whole
// object regardless.
export class CodexDB extends Dexie {
  campaigns!: EntityTable<Campaign, 'id'>
  sessions!: EntityTable<Session, 'id'>
  locations!: EntityTable<Location, 'id'>
  npcs!: EntityTable<NPC, 'id'>
  items!: EntityTable<Item, 'id'>
  notes!: EntityTable<Note, 'id'>
  rollTables!: EntityTable<RollTable, 'id'>
  images!: EntityTable<StoredImage, 'id'>
  links!: EntityTable<Link, 'id'>

  constructor() {
    super('dnd-codex')
    this.version(1).stores({
      campaigns: 'id, name, updatedAt, archived',
      sessions: 'id, campaignId, date, updatedAt',
      locations: 'id, campaignId, name, type, parentLocationId',
      npcs: 'id, campaignId, name, locationId',
      items: 'id, campaignId, name, rarity',
      notes: 'id, campaignId, title, category',
      // Compound indexes let us efficiently find links touching an entity from
      // either side.
      links: 'id, campaignId, [fromKind+fromId], [toKind+toId]',
    })
    // v2 adds roll tables. Dexie carries the v1 stores forward automatically;
    // only the changed/new store needs to be declared here.
    this.version(2).stores({
      rollTables: 'id, campaignId, name, category',
    })
    // v3 adds free-form `tags` to every campaign-scoped entity, indexed with a
    // multiEntry (`*tags`) index so we can query by tag. The upgrade migrates
    // each note's single `category` into its new `tags` array and backfills an
    // empty array on everything else.
    this.version(3)
      .stores({
        sessions: 'id, campaignId, date, updatedAt, *tags',
        locations: 'id, campaignId, name, type, parentLocationId, *tags',
        npcs: 'id, campaignId, name, locationId, *tags',
        items: 'id, campaignId, name, rarity, *tags',
        notes: 'id, campaignId, title, *tags',
        rollTables: 'id, campaignId, name, category, *tags',
      })
      .upgrade(async (tx) => {
        await tx
          .table('notes')
          .toCollection()
          .modify((n: { tags?: string[]; category?: string }) => {
            if (n.tags == null) n.tags = n.category ? [n.category] : []
            delete n.category
          })
        for (const name of ['sessions', 'locations', 'npcs', 'items', 'rollTables']) {
          await tx
            .table(name)
            .toCollection()
            .modify((r: { tags?: string[] }) => {
              if (r.tags == null) r.tags = []
            })
        }
      })
    // v4 adds an `images` store (uploaded images as base64 data URLs) and a
    // `coverImageId` on campaigns.
    this.version(4)
      .stores({
        images: 'id, campaignId',
      })
      .upgrade(async (tx) => {
        await tx
          .table('campaigns')
          .toCollection()
          .modify((c: { coverImageId?: string | null }) => {
            if (c.coverImageId === undefined) c.coverImageId = null
          })
      })
  }
}

export const db = new CodexDB()

/** Convenience for generating record ids consistently across the app. */
export function newId(): string {
  return crypto.randomUUID()
}

/** Current timestamp as an ISO string. */
export function now(): string {
  return new Date().toISOString()
}
