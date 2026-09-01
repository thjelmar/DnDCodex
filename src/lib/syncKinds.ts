import type { SyncTable } from '../db/types'

// The cloud `records` table stores every synced entity as one JSONB row keyed by
// (campaign_id, kind, id). `kind` is a stable short string so the schema never
// has to change when a Dexie record gains a field — the whole object rides along
// in `data`. This module is the single source of truth for the kind ↔ Dexie
// table mapping used by the sync engine and the outbox.

/** Every Dexie table that participates in sync, in dependency-friendly order. */
export const SYNC_TABLES: SyncTable[] = [
  'campaigns',
  'sessions',
  'locations',
  'npcs',
  'items',
  'notes',
  'playerNotes',
  'rollTables',
  'images',
  'links',
  'encounters',
]

const TABLE_TO_KIND: Record<SyncTable, string> = {
  campaigns: 'campaign',
  sessions: 'session',
  locations: 'location',
  npcs: 'npc',
  items: 'item',
  notes: 'note',
  playerNotes: 'playernote',
  rollTables: 'rolltable',
  images: 'image',
  links: 'link',
  encounters: 'encounter',
}

const KIND_TO_TABLE: Record<string, SyncTable> = Object.fromEntries(
  Object.entries(TABLE_TO_KIND).map(([t, k]) => [k, t as SyncTable]),
) as Record<string, SyncTable>

export function kindForTable(table: SyncTable): string {
  return TABLE_TO_KIND[table]
}

/** The Dexie table for a cloud `kind`, or null for an unknown/future kind. */
export function tableForKind(kind: string): SyncTable | null {
  return KIND_TO_TABLE[kind] ?? null
}

/**
 * The owning campaign id for a record in `table`. Campaigns are their own
 * campaign (id === campaignId); everything else carries an explicit campaignId.
 */
export function campaignIdOf(table: SyncTable, record: { id: string; campaignId?: string }): string {
  return table === 'campaigns' ? record.id : (record.campaignId as string)
}
