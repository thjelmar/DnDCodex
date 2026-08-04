import { db } from '../db/db'
import type { EntityKind } from '../db/types'

// Full-text-ish search across every campaign and entity. For a local app the
// dataset is small enough to scan in memory, so we load all records and match
// case-insensitively against the relevant text fields. Results carry a route so
// the palette can jump straight to the matched item (via a ?sel= param the
// master-detail pages read to preselect).

export interface SearchResult {
  key: string
  kind: EntityKind
  icon: string
  title: string
  /** Context line, e.g. "NPC · Curse of the Shattered Crown". */
  subtitle: string
  /** Snippet of the matched text with the term in context. */
  snippet: string
  to: string
  score: number
}

const KIND_ICON: Record<EntityKind, string> = {
  campaign: '📚',
  session: '📝',
  npc: '🧑',
  location: '📍',
  item: '⚔️',
  note: '📄',
}
const ROLLTABLE_ICON = '🎲'

const KIND_LABEL: Record<EntityKind, string> = {
  campaign: 'Campaign',
  session: 'Session',
  npc: 'NPC',
  location: 'Location',
  item: 'Item',
  note: 'Note',
}

/** Returns a ~90-char snippet centered on the first match, or '' if none. */
function snippetAround(text: string, q: string): string {
  if (!text) return ''
  const idx = text.toLowerCase().indexOf(q)
  if (idx === -1) return ''
  const radius = 40
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + q.length + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return prefix + text.slice(start, end).replace(/\s+/g, ' ').trim() + suffix
}

/**
 * Scores a record against the query. The title field is weighted highest and a
 * prefix match on the title is boosted so exact-ish names sort to the top.
 * Returns null when nothing matches.
 */
function evaluate(
  q: string,
  title: string,
  bodyFields: string[],
): { score: number; snippet: string } | null {
  const t = title.toLowerCase()
  let score = 0
  if (t.includes(q)) score += t.startsWith(q) ? 6 : 4
  let snippet = ''
  for (const field of bodyFields) {
    if (field && field.toLowerCase().includes(q)) {
      score += 1
      if (!snippet) snippet = snippetAround(field, q)
    }
  }
  if (score === 0) return null
  return { score, snippet }
}

export async function searchAll(rawQuery: string, limit = 40): Promise<SearchResult[]> {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return []

  const [campaigns, sessions, locations, npcs, items, notes, rollTables] =
    await Promise.all([
      db.campaigns.toArray(),
      db.sessions.toArray(),
      db.locations.toArray(),
      db.npcs.toArray(),
      db.items.toArray(),
      db.notes.toArray(),
      db.rollTables.toArray(),
    ])

  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]))
  const results: SearchResult[] = []

  const push = (
    kind: EntityKind | 'rolltable',
    id: string,
    campaignId: string | null,
    title: string,
    to: string,
    evalResult: { score: number; snippet: string } | null,
    extraSubtitle?: string,
  ) => {
    if (!evalResult) return
    const iconKind = kind === 'rolltable' ? null : (kind as EntityKind)
    const label = kind === 'rolltable' ? 'Roll Table' : KIND_LABEL[kind as EntityKind]
    const parts = [label]
    if (extraSubtitle) parts.push(extraSubtitle)
    if (campaignId && campaignName.has(campaignId)) parts.push(campaignName.get(campaignId)!)
    results.push({
      key: `${kind}:${id}`,
      kind: (iconKind ?? 'note') as EntityKind,
      icon: iconKind ? KIND_ICON[iconKind] : ROLLTABLE_ICON,
      title: title || '(untitled)',
      subtitle: parts.join(' · '),
      snippet: evalResult.snippet,
      to,
      score: evalResult.score,
    })
  }

  for (const c of campaigns) {
    push('campaign', c.id, null, c.name, `/campaign/${c.id}`,
      evaluate(q, c.name, [c.summary, c.description]))
  }
  const tagsText = (tags: string[] | undefined) => (tags ?? []).join(' ')

  for (const s of sessions) {
    push('session', s.id, s.campaignId, s.title,
      `/campaign/${s.campaignId}/sessions?sel=${s.id}`,
      evaluate(q, s.title, [s.notes, s.dmNotes, tagsText(s.tags)]), s.date)
  }
  for (const l of locations) {
    push('location', l.id, l.campaignId, l.name,
      `/campaign/${l.campaignId}/locations?sel=${l.id}`,
      evaluate(q, l.name, [l.type, l.description, tagsText(l.tags)]))
  }
  for (const n of npcs) {
    push('npc', n.id, n.campaignId, n.name,
      `/campaign/${n.campaignId}/npcs?sel=${n.id}`,
      evaluate(q, n.name, [n.role, n.description, n.statBlock, tagsText(n.tags)]), n.role)
  }
  for (const i of items) {
    push('item', i.id, i.campaignId, i.name,
      `/campaign/${i.campaignId}/items?sel=${i.id}`,
      evaluate(q, i.name, [i.category, i.description, tagsText(i.tags)]), i.rarity)
  }
  for (const nt of notes) {
    push('note', nt.id, nt.campaignId, nt.title,
      `/campaign/${nt.campaignId}/notes?sel=${nt.id}`,
      evaluate(q, nt.title, [nt.body, tagsText(nt.tags)]),
      (nt.tags ?? [])[0] || undefined)
  }
  for (const rt of rollTables) {
    const entriesText = rt.entries.map((e) => e.text).join(' • ')
    push('rolltable', rt.id, rt.campaignId, rt.name,
      `/campaign/${rt.campaignId}/tables?sel=${rt.id}`,
      evaluate(q, rt.name, [rt.category, rt.description, entriesText, tagsText(rt.tags)]), rt.category || undefined)
  }

  results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
  return results.slice(0, limit)
}
