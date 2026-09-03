import { db, newId, now } from './db'
import { enqueuePut, enqueuePutById, enqueueDel } from '../lib/syncQueue'
import { tableForKind } from '../lib/syncKinds'
import type {
  Campaign,
  Session,
  Location,
  NPC,
  Item,
  Note,
  RollTable,
  RollTableEntry,
  PlayerNote,
  StoredImage,
  Link,
  Encounter,
  EntityKind,
  Id,
  DatabaseSnapshot,
} from './types'

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

const DEFAULT_COLORS = [
  '#7c3aed', '#db2777', '#0891b2', '#ca8a04', '#16a34a', '#dc2626', '#2563eb',
]

export async function createCampaign(
  input: Partial<Pick<Campaign, 'name' | 'summary' | 'description' | 'color' | 'role' | 'linkedCampaignId'>> = {},
): Promise<Campaign> {
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
  await db.campaigns.update(id, { ...patch, updatedAt: now() })
  await enqueuePutById('campaigns', id)
}

/** Deletes a campaign and every record that belongs to it. */
export async function deleteCampaign(id: Id): Promise<void> {
  await db.transaction(
    'rw',
    [db.campaigns, db.sessions, db.locations, db.npcs, db.items, db.notes, db.rollTables, db.playerNotes, db.images, db.links, db.encounters],
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
  input: Partial<Pick<Location, 'name' | 'type' | 'description' | 'parentLocationId' | 'tags'>> = {},
): Promise<Location> {
  const ts = now()
  const location: Location = {
    id: newId(),
    campaignId,
    name: input.name?.trim() || 'New Location',
    type: input.type ?? 'town',
    description: input.description ?? '',
    parentLocationId: input.parentLocationId ?? null,
    tags: input.tags ?? [],
    governmentType: '',
    rulerNpcId: null,
    currency: '',
    religion: '',
    departments: '',
    population: '',
    prosperity: '',
    imports: '',
    exports: '',
    pointsOfInterest: '',
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
  input: Partial<Pick<NPC, 'name' | 'role' | 'description' | 'locationId' | 'disposition' | 'tags'>> = {},
): Promise<NPC> {
  const ts = now()
  const npc: NPC = {
    id: newId(),
    campaignId,
    name: input.name?.trim() || 'New NPC',
    role: input.role ?? '',
    race: '',
    description: input.description ?? '',
    locationId: input.locationId ?? null,
    statBlockData: null,
    statBlock: '',
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
  const ts = now()
  const item: Item = {
    id: newId(),
    campaignId,
    name: input.name?.trim() || 'New Item',
    rarity: input.rarity ?? 'common',
    category: input.category ?? '',
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

export async function updateRollTable(id: Id, patch: Partial<RollTable>): Promise<void> {
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
// Images
// ---------------------------------------------------------------------------

export async function createImage(
  campaignId: Id,
  input: Pick<StoredImage, 'name' | 'mime' | 'dataUrl' | 'width' | 'height' | 'bytes'>,
): Promise<StoredImage> {
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

export async function deleteImage(id: Id): Promise<void> {
  const existing = await db.images.get(id)
  await db.images.delete(id)
  if (existing) await enqueueDel('images', id, existing.campaignId)
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

export const SNAPSHOT_VERSION = 6

export async function exportSnapshot(): Promise<DatabaseSnapshot> {
  const [campaigns, sessions, locations, npcs, items, notes, playerNotes, rollTables, images, links, encounters] =
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
    [db.campaigns, db.sessions, db.locations, db.npcs, db.items, db.notes, db.rollTables, db.playerNotes, db.images, db.links, db.encounters],
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
      ])
    },
  )
  // A bulk restore bypasses the per-record outbox; if any campaign is synced,
  // re-queue everything so the restored state pushes to the cloud.
  try {
    const { resyncSyncedCampaigns } = await import('../lib/sync')
    await resyncSyncedCampaigns()
  } catch {
    // Sync not active / not configured — local-only import, nothing to push.
  }
}
