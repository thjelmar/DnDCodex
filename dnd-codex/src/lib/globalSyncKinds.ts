import type { GlobalSyncTable } from '../db/types'

// The per-user `user_records` table stores every GLOBAL (cross-campaign) entity
// as one JSONB row keyed by (owner_id, kind, id). This module is the single
// source of truth for the kind <-> Dexie table mapping, mirroring syncKinds.ts
// for the campaign channel.

/** Every Dexie table that participates in the per-user global sync. */
export const GLOBAL_SYNC_TABLES: GlobalSyncTable[] = ['templates']

const TABLE_TO_KIND: Record<GlobalSyncTable, string> = {
  templates: 'template',
}

const KIND_TO_TABLE: Record<string, GlobalSyncTable> = Object.fromEntries(
  Object.entries(TABLE_TO_KIND).map(([t, k]) => [k, t as GlobalSyncTable]),
) as Record<string, GlobalSyncTable>

export function kindForGlobalTable(table: GlobalSyncTable): string {
  return TABLE_TO_KIND[table]
}

/** The Dexie table for a cloud global `kind`, or null for an unknown/future kind. */
export function tableForGlobalKind(kind: string): GlobalSyncTable | null {
  return KIND_TO_TABLE[kind] ?? null
}
