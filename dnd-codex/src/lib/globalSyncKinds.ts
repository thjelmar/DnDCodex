import type { GlobalSyncTable } from '../db/types'

// The per-user `user_records` table stores every GLOBAL (cross-campaign) entity
// as one JSONB row keyed by (owner_id, kind, id). This module is the single
// source of truth for the kind <-> Dexie table mapping, mirroring syncKinds.ts
// for the campaign channel.

/** Every Dexie table that participates in the per-user global sync. */
export const GLOBAL_SYNC_TABLES: GlobalSyncTable[] = ['templates', 'genTables', 'duelHistory', 'overviewLayout']

const TABLE_TO_KIND: Record<GlobalSyncTable, string> = {
  templates: 'template',
  genTables: 'genTable',
  duelHistory: 'duelRecord',
  overviewLayout: 'overviewLayout',
}

// Each table's Dexie primary-key field. The record body carries it, so the pull
// side finds the local key there. The cloud `id` is that key when it is a uuid
// (templates) or a deterministic uuid derived from it (a generator table's slot,
// a duel's day); see globalSyncId.ts (T-93).
export const GLOBAL_TABLE_KEY: Record<GlobalSyncTable, string> = {
  templates: 'id',
  genTables: 'slot',
  duelHistory: 'day',
  overviewLayout: 'id',
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
