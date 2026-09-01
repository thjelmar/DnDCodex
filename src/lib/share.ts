import { db } from '../db/db'
import { createPlayerNote, createLink } from '../db/repo'
import type { CampaignGraph, GraphNode } from './graph'
import type { Id, PlayerNoteSection } from '../db/types'

// DM → player quest/note sharing. The app is local-first with no backend, so a
// "share" is a self-contained packet the DM hands to a player (as a copyable
// code) and the player imports into their own campaign. The DM chooses exactly
// what to reveal; nothing syncs automatically.

const SHARE_KIND = 'dndcodex-share'

export interface SharedEntry {
  /** Stable id within the packet (the source node key), used to rewire edges. */
  tempId: string
  section: PlayerNoteSection
  title: string
  /** Rich-text HTML the DM chose to reveal. */
  body: string
  status?: string
  /** What it was on the DM side, for the import preview. */
  sourceKind: string
}

export interface SharedConnection {
  from: string
  to: string
  label: string
}

export interface SharePacket {
  kind: typeof SHARE_KIND
  version: 1
  /** Human label for the whole share, for the preview. */
  title: string
  entries: SharedEntry[]
  connections: SharedConnection[]
}

/** Which player section a DM entity maps to when it isn't the chosen main entry. */
export function defaultSectionForKind(kind: string): PlayerNoteSection {
  switch (kind) {
    case 'npc':
    case 'location':
      return 'people'
    case 'session':
      return 'journal'
    default:
      return 'notes'
  }
}

/** Fetches the revealable title/body for one DM entity. DM-only fields (private
 *  notes, stat blocks) are deliberately left out. */
async function entryDetail(node: GraphNode): Promise<{ title: string; body: string; status?: string }> {
  switch (node.kind) {
    case 'note': {
      const n = await db.notes.get(node.id)
      return { title: n?.title || node.name, body: n?.body ?? '' }
    }
    case 'npc': {
      const n = await db.npcs.get(node.id)
      const role = n?.role ? `<p><em>${n.role}</em></p>` : ''
      return { title: n?.name || node.name, body: role + (n?.description ?? '') }
    }
    case 'location': {
      const l = await db.locations.get(node.id)
      return { title: l?.name || node.name, body: l?.description ?? '' }
    }
    case 'item': {
      const i = await db.items.get(node.id)
      return { title: i?.name || node.name, body: i?.description ?? '' }
    }
    case 'session': {
      const s = await db.sessions.get(node.id)
      // Player-facing recap only — never the DM notes.
      return { title: s?.title || node.name, body: s?.notes ?? '' }
    }
    default:
      return { title: node.name, body: '' }
  }
}

/** Assembles a share packet from a chosen node, its included neighbors, and the
 *  connections among that set. */
export async function buildSharePacket(opts: {
  mainNode: GraphNode
  mainSection: PlayerNoteSection
  includeKeys: string[]
  graph: CampaignGraph
}): Promise<SharePacket> {
  const { mainNode, mainSection, includeKeys, graph } = opts
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]))

  const chosen: { node: GraphNode; section: PlayerNoteSection }[] = [{ node: mainNode, section: mainSection }]
  for (const key of includeKeys) {
    const node = byKey.get(key)
    if (node && node.key !== mainNode.key) chosen.push({ node, section: defaultSectionForKind(node.kind) })
  }

  const entries: SharedEntry[] = []
  for (const { node, section } of chosen) {
    const detail = await entryDetail(node)
    entries.push({
      tempId: node.key,
      section,
      title: detail.title,
      body: detail.body,
      status: section === 'quests' ? 'active' : undefined,
      sourceKind: node.kind,
    })
  }

  const included = new Set(chosen.map((c) => c.node.key))
  const connections: SharedConnection[] = graph.edges
    .filter((e) => included.has(e.fromKey) && included.has(e.toKey))
    .map((e) => ({ from: e.fromKey, to: e.toKey, label: e.label }))

  return { kind: SHARE_KIND, version: 1, title: entries[0]?.title ?? 'Shared', entries, connections }
}

/** Encodes a packet as a compact, copy-pasteable (UTF-8 safe) code. */
export function encodeShare(packet: SharePacket): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(packet))))
}

/** Decodes a share code, returning null if it isn't a valid packet. */
export function decodeShare(code: string): SharePacket | null {
  try {
    const json = decodeURIComponent(escape(atob(code.trim())))
    const p = JSON.parse(json)
    if (p && p.kind === SHARE_KIND && Array.isArray(p.entries)) return p as SharePacket
  } catch {
    /* not a valid code */
  }
  return null
}

/** Imports a packet into a player campaign: creates the entries and rewires the
 *  connections between them on the player's map. */
export async function importSharePacket(
  campaignId: Id,
  packet: SharePacket,
): Promise<{ entries: number; connections: number }> {
  const idMap = new Map<string, Id>()
  for (const e of packet.entries) {
    const note = await createPlayerNote(campaignId, {
      section: e.section,
      title: e.title,
      body: e.body,
      status: e.status,
    })
    idMap.set(e.tempId, note.id)
  }
  let connections = 0
  for (const c of packet.connections) {
    const from = idMap.get(c.from)
    const to = idMap.get(c.to)
    if (from && to) {
      await createLink(campaignId, 'playernote', from, 'playernote', to, c.label)
      connections++
    }
  }
  return { entries: packet.entries.length, connections }
}
