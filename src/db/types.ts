// Core domain types for D&D Codex.
//
// Every persisted record carries a string `id` (crypto.randomUUID) plus
// `createdAt` / `updatedAt` ISO timestamps. Records that belong to a campaign
// carry `campaignId`. Keeping these conventions uniform lets generic helpers
// (create/update/delete, linking, export) work across every entity type.

export type Id = string
export type ISODate = string // e.g. "2026-08-04T12:00:00.000Z" or "2026-08-04"

/** Every entity kind that can be linked to another. */
export type EntityKind =
  | 'campaign'
  | 'session'
  | 'npc'
  | 'location'
  | 'item'
  | 'note'

export interface BaseRecord {
  id: Id
  createdAt: ISODate
  updatedAt: ISODate
}

/** A single campaign / world. The top-level container for everything else. */
export interface Campaign extends BaseRecord {
  name: string
  /** Short pitch / summary shown on cards. */
  summary: string
  /** Long-form world overview (markdown). */
  description: string
  /** Accent color used for the campaign's cards and headers. */
  color: string
  /** IDs of other campaigns referenced by this one (shared worlds, sequels). */
  relatedCampaignIds: Id[]
  archived: boolean
}

/** A play session with a date and notes. */
export interface Session extends BaseRecord {
  campaignId: Id
  title: string
  /** Calendar date of the session (YYYY-MM-DD). */
  date: ISODate
  /** Player-facing recap / notes (markdown). */
  notes: string
  /** Private DM-only notes for this session (markdown). */
  dmNotes: string
}

export type LocationType =
  | 'region'
  | 'city'
  | 'town'
  | 'village'
  | 'dungeon'
  | 'landmark'
  | 'other'

/** A place in the world. Locations nest via `parentLocationId`. */
export interface Location extends BaseRecord {
  campaignId: Id
  name: string
  type: LocationType
  description: string
  /** Optional containing location (e.g. a town within a region). */
  parentLocationId: Id | null
}

/** A non-player character. */
export interface NPC extends BaseRecord {
  campaignId: Id
  name: string
  /** Role / occupation (e.g. "Innkeeper", "Big Bad"). */
  role: string
  description: string
  /** Where this NPC is usually found. */
  locationId: Id | null
  /** Freeform stat block or mechanical notes (markdown). */
  statBlock: string
  /** Disposition toward the party. */
  disposition: 'friendly' | 'neutral' | 'hostile' | 'unknown'
}

export type ItemRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'very rare'
  | 'legendary'
  | 'artifact'

/** A piece of loot / equipment. */
export interface Item extends BaseRecord {
  campaignId: Id
  name: string
  rarity: ItemRarity
  /** Type (e.g. "Weapon", "Wondrous Item", "Potion"). */
  category: string
  description: string
  attunement: boolean
  /** Approximate value in gp (freeform text to allow "priceless" etc.). */
  value: string
}

/** A freeform world-building note / wiki page within a campaign. */
export interface Note extends BaseRecord {
  campaignId: Id
  title: string
  /** Body (markdown). */
  body: string
  /** Optional grouping tag (e.g. "Lore", "Factions", "History"). */
  category: string
}

/**
 * A typed link between two entities, e.g. an NPC "resides in" a Location, or a
 * Location "allied with" another Location. Links are undirected in meaning but
 * stored directionally (from -> to); the UI shows them from both sides.
 */
export interface Link extends BaseRecord {
  campaignId: Id
  fromKind: EntityKind
  fromId: Id
  toKind: EntityKind
  toId: Id
  /** Human-readable relationship label, e.g. "ally of", "located in". */
  label: string
}

/** Discriminated union used by generic helpers and the export payload. */
export interface DatabaseSnapshot {
  version: number
  exportedAt: ISODate
  campaigns: Campaign[]
  sessions: Session[]
  locations: Location[]
  npcs: NPC[]
  items: Item[]
  notes: Note[]
  links: Link[]
}
