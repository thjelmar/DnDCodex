import { db } from '../db/db'
import type { EntityKind, Id } from '../db/types'

// The thought map is a visual lens over the connections that already exist in a
// campaign — the explicit `links` table (the "Connections" a DM adds by hand)
// PLUS the structural relationships implied by other fields (an NPC's home
// location, a location's parent/allies/enemies/ruler). Surfacing both means the
// map is useful the moment a campaign has any content, and helps a DM spot lore
// gaps (entities that aren't tied to anything yet).

/** Entity kinds that appear as nodes on the map. */
export type NodeKind = Extract<EntityKind, 'npc' | 'location' | 'item' | 'note' | 'session'>

export interface GraphNode {
  /** Stable composite key, `${kind}:${id}`. */
  key: string
  kind: NodeKind
  id: Id
  name: string
  /** Secondary line (role, location type, rarity…). */
  sub?: string
  /** Campaign sub-route this node lives on, for the "open" deep link. */
  section: string
}

export interface GraphEdge {
  key: string
  fromKey: string
  toKey: string
  label: string
  /** Derived edges come from structural fields (dashed); explicit ones from the
   *  links table (solid, and removable on the canvas). */
  derived: boolean
  /** Present only for explicit links — the links-table row id, for removal. */
  linkId?: Id
}

export interface CampaignGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const NODE_KINDS: NodeKind[] = ['npc', 'location', 'item', 'note', 'session']

export const KIND_META: Record<NodeKind, { label: string; icon: string; color: string; section: string }> = {
  npc: { label: 'NPCs', icon: '🧑', color: '#a78bfa', section: 'npcs' },
  location: { label: 'Locations', icon: '📍', color: '#4ade80', section: 'locations' },
  item: { label: 'Items', icon: '⚔️', color: '#fbbf24', section: 'items' },
  note: { label: 'Notes', icon: '📄', color: '#60a5fa', section: 'notes' },
  session: { label: 'Sessions', icon: '📝', color: '#f472b6', section: 'sessions' },
}

const key = (kind: NodeKind, id: Id) => `${kind}:${id}`
/** Unordered pair key so we can dedupe derived edges against explicit ones. */
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * Loads the whole campaign and assembles the node/edge graph. Explicit links win
 * over derived ones: if the DM has already drawn a connection between two nodes,
 * we don't also draw the structural (dashed) edge for that same pair.
 */
export async function buildCampaignGraph(campaignId: Id): Promise<CampaignGraph> {
  const [npcs, locations, items, notes, sessions, links] = await Promise.all([
    db.npcs.where('campaignId').equals(campaignId).toArray(),
    db.locations.where('campaignId').equals(campaignId).toArray(),
    db.items.where('campaignId').equals(campaignId).toArray(),
    db.notes.where('campaignId').equals(campaignId).toArray(),
    db.sessions.where('campaignId').equals(campaignId).toArray(),
    db.links.where('campaignId').equals(campaignId).toArray(),
  ])

  const nodes: GraphNode[] = []
  const present = new Set<string>()
  const add = (kind: NodeKind, id: Id, name: string, sub?: string) => {
    const k = key(kind, id)
    present.add(k)
    nodes.push({ key: k, kind, id, name: name || '(untitled)', sub, section: KIND_META[kind].section })
  }

  npcs.forEach((n) => add('npc', n.id, n.name, n.role))
  locations.forEach((l) => add('location', l.id, l.name, l.type))
  items.forEach((i) => add('item', i.id, i.name, i.rarity))
  notes.forEach((n) => add('note', n.id, n.title))
  sessions.forEach((s) => add('session', s.id, s.title))

  const edges: GraphEdge[] = []
  const usedPairs = new Set<string>()

  // Explicit links first, so they claim their node pair.
  for (const l of links) {
    if (l.fromKind === 'campaign' || l.toKind === 'campaign') continue
    const from = key(l.fromKind as NodeKind, l.fromId)
    const to = key(l.toKind as NodeKind, l.toId)
    if (!present.has(from) || !present.has(to)) continue
    edges.push({ key: `link:${l.id}`, fromKey: from, toKey: to, label: l.label, derived: false, linkId: l.id })
    usedPairs.add(pairKey(from, to))
  }

  // Derived structural edges — added only when no explicit link covers the pair.
  const derive = (from: string, to: string, label: string) => {
    if (!present.has(from) || !present.has(to) || from === to) return
    const p = pairKey(from, to)
    if (usedPairs.has(p)) return
    usedPairs.add(p)
    edges.push({ key: `d:${p}:${label}`, fromKey: from, toKey: to, label, derived: true })
  }

  npcs.forEach((n) => {
    if (n.locationId) derive(key('npc', n.id), key('location', n.locationId), 'found in')
  })
  locations.forEach((l) => {
    if (l.parentLocationId) derive(key('location', l.id), key('location', l.parentLocationId), 'within')
    if (l.rulerNpcId) derive(key('location', l.id), key('npc', l.rulerNpcId), 'ruled by')
    ;(l.allyIds ?? []).forEach((aid) => derive(key('location', l.id), key('location', aid), 'allied with'))
    ;(l.enemyIds ?? []).forEach((eid) => derive(key('location', l.id), key('location', eid), 'at odds with'))
  })

  return { nodes, edges }
}

/** Node keys that have at least one edge — used to flag "lore gaps" (orphans). */
export function connectedKeys(graph: CampaignGraph): Set<string> {
  const s = new Set<string>()
  for (const e of graph.edges) {
    s.add(e.fromKey)
    s.add(e.toKey)
  }
  return s
}
