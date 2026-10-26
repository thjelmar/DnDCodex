import { db, newId, now } from './db'
import { enqueuePut, enqueuePutById, enqueueDel } from '../lib/syncQueue'
import { enqueueGlobalPut, enqueueGlobalDel } from '../lib/globalSyncQueue'
import { isDemo, notifyDemoBlocked, DemoBlockedError } from '../lib/demo'
import { tableForKind } from '../lib/syncKinds'
import { LOCATION_TYPES } from './types'
import type { ShareableKind } from '../lib/reveal'
import type {
  Campaign,
  Session,
  Location,
  NPC,
  Item,
  Note,
  RollTable,
  RollTableEntry,
  GenTable,
  Template,
  TemplateKind,
  PlayerNote,
  StoredImage,
  Link,
  Encounter,
  Scene,
  WorldMap,
  PlotThread,
  Family,
  RaceGroup,
  TimelineEvent,
  EntityKind,
  Id,
  DatabaseSnapshot,
} from './types'

// ---------------------------------------------------------------------------
// Demo-mode write guards (T-32). The demo runs on a throwaway database, but all
// persistent changes are disabled so visitors see "try it on the real site".
//   - blockDemoWrite(): explicit actions (create / delete / upload). Raises the
//     "non-functional in demo" prompt and aborts. The primary UX is a proactive
//     guard on the buttons; this is the backstop so nothing slips through.
//   - skipDemoWrite(): passive autosave (updateX). Silently no-ops — editors
//     stay interactive but nothing persists, with no prompt spam on every key.
// ---------------------------------------------------------------------------

function blockDemoWrite(): void {
  if (isDemo()) {
    notifyDemoBlocked()
    throw new DemoBlockedError()
  }
}

