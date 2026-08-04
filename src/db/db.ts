import Dexie, { type EntityTable } from 'dexie'
import type {
  Campaign,
  Session,
  Location,
  NPC,
  Item,
  Note,
  RollTable,
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
