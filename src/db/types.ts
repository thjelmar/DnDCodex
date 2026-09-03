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
  | 'playernote'

export interface BaseRecord {
  id: Id
  createdAt: ISODate
  updatedAt: ISODate
}

/**
 * Whether this campaign is one the user runs (DM section, full world-building)
 * or one they merely play in (Player section, a lightweight notes home).
 */
export type CampaignRole = 'dm' | 'player'

/** A labeled external link (e.g. a D&D Beyond page) shown as a button. */
export interface ExternalLink {
  id: Id
  label: string
  /** An http(s) URL. */
  url: string
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
  /** dm = you run it; player = you play in it (Player section only). */
  role: CampaignRole
  /** Quick links to external tools (D&D Beyond, character sheets, VTT…). */
  externalLinks: ExternalLink[]
  /**
   * For a player campaign created by joining a DM's campaign: the cloud
   * campaign id it's linked to, so account-delivered shares land here. Null for
   * DM campaigns and manually-added player campaigns.
   */
  linkedCampaignId: Id | null
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

/** The six ability scores, keyed by their short names. */
export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

/** One named entry in a stat-block section (a trait, action, reaction, …). */
export interface StatBlockEntry {
  id: Id
  name: string
  /** Body text; plain text, line breaks preserved. */
  text: string
}

/**
 * A structured 5e (2024) monster/NPC stat block, matching the D&D Beyond field
 * order. Everything is optional/empty by default; the editor and renderer
 * compute ability modifiers, saving throws, proficiency bonus, and XP so the
 * DM never hand-maths them. Absent (undefined/null) means "no stat block yet".
 */
export interface StatBlock {
  size: string
  /** Creature type + any tags, e.g. "Humanoid (Wizard)". */
  creatureType: string
  alignment: string
  ac: string
  /** Hit points, incl. hit dice text, e.g. "170 (31d8 + 31)". */
  hp: string
  speed: string
  /** Initiative bonus text, e.g. "+7 (17)". Empty = derive from DEX. */
  initiative: string
  abilities: Record<AbilityKey, number>
  /** Ability keys the creature is proficient in for saving throws. */
  saveProficiencies: AbilityKey[]
  /** Proficiency bonus override; empty = derive from CR. */
  pb: string
  skills: string
  resistances: string
  immunities: string
  vulnerabilities: string
  senses: string
  languages: string
  /** Challenge rating as text, e.g. "12", "1/2", "1/8". */
  cr: string
  habitat: string
  gear: string
  treasure: string
  traits: StatBlockEntry[]
  actions: StatBlockEntry[]
  bonusActions: StatBlockEntry[]
  reactions: StatBlockEntry[]
  legendaryActions: StatBlockEntry[]
}

/** A non-player character. */
export interface NPC extends BaseRecord {
  campaignId: Id
  name: string
  /** Role / occupation (e.g. "Innkeeper", "Big Bad"). */
  role: string
  /** Ancestry / species (e.g. "Human", "Mind Flayer"). */
  race: string
  description: string
  /** Where this NPC is usually found. */
  locationId: Id | null
  /** Structured stat block. Null/undefined until the DM builds one. */
  statBlockData?: StatBlock | null
  /** Freeform additional mechanical notes (markdown), below the stat block. */
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

/** Sections of a player campaign's home. */
export type PlayerNoteSection = 'journal' | 'character' | 'quests' | 'people' | 'notes'

/**
 * A player's personal entry for a campaign — kept separate from the DM's World
 * Notes. Each entry lives in a section of the player's campaign home.
 */
export interface PlayerNote extends BaseRecord {
  campaignId: Id
  /** Which section of the player home this entry belongs to. */
  section: PlayerNoteSection
  title: string
  /** Body (rich-text HTML, supports images and [[wiki links]]). */
  body: string
  tags: string[]
  /** Journal entries: the session date (YYYY-MM-DD). Empty otherwise. */
  date: string
  /** Quests: 'active' | 'completed' | 'failed'. Empty otherwise. */
  status: string
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

// ---------------------------------------------------------------------------
// Sync bookkeeping (Phase 3). These tables are LOCAL-ONLY — they never appear in
// the JSON backup and are not mirrored to the cloud. They track what still needs
// to be pushed (the outbox) and how far each campaign has been pulled.
// ---------------------------------------------------------------------------

/** The Dexie tables that participate in cloud sync (campaign + its children). */
export type SyncTable =
  | 'campaigns'
  | 'sessions'
  | 'locations'
  | 'npcs'
  | 'items'
  | 'notes'
  | 'playerNotes'
  | 'rollTables'
  | 'images'
  | 'links'
  | 'encounters'

/**
 * One queued local mutation waiting to be pushed to the cloud. `put` mirrors the
 * current record; `del` sends a tombstone. Coalesced by (table+recordId) at push.
 */
export interface PendingChange {
  id?: number
  table: SyncTable
  recordId: Id
  campaignId: Id
  op: 'put' | 'del'
  at: ISODate
}

/**
 * A LOCAL-ONLY, per-device opt-out. Presence of a row means "keep this campaign
 * off cloud sync in this browser." Kept out of the synced `Campaign` record on
 * purpose, so the preference never propagates to the user's other devices.
 */
export interface SyncOptOutRow {
  campaignId: Id
}

/** Per-campaign sync progress. Presence of a row = this campaign is synced. */
export interface SyncStateRow {
  campaignId: Id
  /** The cloud campaign owner (always the current user for their own campaigns). */
  ownerId: Id
  /** Server `updated_at` high-water mark; the next pull fetches rows after it. */
  pullCursor: string
  /** When the last successful sync completed (ISO), or null if never. */
  lastSyncedAt: ISODate | null
  /** Last sync error message, if the most recent attempt failed. */
  lastError?: string | null
}

/** One line in a saved encounter: a monster (from a data source or custom) and
 *  how many of them. HP/AC/DEX are snapshotted so running it later needs no
 *  re-fetch, even for non-bundled (Open5e / custom) monsters. */
export interface EncounterCombatant {
  id: Id
  /** Monster slug if it came from a data source; null for a custom entry. */
  slug: string | null
  name: string
  /** Challenge rating as a number (0.125 = 1/8). */
  cr: number
  hp: number | null
  ac: number | null
  dex: number | null
  count: number
}

/** A prepared combat encounter, built against a party's level for difficulty. */
export interface Encounter extends BaseRecord {
  campaignId: Id
  name: string
  /** Party size assumed for the difficulty rating. */
  players: number
  /** Party level assumed for the difficulty rating (1–20). */
  level: number
  combatants: EncounterCombatant[]
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
  encounters?: Encounter[]
}
