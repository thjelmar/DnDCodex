import Dexie, { type EntityTable } from 'dexie'
import { markdownToHtml } from '../lib/mdToHtml'
import type {
  Campaign,
  Session,
  Location,
  NPC,
  Item,
  Note,
  RollTable,
  PlayerNote,
  StoredImage,
  Link,
  PendingChange,
  SyncStateRow,
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
  playerNotes!: EntityTable<PlayerNote, 'id'>
  images!: EntityTable<StoredImage, 'id'>
  links!: EntityTable<Link, 'id'>
  // Local-only sync bookkeeping (Phase 3). Not exported, not mirrored.
  pending!: EntityTable<PendingChange, 'id'>
  syncState!: EntityTable<SyncStateRow, 'campaignId'>

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
    // v5 adds player notes — a player-scoped notes collection, separate from
    // the DM's per-campaign World Notes.
    this.version(5).stores({
      playerNotes: 'id, campaignId, title, *tags',
    })
    // v6 converts every markdown prose field into the rich-text HTML that the
    // WYSIWYG editor stores. Inline ![](img:<id>) references are resolved to
    // embedded data URLs, after which images that were only used inline (i.e.
    // not a campaign cover) are pruned.
    this.version(6)
      .stores({})
      .upgrade(async (tx) => {
        const images = await tx.table('images').toArray()
        const imageMap = new Map<string, string>(images.map((i) => [i.id, i.dataUrl]))
        const md = (v: unknown) => markdownToHtml(typeof v === 'string' ? v : '', imageMap)

        await tx.table('campaigns').toCollection().modify((c: { description?: string }) => {
          c.description = md(c.description)
        })
        await tx.table('sessions').toCollection().modify((s: { notes?: string; dmNotes?: string }) => {
          s.notes = md(s.notes)
          s.dmNotes = md(s.dmNotes)
        })
        await tx.table('notes').toCollection().modify((n: { body?: string }) => {
          n.body = md(n.body)
        })
        await tx.table('playerNotes').toCollection().modify((n: { body?: string }) => {
          n.body = md(n.body)
        })
        await tx.table('npcs').toCollection().modify((n: { description?: string }) => {
          n.description = md(n.description)
        })
        await tx.table('locations').toCollection().modify((l: { description?: string }) => {
          l.description = md(l.description)
        })
        await tx.table('items').toCollection().modify((i: { description?: string }) => {
          i.description = md(i.description)
        })

        // Images now live inline in the HTML; keep only those used as covers.
        const campaigns = await tx.table('campaigns').toArray()
        const coverIds = new Set(
          campaigns.map((c) => c.coverImageId).filter((id): id is string => Boolean(id)),
        )
        const orphans = images.filter((i) => !coverIds.has(i.id)).map((i) => i.id)
        if (orphans.length) await tx.table('images').bulkDelete(orphans)
      })
    // v7 backfills the new structured world-building fields on locations.
    this.version(7).upgrade(async (tx) => {
      await tx
        .table('locations')
        .toCollection()
        .modify((l: Record<string, unknown>) => {
          l.governmentType ??= ''
          l.rulerNpcId ??= null
          l.currency ??= ''
          l.religion ??= ''
          l.departments ??= ''
          l.population ??= ''
          l.prosperity ??= ''
          l.imports ??= ''
          l.exports ??= ''
          l.pointsOfInterest ??= ''
          l.allyIds ??= []
          l.enemyIds ??= []
        })
    })
    // v8: campaigns gain a dm/player role (existing ones are DM campaigns);
    // player notes gain a section + journal date + quest status.
    this.version(8).upgrade(async (tx) => {
      await tx
        .table('campaigns')
        .toCollection()
        .modify((c: Record<string, unknown>) => {
          c.role ??= 'dm'
        })
      await tx
        .table('playerNotes')
        .toCollection()
        .modify((n: Record<string, unknown>) => {
          n.section ??= 'notes'
          n.date ??= ''
          n.status ??= ''
        })
    })
    // v9: campaigns gain a list of external quick links.
    this.version(9).upgrade(async (tx) => {
      await tx
        .table('campaigns')
        .toCollection()
        .modify((c: Record<string, unknown>) => {
          c.externalLinks ??= []
        })
    })
    // v10: player campaigns can link to a cloud campaign (for account shares).
    this.version(10).upgrade(async (tx) => {
      await tx
        .table('campaigns')
        .toCollection()
        .modify((c: Record<string, unknown>) => {
          c.linkedCampaignId ??= null
        })
    })
    // v11 adds local-only sync bookkeeping tables (Phase 3 full campaign sync):
    // `pending` is the push outbox, `syncState` tracks each campaign's pull
    // cursor. No existing data is touched.
    this.version(11).stores({
      pending: '++id, campaignId, [table+recordId]',
      syncState: 'campaignId',
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