function skipDemoWrite(): boolean {
  return isDemo()
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

const DEFAULT_COLORS = [
  '#7c3aed', '#db2777', '#0891b2', '#ca8a04', '#16a34a', '#dc2626', '#2563eb',
]

export async function createCampaign(
  input: Partial<Pick<Campaign, 'name' | 'summary' | 'description' | 'color' | 'role' | 'linkedCampaignId'>> = {},
): Promise<Campaign> {
  blockDemoWrite()
  const ts = now()
  const count = await db.campaigns.count()
  const campaign: Campaign = {
    id: newId(),
    name: input.name?.trim() || 'Untitled Campaign',
    summary: input.summary ?? '',
    description: input.description ?? '',
    color: input.color ?? DEFAULT_COLORS[count % DEFAULT_COLORS.length],
    relatedCampaignIds: [],
    archived: false,
    coverImageId: null,
    role: input.role ?? 'dm',
    externalLinks: [],
    linkedCampaignId: input.linkedCampaignId ?? null,
    createdAt: ts,
    updatedAt: ts,
  }
  await db.campaigns.add(campaign)
  await enqueuePut('campaigns', campaign.id, campaign.id)
  return campaign
}

/**
 * Finds the local player campaign linked to a cloud campaign, creating it if
 * absent. Used when joining a campaign / receiving an account share, so shares
 * have a local home.
 */
export async function findOrCreateLinkedPlayerCampaign(cloudId: Id, name: string): Promise<Campaign> {
  const existing = await db.campaigns.filter((c) => c.linkedCampaignId === cloudId).first()
  if (existing) return existing
  return createCampaign({ name, role: 'player', linkedCampaignId: cloudId })
}

export async function updateCampaign(id: Id, patch: Partial<Campaign>): Promise<void> {
  if (skipDemoWrite()) return
  await db.campaigns.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('campaigns', id)
}

/** Deletes a campaign and every record that belongs to it. */
export async function deleteCampaign(id: Id): Promise<void> {
  blockDemoWrite()
  await db.transaction(
    'rw',
    [db.campaigns, db.sessions, db.locations, db.npcs, db.items, db.notes, db.rollTables, db.playerNotes, db.images, db.links, db.encounters, db.scenes, db.worldMaps, db.plotThreads, db.timelineEvents, db.families, db.raceGroups],
    async () => {
      await Promise.all([
        db.sessions.where('campaignId').equals(id).delete(),
        db.locations.where('campaignId').equals(id).delete(),
        db.npcs.where('campaignId').equals(id).delete(),
        db.items.where('campaignId').equals(id).delete(),
        db.notes.where('campaignId').equals(id).delete(),
        db.rollTables.where('campaignId').equals(id).delete(),
        db.playerNotes.where('campaignId').equals(id).delete(),
        db.images.where('campaignId').equals(id).delete(),
        db.links.where('campaignId').equals(id).delete(),
        db.encounters.where('campaignId').equals(id).delete(),
        db.scenes.where('campaignId').equals(id).delete(),
        db.worldMaps.where('campaignId').equals(id).delete(),
        db.plotThreads.where('campaignId').equals(id).delete(),
        db.timelineEvents.where('campaignId').equals(id).delete(),
        db.families.where('campaignId').equals(id).delete(),
        db.raceGroups.where('campaignId').equals(id).delete(),
      ])
      await db.campaigns.delete(id)
    },
  )
  // A single campaign-level tombstone; the cloud cascade-deletes its records.
  await enqueueDel('campaigns', id, id)
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(
  campaignId: Id,
  input: Partial<Pick<Session, 'title' | 'date' | 'notes' | 'dmNotes' | 'tags'>> = {},
): Promise<Session> {
  blockDemoWrite()
  const ts = now()
  const session: Session = {
    id: newId(),
    campaignId,
    title: input.title?.trim() || 'New Session',
    date: input.date || ts.slice(0, 10),
    notes: input.notes ?? '',
    dmNotes: input.dmNotes ?? '',
    tags: input.tags ?? [],
    createdAt: ts,
    updatedAt: ts,
  }
  await db.sessions.add(session)
  await enqueuePut('sessions', session.id, campaignId)
  return session
}

export async function updateSession(id: Id, patch: Partial<Session>): Promise<void> {
  if (skipDemoWrite()) return
  await db.sessions.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('sessions', id)
}

export async function deleteSession(id: Id): Promise<void> {
  await deleteEntity('session', id)
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export async function createLocation(
  campaignId: Id,
  input: Partial<
    Pick<
      Location,
      | 'name' | 'type' | 'description' | 'parentLocationId' | 'tags'
      // Structured fields, seedable from a template (T-30).
      | 'governmentType' | 'currency' | 'religion' | 'departments'
      | 'population' | 'prosperity' | 'imports' | 'exports' | 'pointsOfInterest'
    >
  > = {},
): Promise<Location> {
  blockDemoWrite()
  const ts = now()
  const location: Location = {
    id: newId(),
    campaignId,
    name: input.name?.trim() || 'New Location',
    type: input.type ?? 'town',
    imageId: null,
    description: input.description ?? '',
    parentLocationId: input.parentLocationId ?? null,
    tags: input.tags ?? [],
    governmentType: input.governmentType ?? '',
    rulerNpcId: null,
    currency: input.currency ?? '',
    religion: input.religion ?? '',
    departments: input.departments ?? '',
    population: input.population ?? '',
    prosperity: input.prosperity ?? '',
    imports: input.imports ?? '',
    exports: input.exports ?? '',
    pointsOfInterest: input.pointsOfInterest ?? '',
    allyIds: [],
    enemyIds: [],
    createdAt: ts,
    updatedAt: ts,
  }
  await db.locations.add(location)
  await enqueuePut('locations', location.id, campaignId)
  return location
}

export async function updateLocation(id: Id, patch: Partial<Location>): Promise<void> {
  if (skipDemoWrite()) return
  await db.locations.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('locations', id)
}

export async function deleteLocation(id: Id): Promise<void> {
  await deleteEntity('location', id)
}

// ---------------------------------------------------------------------------
// NPCs
// ---------------------------------------------------------------------------

export async function createNPC(
  campaignId: Id,
  input: Partial<
    Pick<
      NPC,
      | 'name' | 'role' | 'description' | 'locationId' | 'disposition' | 'tags'
      // Seedable from a template (T-30).
      | 'race' | 'statBlock' | 'statBlockData'
    >
  > = {},
): Promise<NPC> {
  blockDemoWrite()
  const ts = now()
  const npc: NPC = {
    id: newId(),
    campaignId,
    name: input.name?.trim() || 'New NPC',
    role: input.role ?? '',
    race: input.race ?? '',
    imageId: null,
    description: input.description ?? '',
    locationId: input.locationId ?? null,
    statBlockData: input.statBlockData ?? null,
    statBlock: input.statBlock ?? '',
    disposition: input.disposition ?? 'unknown',
    tags: input.tags ?? [],
    createdAt: ts,
    updatedAt: ts,
  }
  await db.npcs.add(npc)
  await enqueuePut('npcs', npc.id, campaignId)
  return npc
}

export async function updateNPC(id: Id, patch: Partial<NPC>): Promise<void> {
  if (skipDemoWrite()) return
  await db.npcs.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('npcs', id)
}

export async function deleteNPC(id: Id): Promise<void> {
  await deleteEntity('npc', id)
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export async function createItem(
  campaignId: Id,
  input: Partial<Pick<Item, 'name' | 'rarity' | 'category' | 'description' | 'attunement' | 'value' | 'tags'>> = {},
): Promise<Item> {
  blockDemoWrite()
  const ts = now()
  const item: Item = {
    id: newId(),
    campaignId,
    name: input.name?.trim() || 'New Item',
    rarity: input.rarity ?? 'common',
    category: input.category ?? '',
    imageId: null,
    description: input.description ?? '',
    attunement: input.attunement ?? false,
    value: input.value ?? '',
    tags: input.tags ?? [],
    createdAt: ts,
    updatedAt: ts,
  }
  await db.items.add(item)
  await enqueuePut('items', item.id, campaignId)
  return item
}

export async function updateItem(id: Id, patch: Partial<Item>): Promise<void> {
  if (skipDemoWrite()) return
  await db.items.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('items', id)
}

export async function deleteItem(id: Id): Promise<void> {
  await deleteEntity('item', id)
}

// ---------------------------------------------------------------------------
// Notes (world-building wiki pages)
// ---------------------------------------------------------------------------

export async function createNote(
  campaignId: Id,
  input: Partial<Pick<Note, 'title' | 'body' | 'tags'>> = {},
): Promise<Note> {
  blockDemoWrite()
  const ts = now()
  const note: Note = {
    id: newId(),
    campaignId,
    title: input.title?.trim() || 'New Note',
    body: input.body ?? '',
    tags: input.tags ?? [],
    createdAt: ts,
    updatedAt: ts,
  }
  await db.notes.add(note)
  await enqueuePut('notes', note.id, campaignId)
  return note
}

export async function updateNote(id: Id, patch: Partial<Note>): Promise<void> {
  if (skipDemoWrite()) return
  await db.notes.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('notes', id)
}

export async function deleteNote(id: Id): Promise<void> {
  await deleteEntity('note', id)
}

// ---------------------------------------------------------------------------
// Roll tables
// ---------------------------------------------------------------------------

/** Builds a fresh entry with a generated id and default weight. */
export function newRollTableEntry(text = '', weight = 1): RollTableEntry {
  return { id: newId(), text, weight: Math.max(1, Math.floor(weight)) }
}

export async function createRollTable(
  campaignId: Id,
  input: Partial<Pick<RollTable, 'name' | 'category' | 'description' | 'entries' | 'tags'>> = {},
): Promise<RollTable> {
  blockDemoWrite()
  const ts = now()
  const table: RollTable = {
    id: newId(),
    campaignId,
    name: input.name?.trim() || 'New Table',
    category: input.category ?? '',
    description: input.description ?? '',
    // Seed with a couple of blank rows so the table is usable immediately.
    entries: input.entries ?? [newRollTableEntry(), newRollTableEntry()],
    tags: input.tags ?? [],
    createdAt: ts,
    updatedAt: ts,
  }
  await db.rollTables.add(table)
  await enqueuePut('rollTables', table.id, campaignId)
  return table
}

// --- Global generator tables (universal, local-only) -----------------------

/** All global generator tables. */
export function getGenTables(): Promise<GenTable[]> {
  return db.genTables.toArray()
}

/** Create or update a slot's global generator table. */
export async function saveGenTable(
  slot: string,
  patch: Partial<Pick<GenTable, 'entries' | 'dismissedSuggestions'>>,
): Promise<void> {
  if (skipDemoWrite()) return
  const existing = await db.genTables.get(slot)
  const row: GenTable = {
    slot,
    entries: patch.entries ?? existing?.entries ?? [],
    dismissedSuggestions: patch.dismissedSuggestions ?? existing?.dismissedSuggestions,
    updatedAt: now(),
  }
  await db.genTables.put(row)
  // Generator word-lists ride the global (account-level) channel (T-31), keyed
  // by slot, so they follow the account across devices like templates do.
  await enqueueGlobalPut('genTables', slot)
}

// --- Entity templates (T-8; global, synced via user_records) ---------------

/** Save a reusable template from a set of pre-fill fields. */
export async function createTemplate(
  kind: TemplateKind,
  label: string,
  data: Record<string, unknown>,
): Promise<Template> {
  blockDemoWrite()
  const ts = now()
  const template: Template = {
    id: newId(),
    kind,
    label: label.trim() || 'Untitled template',
    data,
    createdAt: ts,
    updatedAt: ts,
  }
  await db.templates.add(template)
  await enqueueGlobalPut('templates', template.id)
  return template
}

/** Snapshot an existing session into a reusable template (option B). */
export async function saveSessionAsTemplate(session: Session, label: string): Promise<Template> {
  return createTemplate('session', label, {
    title: session.title,
    notes: session.notes,
    dmNotes: session.dmNotes,
    tags: session.tags,
  })
}

export async function renameTemplate(id: Id, label: string): Promise<void> {
  if (skipDemoWrite()) return
  await db.templates.update(id, { label: label.trim() || 'Untitled template', updatedAt: now() })
  await enqueueGlobalPut('templates', id)
}

export async function deleteTemplate(id: Id): Promise<void> {
  blockDemoWrite()
  await db.templates.delete(id)
  await enqueueGlobalDel('templates', id)
}

/** Create a new session pre-filled from a template's data. */
export async function createSessionFromTemplate(
  campaignId: Id,
  data: Record<string, unknown>,
): Promise<Session> {
  return createSession(campaignId, {
    title: tplStr(data, 'title'),
    notes: tplStr(data, 'notes'),
    dmNotes: tplStr(data, 'dmNotes'),
    tags: tplTags(data),
  })
}

// Template data is an untyped JSON blob (it may come from sync written by another
// version), so pull values out defensively. An undefined return lets the create*
// helpers fall back to their own defaults.
function tplStr(data: Record<string, unknown>, key: string): string | undefined {
  const v = data[key]
  return typeof v === 'string' ? v : undefined
}
function tplTags(data: Record<string, unknown>): string[] | undefined {
  return Array.isArray(data.tags) ? (data.tags as string[]).filter((t) => typeof t === 'string') : undefined
}

// --- NPC templates (T-30) ---

/** Snapshot an existing NPC into a reusable template (excludes per-instance refs
 *  like portrait, home location, and campaign). */
export async function saveNpcAsTemplate(npc: NPC, label: string): Promise<Template> {
  // Name is intentionally not snapshotted — a template is an archetype, so each
  // new NPC from it starts as "New NPC" for the DM to name.
  return createTemplate('npc', label, {
    role: npc.role,
    race: npc.race,
    description: npc.description,
    disposition: npc.disposition,
    statBlock: npc.statBlock,
    statBlockData: npc.statBlockData ?? null,
    tags: npc.tags,
  })
}

/** Create a new NPC pre-filled from a template's data. */
export async function createNpcFromTemplate(
  campaignId: Id,
  data: Record<string, unknown>,
): Promise<NPC> {
  const disposition = tplStr(data, 'disposition')
  return createNPC(campaignId, {
    name: tplStr(data, 'name'),
    role: tplStr(data, 'role'),
    race: tplStr(data, 'race'),
    description: tplStr(data, 'description'),
    disposition:
      disposition === 'friendly' || disposition === 'neutral' || disposition === 'hostile'
        ? disposition
        : undefined,
    statBlock: tplStr(data, 'statBlock'),
    statBlockData: (data.statBlockData as NPC['statBlockData']) ?? undefined,
    tags: tplTags(data),
  })
}

// --- Location templates (T-30) ---

/** Snapshot an existing Location into a reusable template (excludes per-instance
 *  refs like image, parent, ruler, and ally/enemy links). */
export async function saveLocationAsTemplate(location: Location, label: string): Promise<Template> {
  // Name is intentionally not snapshotted (see saveNpcAsTemplate).
  return createTemplate('location', label, {
    type: location.type,
    description: location.description,
    tags: location.tags,
    governmentType: location.governmentType,
    currency: location.currency,
    religion: location.religion,
    departments: location.departments,
    population: location.population,
    prosperity: location.prosperity,
    imports: location.imports,
    exports: location.exports,
    pointsOfInterest: location.pointsOfInterest,
  })
}

/** Create a new Location pre-filled from a template's data. `parentLocationId`
 *  is passed through from the caller (the "child of" case), not the template. */
export async function createLocationFromTemplate(
  campaignId: Id,
  data: Record<string, unknown>,
  parentLocationId?: Id | null,
): Promise<Location> {
  const type = tplStr(data, 'type')
  return createLocation(campaignId, {
    name: tplStr(data, 'name'),
    type: (LOCATION_TYPES as readonly string[]).includes(type ?? '')
      ? (type as Location['type'])
      : undefined,
    description: tplStr(data, 'description'),
    tags: tplTags(data),
    parentLocationId: parentLocationId ?? undefined,
    governmentType: tplStr(data, 'governmentType'),
    currency: tplStr(data, 'currency'),
    religion: tplStr(data, 'religion'),
    departments: tplStr(data, 'departments'),
    population: tplStr(data, 'population'),
    prosperity: tplStr(data, 'prosperity'),
    imports: tplStr(data, 'imports'),
    exports: tplStr(data, 'exports'),
    pointsOfInterest: tplStr(data, 'pointsOfInterest'),
  })
}

export async function updateRollTable(id: Id, patch: Partial<RollTable>): Promise<void> {
  if (skipDemoWrite()) return
  await db.rollTables.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('rollTables', id)
}

export async function deleteRollTable(id: Id): Promise<void> {
  const existing = await db.rollTables.get(id)
  await db.rollTables.delete(id)
  if (existing) await enqueueDel('rollTables', id, existing.campaignId)
}

// ---------------------------------------------------------------------------
// Player notes
// ---------------------------------------------------------------------------

export async function createPlayerNote(
  campaignId: Id,
  input: Partial<Pick<PlayerNote, 'section' | 'title' | 'body' | 'tags' | 'date' | 'status'>> = {},
): Promise<PlayerNote> {
  blockDemoWrite()
  const ts = now()
  const section = input.section ?? 'notes'
  const note: PlayerNote = {
    id: newId(),
    campaignId,
    section,
    title: input.title?.trim() || 'Untitled',
    body: input.body ?? '',
    tags: input.tags ?? [],
    date: input.date ?? (section === 'journal' ? ts.slice(0, 10) : ''),
    status: input.status ?? (section === 'quests' ? 'active' : ''),
    createdAt: ts,
    updatedAt: ts,
  }
  await db.playerNotes.add(note)
  await enqueuePut('playerNotes', note.id, campaignId)
  return note
}

export async function updatePlayerNote(id: Id, patch: Partial<PlayerNote>): Promise<void> {
  if (skipDemoWrite()) return
  await db.playerNotes.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('playerNotes', id)
}

export async function deletePlayerNote(id: Id): Promise<void> {
  const existing = await db.playerNotes.get(id)
  await db.playerNotes.delete(id)
  if (existing) await enqueueDel('playerNotes', id, existing.campaignId)
}

// ---------------------------------------------------------------------------
// Encounters (prepared combats for the encounter builder)
// ---------------------------------------------------------------------------

export async function createEncounter(
  campaignId: Id,
  input: Partial<Pick<Encounter, 'name' | 'players' | 'level' | 'combatants'>> = {},
): Promise<Encounter> {
  const ts = now()
  const encounter: Encounter = {
    id: newId(),
    campaignId,
    name: input.name?.trim() || 'New Encounter',
    players: input.players ?? 4,
    level: input.level ?? 1,
    combatants: input.combatants ?? [],
    createdAt: ts,
    updatedAt: ts,
  }
  await db.encounters.add(encounter)
  await enqueuePut('encounters', encounter.id, campaignId)
  return encounter
}

export async function updateEncounter(id: Id, patch: Partial<Encounter>): Promise<void> {
  await db.encounters.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('encounters', id)
}

export async function deleteEncounter(id: Id): Promise<void> {
  const existing = await db.encounters.get(id)
  await db.encounters.delete(id)
  if (existing) await enqueueDel('encounters', id, existing.campaignId)
}

// ---------------------------------------------------------------------------
// Scenes (battle maps for the built-in VTT)
// ---------------------------------------------------------------------------

export async function createScene(
  campaignId: Id,
  input: Partial<Pick<Scene, 'name' | 'imageId' | 'width' | 'height' | 'grid' | 'tokens'>> = {},
): Promise<Scene> {
  const ts = now()
  const scene: Scene = {
    id: newId(),
    campaignId,
    name: input.name?.trim() || 'New Battle Map',
    imageId: input.imageId ?? null,
    width: input.width ?? 1500,
    height: input.height ?? 1000,
    grid: input.grid ?? { cellPx: 50, offsetX: 0, offsetY: 0, show: true, color: '#000000' },
    tokens: input.tokens ?? [],
    createdAt: ts,
    updatedAt: ts,
  }
  await db.scenes.add(scene)
  await enqueuePut('scenes', scene.id, campaignId)
  return scene
}

export async function updateScene(id: Id, patch: Partial<Scene>): Promise<void> {
  await db.scenes.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('scenes', id)
}

/** Deletes a battle map and its map image (token portraits belong to NPCs). */
export async function deleteScene(id: Id): Promise<void> {
  const existing = await db.scenes.get(id)
  await db.scenes.delete(id)
  if (!existing) return
  await enqueueDel('scenes', id, existing.campaignId)
  if (existing.imageId) await deleteImage(existing.imageId)
}

// --- World maps (prep/reference maps with pins; one per campaign) -----------

/** The campaign's world map, creating an empty one on first access. */
export async function getOrCreateWorldMap(campaignId: Id): Promise<WorldMap> {
  const existing = await db.worldMaps.where('campaignId').equals(campaignId).first()
  if (existing) return existing
  const ts = now()
  const map: WorldMap = {
    id: newId(),
    campaignId,
    name: 'World Map',
    imageId: null,
    width: 0,
    height: 0,
    pins: [],
    createdAt: ts,
    updatedAt: ts,
  }
  await db.worldMaps.add(map)
  await enqueuePut('worldMaps', map.id, campaignId)
  return map
}

export async function updateWorldMap(id: Id, patch: Partial<WorldMap>): Promise<void> {
  await db.worldMaps.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('worldMaps', id)
}

export async function deleteWorldMap(id: Id): Promise<void> {
  const existing = await db.worldMaps.get(id)
  await db.worldMaps.delete(id)
  if (!existing) return
  await enqueueDel('worldMaps', id, existing.campaignId)
  if (existing.imageId) await deleteImage(existing.imageId)
}

// --- Campaign timeline: plot threads + dated events ------------------------

const THREAD_COLORS = ['#7f77dd', '#1d9e75', '#d4537e', '#378add', '#ba7517', '#e2504a', '#888780']

export async function createPlotThread(campaignId: Id, input: Partial<Pick<PlotThread, 'name' | 'status' | 'color' | 'description'>> = {}): Promise<PlotThread> {
  const ts = now()
  const count = await db.plotThreads.where('campaignId').equals(campaignId).count()
  const thread: PlotThread = {
    id: newId(),
    campaignId,
    name: input.name?.trim() || 'New thread',
    status: input.status ?? 'open',
    color: input.color ?? THREAD_COLORS[count % THREAD_COLORS.length],
    description: input.description ?? '',
    createdAt: ts,
    updatedAt: ts,
  }
  await db.plotThreads.add(thread)
  await enqueuePut('plotThreads', thread.id, campaignId)
  return thread
}
export async function updatePlotThread(id: Id, patch: Partial<PlotThread>): Promise<void> {
  await db.plotThreads.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('plotThreads', id)
}
export async function deletePlotThread(id: Id): Promise<void> {
  const existing = await db.plotThreads.get(id)
  await db.plotThreads.delete(id)
  if (!existing) return
  await enqueueDel('plotThreads', id, existing.campaignId)
  // Unlink events that pointed at this thread (don't orphan their threadId).
  const events = await db.timelineEvents.where('campaignId').equals(existing.campaignId).filter((e) => e.threadId === id).toArray()
  for (const e of events) await updateTimelineEvent(e.id, { threadId: null })
}

// --- Families (T-38) -------------------------------------------------------

const FAMILY_COLORS = ['#d4537e', '#378add', '#1d9e75', '#ba7517', '#7f77dd', '#e2504a', '#0e9aa7']

export async function createFamily(
  campaignId: Id,
  input: Partial<Pick<Family, 'name' | 'color'>> = {},
): Promise<Family> {
  const ts = now()
  const count = await db.families.where('campaignId').equals(campaignId).count()
  const family: Family = {
    id: newId(),
    campaignId,
    name: input.name?.trim() || 'New family',
    color: input.color ?? FAMILY_COLORS[count % FAMILY_COLORS.length],
    createdAt: ts,
    updatedAt: ts,
  }
  await db.families.add(family)
  await enqueuePut('families', family.id, campaignId)
  return family
}
export async function updateFamily(id: Id, patch: Partial<Family>): Promise<void> {
  await db.families.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('families', id)
}
export async function deleteFamily(id: Id): Promise<void> {
  const existing = await db.families.get(id)
  await db.families.delete(id)
  if (!existing) return
  await enqueueDel('families', id, existing.campaignId)
  // Un-assign NPCs that belonged to this family (don't orphan their familyId).
  const members = await db.npcs.where('campaignId').equals(existing.campaignId).filter((n) => n.familyId === id).toArray()
  for (const n of members) await updateNPC(n.id, { familyId: null })
}

// --- Race groups (T-38) ----------------------------------------------------

const RACE_COLORS = ['#7f77dd', '#1d9e75', '#d4537e', '#378add', '#ba7517', '#e2504a', '#888780']

export async function createRaceGroup(
  campaignId: Id,
  input: Partial<Pick<RaceGroup, 'name' | 'color' | 'races' | 'description'>> = {},
): Promise<RaceGroup> {
  const ts = now()
  const count = await db.raceGroups.where('campaignId').equals(campaignId).count()
  const group: RaceGroup = {
    id: newId(),
    campaignId,
    name: input.name?.trim() || 'New race group',
    color: input.color ?? RACE_COLORS[count % RACE_COLORS.length],
    races: input.races ?? [],
    description: input.description ?? '',
    createdAt: ts,
    updatedAt: ts,
  }
  await db.raceGroups.add(group)
  await enqueuePut('raceGroups', group.id, campaignId)
  return group
}
export async function updateRaceGroup(id: Id, patch: Partial<RaceGroup>): Promise<void> {
  await db.raceGroups.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('raceGroups', id)
}
export async function deleteRaceGroup(id: Id): Promise<void> {
  const existing = await db.raceGroups.get(id)
  await db.raceGroups.delete(id)
  if (!existing) return
  await enqueueDel('raceGroups', id, existing.campaignId)
  // Don't leave world-map pins pointing at a group that no longer exists — drop
  // the ref but keep the pin (as a label).
  const maps = await db.worldMaps.where('campaignId').equals(existing.campaignId).toArray()
  for (const m of maps) {
    if (m.pins.some((p) => p.ref?.kind === 'raceGroup' && p.ref.id === id)) {
      await updateWorldMap(m.id, {
        pins: m.pins.map((p) => (p.ref?.kind === 'raceGroup' && p.ref.id === id ? { ...p, ref: null } : p)),
      })
    }
  }
}

export async function createTimelineEvent(campaignId: Id, input: Partial<Pick<TimelineEvent, 'title' | 'dateLabel' | 'sortKey' | 'body' | 'threadId' | 'refs' | 'year'>> = {}): Promise<TimelineEvent> {
  const ts = now()
  // Default sortKey to just after the current max, so a new event lands at the end.
  let sortKey = input.sortKey
  if (sortKey == null) {
    const all = await db.timelineEvents.where('campaignId').equals(campaignId).toArray()
    sortKey = all.reduce((m, e) => Math.max(m, e.sortKey), 0) + 10
  }
  const event: TimelineEvent = {
    id: newId(),
    campaignId,
    title: input.title?.trim() || 'New event',
    dateLabel: input.dateLabel ?? '',
    sortKey,
    body: input.body ?? '',
    threadId: input.threadId ?? null,
    refs: input.refs ?? [],
    year: input.year ?? null,
    createdAt: ts,
    updatedAt: ts,
  }
  await db.timelineEvents.add(event)
  await enqueuePut('timelineEvents', event.id, campaignId)
  return event
}
export async function updateTimelineEvent(id: Id, patch: Partial<TimelineEvent>): Promise<void> {
  await db.timelineEvents.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('timelineEvents', id)
}
export async function deleteTimelineEvent(id: Id): Promise<void> {
  const existing = await db.timelineEvents.get(id)
  await db.timelineEvents.delete(id)
  if (!existing) return
  await enqueueDel('timelineEvents', id, existing.campaignId)
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export async function createImage(
  campaignId: Id,
  input: Pick<StoredImage, 'name' | 'mime' | 'dataUrl' | 'width' | 'height' | 'bytes'>,
): Promise<StoredImage> {
  blockDemoWrite()
  const ts = now()
  const image: StoredImage = {
    id: newId(),
    campaignId,
    name: input.name,
    mime: input.mime,
    dataUrl: input.dataUrl,
    width: input.width,
    height: input.height,
    bytes: input.bytes,
    createdAt: ts,
    updatedAt: ts,
  }
  await db.images.add(image)
  await enqueuePut('images', image.id, campaignId)
  return image
}

export async function updateImage(id: Id, patch: Partial<StoredImage>): Promise<void> {
  await db.images.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('images', id)
}

export async function deleteImage(id: Id): Promise<void> {
  const existing = await db.images.get(id)
  await db.images.delete(id)
  if (existing) await enqueueDel('images', id, existing.campaignId)
}

// ---------------------------------------------------------------------------
// Entity sharing flags (Phase 3c) — generic over the shareable kinds.
// ---------------------------------------------------------------------------

const SHARE_TABLE: Record<ShareableKind, 'npcs' | 'locations' | 'notes' | 'sessions' | 'items'> = {
  npc: 'npcs',
  location: 'locations',
  note: 'notes',
  session: 'sessions',
  item: 'items',
}

/** Set the live-share flags on any shareable entity (syncs like a normal edit). */
export async function setEntityShared(
  kind: ShareableKind,
  id: Id,
  patch: {
    sharedWithPlayers?: boolean
    sharedPushedHash?: string
    sharedSections?: string[]
    sharedPortraitId?: Id | null
  },
): Promise<void> {
  const table = SHARE_TABLE[kind]
  await db.table(table).update(id, { ...patch, updatedAt: now() })
  await enqueuePutById(table, id)
}

// ---------------------------------------------------------------------------
// Links (cross-entity relationships)
// ---------------------------------------------------------------------------

export async function createLink(
  campaignId: Id,
  fromKind: EntityKind,
  fromId: Id,
  toKind: EntityKind,
  toId: Id,
  label: string,
): Promise<Link> {
  const ts = now()
  const link: Link = {
    id: newId(),
    campaignId,
    fromKind,
    fromId,
    toKind,
    toId,
    label: label.trim() || 'related to',
    createdAt: ts,
    updatedAt: ts,
  }
  await db.links.add(link)
  await enqueuePut('links', link.id, campaignId)
  return link
}

export async function deleteLink(id: Id): Promise<void> {
  const existing = await db.links.get(id)
  await db.links.delete(id)
  if (existing) await enqueueDel('links', id, existing.campaignId)
}

/** Returns every link that touches the given entity, from either side. */
export async function linksForEntity(kind: EntityKind, id: Id): Promise<Link[]> {
  const [asFrom, asTo] = await Promise.all([
    db.links.where('[fromKind+fromId]').equals([kind, id]).toArray(),
    db.links.where('[toKind+toId]').equals([kind, id]).toArray(),
  ])
  return [...asFrom, ...asTo]
}

// ---------------------------------------------------------------------------
// Generic delete: removes an entity and any links referencing it.
// ---------------------------------------------------------------------------

const TABLE_BY_KIND = {
  campaign: () => db.campaigns,
  session: () => db.sessions,
  location: () => db.locations,
  npc: () => db.npcs,
  item: () => db.items,
  note: () => db.notes,
} as const

async function deleteEntity(kind: Exclude<EntityKind, never>, id: Id): Promise<void> {
  blockDemoWrite()
  let campaignId: Id | undefined
  let touching: Link[] = []
  await db.transaction('rw', [db.links, db.campaigns, db.sessions, db.locations, db.npcs, db.items, db.notes], async () => {
    const table = TABLE_BY_KIND[kind as keyof typeof TABLE_BY_KIND]?.()
    if (table) {
      const rec = (await table.get(id)) as { campaignId?: Id } | undefined
      campaignId = rec?.campaignId
      await table.delete(id)
    }
    touching = await linksForEntity(kind, id)
    await db.links.bulkDelete(touching.map((l) => l.id))
  })
  // Tombstone the entity and every link that referenced it, so the deletion
  // propagates rather than the links reappearing on another device.
  const syncTable = tableForKind(kind)
  if (syncTable && campaignId) await enqueueDel(syncTable, id, campaignId)
  for (const l of touching) await enqueueDel('links', l.id, l.campaignId)
}

// ---------------------------------------------------------------------------
// Export / import (JSON backup)
// ---------------------------------------------------------------------------

export const SNAPSHOT_VERSION = 10

export async function exportSnapshot(): Promise<DatabaseSnapshot> {
  const [campaigns, sessions, locations, npcs, items, notes, playerNotes, rollTables, images, links, encounters, scenes, worldMaps, plotThreads, timelineEvents, families, raceGroups, genTables, templates] =
    await Promise.all([
      db.campaigns.toArray(),
      db.sessions.toArray(),
      db.locations.toArray(),
      db.npcs.toArray(),
      db.items.toArray(),
      db.notes.toArray(),
      db.playerNotes.toArray(),
      db.rollTables.toArray(),
      db.images.toArray(),
      db.links.toArray(),
      db.encounters.toArray(),
      db.scenes.toArray(),
      db.worldMaps.toArray(),
      db.plotThreads.toArray(),
      db.timelineEvents.toArray(),
      db.families.toArray(),
      db.raceGroups.toArray(),
      db.genTables.toArray(),
      db.templates.toArray(),
    ])
  return {
    version: SNAPSHOT_VERSION,
    exportedAt: now(),
    campaigns,
    sessions,
    locations,
    npcs,
    items,
    notes,
    playerNotes,
    rollTables,
    images,
    links,
    encounters,
    scenes,
    worldMaps,
    plotThreads,
    timelineEvents,
    families,
    raceGroups,
    genTables,
    templates,
  }
}

/**
 * Imports a snapshot. In "replace" mode the whole database is wiped first; in
 * "merge" mode records are upserted by id (existing ids are overwritten).
 */
export async function importSnapshot(
  snapshot: DatabaseSnapshot,
  mode: 'replace' | 'merge' = 'replace',
): Promise<void> {
  if (typeof snapshot?.version !== 'number' || !Array.isArray(snapshot.campaigns)) {
    throw new Error('This file does not look like a D&D Codex backup.')
  }
  await db.transaction(
    'rw',
    [db.campaigns, db.sessions, db.locations, db.npcs, db.items, db.notes, db.rollTables, db.playerNotes, db.images, db.links, db.encounters, db.scenes, db.worldMaps, db.plotThreads, db.timelineEvents, db.families, db.raceGroups, db.genTables, db.templates],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.campaigns.clear(),
          db.sessions.clear(),
          db.locations.clear(),
          db.npcs.clear(),
          db.items.clear(),
          db.notes.clear(),
          db.rollTables.clear(),
          db.playerNotes.clear(),
          db.images.clear(),
          db.links.clear(),
          db.encounters.clear(),
          db.scenes.clear(),
          db.worldMaps.clear(),
          db.plotThreads.clear(),
          db.timelineEvents.clear(),
          db.families.clear(),
          db.raceGroups.clear(),
          db.genTables.clear(),
          db.templates.clear(),
        ])
      }
      await Promise.all([
        db.campaigns.bulkPut(snapshot.campaigns ?? []),
        db.sessions.bulkPut(snapshot.sessions ?? []),
        db.locations.bulkPut(snapshot.locations ?? []),
        db.npcs.bulkPut(snapshot.npcs ?? []),
        db.items.bulkPut(snapshot.items ?? []),
        db.notes.bulkPut(snapshot.notes ?? []),
        db.rollTables.bulkPut(snapshot.rollTables ?? []),
        db.playerNotes.bulkPut(snapshot.playerNotes ?? []),
        db.images.bulkPut(snapshot.images ?? []),
        db.links.bulkPut(snapshot.links ?? []),
        db.encounters.bulkPut(snapshot.encounters ?? []),
        db.scenes.bulkPut(snapshot.scenes ?? []),
        db.worldMaps.bulkPut(snapshot.worldMaps ?? []),
        db.plotThreads.bulkPut(snapshot.plotThreads ?? []),
        db.timelineEvents.bulkPut(snapshot.timelineEvents ?? []),
        db.families.bulkPut(snapshot.families ?? []),
        db.raceGroups.bulkPut(snapshot.raceGroups ?? []),
        db.genTables.bulkPut(snapshot.genTables ?? []),
        db.templates.bulkPut(snapshot.templates ?? []),
      ])
    },
  )
  // A bulk restore bypasses the per-record outboxes; if sync is active, re-queue
  // everything (campaign + global) so the restored state pushes to the cloud.
  try {
    const { resyncSyncedCampaigns } = await import('../lib/sync')
    await resyncSyncedCampaigns()
  } catch {
    // Sync not active / not configured — local-only import, nothing to push.
  }
  try {
    const { resyncGlobal } = await import('../lib/globalSync')
    await resyncGlobal()
  } catch {
    // Global sync not active — nothing to push.
  }
}
