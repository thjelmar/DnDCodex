import { db } from '../db/db'
import type { CampaignGraph, GraphNode } from './graph'
import type { Id, PlayerNoteSection } from '../db/types'

// The player thought map is a web of a player's own entries — the people and
// places they've met and the quests they're chasing — connected however they
// like. Players have no structural data to derive edges from, so every edge is
// hand-drawn and stored in the shared links table as playernote↔playernote.

/** Player-note sections that appear as bubbles on their map. */
export const PLAYER_MAP_SECTIONS: PlayerNoteSection[] = ['people', 'quests']

export const PLAYER_KIND_META: Record<string, { label: string; icon: string; color: string }> = {
  people: { label: 'People & Places', icon: '🧑', color: '#60a5fa' },
  quests: { label: 'Quests', icon: '⚔️', color: '#fbbf24' },
}

const QUEST_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  completed: 'Completed',
  failed: 'Failed',
}

const nodeKey = (id: Id) => `playernote:${id}`

/** Builds the player's People + Quests graph, wired by their drawn connections. */
export async function buildPlayerGraph(campaignId: Id): Promise<CampaignGraph> {
  const [notes, links] = await Promise.all([
    db.playerNotes.where('campaignId').equals(campaignId).toArray(),
    db.links.where('campaignId').equals(campaignId).toArray(),
  ])

  const nodes: GraphNode[] = []
  const present = new Set<string>()
  for (const n of notes) {
    if (!PLAYER_MAP_SECTIONS.includes(n.section)) continue
    const k = nodeKey(n.id)
    present.add(k)
    nodes.push({
      key: k,
      kind: n.section,
      linkKind: 'playernote',
      id: n.id,
      name: n.title || '(untitled)',
      sub: n.section === 'quests' ? QUEST_STATUS_LABEL[n.status] ?? undefined : undefined,
      section: n.section,
    })
  }

  const edges = links
    .filter((l) => l.fromKind === 'playernote' && l.toKind === 'playernote')
    .filter((l) => present.has(nodeKey(l.fromId)) && present.has(nodeKey(l.toId)))
    .map((l) => ({
      key: `link:${l.id}`,
      fromKey: nodeKey(l.fromId),
      toKey: nodeKey(l.toId),
      label: l.label,
      derived: false,
      linkId: l.id,
    }))

  return { nodes, edges }
}
