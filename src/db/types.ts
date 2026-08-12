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
  /** Optional cover image (StoredImage id) shown on the overview page. */
  coverImageId: Id | null
}

/**
 * An uploaded image, stored as a base64 data URL so it serializes into the JSON
 * backup and renders directly without object-URL lifecycle management. Uploads
 * are downscaled on the client (see lib/image.ts) to keep storage reasonable.
 */
export interface StoredImage extends BaseRecord {
  campaignId: Id
  /** Original filename, used as default alt text. */
  name: string
  mime: string
  /** base64 data URL (e.g. "data:image/webp;base64,…"). */
  dataUrl: string
  width: number
  height: number
  /** Approximate decoded byte size, for display. */
  bytes: number
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
  /** Free-form organizational tags. */
  tags: string[]
}

// Ordered roughly from largest to smallest scope. The nesting hierarchy is
// world > region > kingdom > city/town/village, with dungeon/landmark/other as
// leaf places that can sit anywhere.
export type LocationType =
  | 'world'
  | 'region'
  | 'kingdom'
  | 'city'
  | 'town'
  | 'village'
  | 'dungeon'
  | 'landmark'
  | 'other'

/**
 * A place in the world. Locations nest via `parentLocationId` (the "auto-link"
 * up to its containing region/kingdom/world). Beyond the shared fields, each
 * type surfaces a relevant subset of the structured fields below in the editor
 * (e.g. currency/government on a kingdom; population/trade on a settlement).
 */
export interface Location extends BaseRecord {
  campaignId: Id
  name: string
  type: LocationType
  /** Rich-text (HTML) description. */
  description: string
  /** Containing location — the auto-link up the hierarchy. */
  parentLocationId: Id | null
  /** Free-form organizational tags. */
  tags: string[]

  // --- Structured world-building fields (all optional per type) ---
  /** Kingdom: form of government, e.g. "Feudal monarchy". */
  governmentType: string
  /** Kingdom/settlement: the ruler or leader, linked to an NPC. */
  rulerNpcId: Id | null
  /** Kingdom: official currency. */
  currency: string
  /** Kingdom/settlement: dominant religion(s). */
  religion: string
  /** Kingdom: governing departments / bodies (HTML). */
  departments: string
  /** Settlement: population, kept as text to allow "~5,000" etc. */
  population: string
  /** Settlement: prosperity level (see PROSPERITY_LEVELS). */
  prosperity: string
  /** Settlement: main imports. */
  imports: string
  /** Settlement: main exports. */
  exports: string
  /** Settlement: notable points of interest (HTML). */
  pointsOfInterest: string
  /** Other locations this one is allied with. */
  allyIds: Id[]
  /** Other locations this one is in conflict with. */
  enemyIds: Id[]
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
  /** Free-form organizational tags. */
  tags: string[]
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
  /** Free-form organizational tags. */
  tags: string[]
}

/** A freeform world-building note / wiki page within a campaign. */
export interface Note extends BaseRecord {
  campaignId: Id
  title: string
  /** Body (markdown). */
  body: string
  /** Organizational tags (e.g. "Lore", "Factions", "History"). */
  tags: string[]
}

/**
 * A player's personal note for a campaign — kept separate from the DM's World
 * Notes. Organized in the nav under Player → Notes, subdivided by campaign.
 */
export interface PlayerNote extends BaseRecord {
  campaignId: Id
  title: string
  /** Body (markdown, supports images and [[wiki links]]). */
  body: string
  tags: string[]
}

/** One row of a roll table. Weight controls how many die faces it covers. */
export interface RollTableEntry {
  id: Id
  /** The result text shown when this entry is rolled (markdown). */
  text: string
  /** Relative likelihood — how many consecutive die numbers this row spans. */
  weight: number
}

/**
 * A random table (loot, encounters, wild magic, rumors…). Entries are weighted;
 * the effective die size is the sum of all weights, and each entry occupies a
 * contiguous range of that die (computed in lib/roll.ts).
 */
export interface RollTable extends BaseRecord {
  campaignId: Id
  name: string
  /** Optional grouping label shown in the tables list (e.g. "Loot"). */
  category: string
  description: string
  entries: RollTableEntry[]
  /** Free-form organizational tags. */
  tags: string[]
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
  playerNotes: PlayerNote[]
  rollTables: RollTable[]
  images: StoredImage[]
  links: Link[]
}
