import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { db } from '../db/db'
import { wikiTargets } from '../lib/richtext'
import type { EntityKind, Id } from '../db/types'

// "What links here": the entities whose rich-text fields contain a [[wiki link]]
// to this one. Wiki links resolve by NAME, so this matches on the entity's name
// (case-insensitive) — complementary to the explicit Connections (EntityLinks),
// which are stored links and already shown both ways.

interface Backref {
  kind: EntityKind
  id: Id
  name: string
  /** Campaign sub-route the entity lives on, for `?sel=` navigation. */
  section: string
}

const KIND_SECTION: Partial<Record<EntityKind, string>> = {
  npc: 'npcs',
  location: 'locations',
  item: 'items',
  note: 'notes',
  session: 'sessions',
}

const KIND_ICON: Partial<Record<EntityKind, string>> = {
  npc: '🧑',
  location: '📍',
  item: '⚔️',
  note: '📄',
  session: '📝',
}

/** Entities in the campaign that wiki-link to (kind,id) by its name. */
function useBacklinks(campaignId: Id, selfKind: EntityKind, selfId: Id, selfName: string): Backref[] {
  const target = selfName.trim().toLowerCase()
  return (
    useLiveQuery(async () => {
      if (!target) return []
      const [npcs, locations, items, notes, sessions] = await Promise.all([
        db.npcs.where('campaignId').equals(campaignId).toArray(),
        db.locations.where('campaignId').equals(campaignId).toArray(),
        db.items.where('campaignId').equals(campaignId).toArray(),
        db.notes.where('campaignId').equals(campaignId).toArray(),
        db.sessions.where('campaignId').equals(campaignId).toArray(),
      ])
      const refs: Backref[] = []
      const add = (kind: EntityKind, id: Id, name: string, fields: (string | undefined)[]) => {
        if (kind === selfKind && id === selfId) return // don't list self
        const mentions = fields.some((html) => html && wikiTargets(html).some((t) => t.toLowerCase() === target))
        if (mentions) refs.push({ kind, id, name, section: KIND_SECTION[kind] ?? '' })
      }
      npcs.forEach((n) => add('npc', n.id, n.name, [n.description, n.statBlock]))
      locations.forEach((l) => add('location', l.id, l.name, [l.description, l.pointsOfInterest]))
      items.forEach((i) => add('item', i.id, i.name, [i.description]))
      notes.forEach((n) => add('note', n.id, n.title, [n.body]))
      sessions.forEach((s) => add('session', s.id, s.title, [s.notes, s.dmNotes]))
      refs.sort((a, b) => a.name.localeCompare(b.name))
      return refs
    }, [campaignId, selfKind, selfId, target]) ?? []
  )
}

export function Backlinks({
  campaignId,
  kind,
  id,
  name,
}: {
  campaignId: Id
  kind: EntityKind
  id: Id
  name: string
}) {
  const navigate = useNavigate()
  const refs = useBacklinks(campaignId, kind, id, name)

  // Nothing to match on yet (a brand-new, unnamed entity).
  if (!name.trim()) return <span className="faint">Name this entry to see what links to it.</span>
  if (refs.length === 0) return <span className="faint">Nothing links here yet.</span>

  return (
    <div className="row wrap" style={{ gap: 8 }}>
      {refs.map((r) => (
        <button
          key={`${r.kind}:${r.id}`}
          className="tag backlink"
          onClick={() => navigate(`/campaign/${campaignId}/${r.section}?sel=${r.id}`)}
          title={`Open ${r.name || 'this entry'}`}
        >
          <span aria-hidden>{KIND_ICON[r.kind]}</span> {r.name || '(untitled)'}
        </button>
      ))}
    </div>
  )
}
