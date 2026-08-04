import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createLink, deleteLink, linksForEntity } from '../db/repo'
import type { EntityKind, Id, Link } from '../db/types'

// Kinds a user can link to from the UI. Campaign links are handled separately
// on the overview page, so they're excluded here.
const LINKABLE_KINDS: { kind: EntityKind; label: string }[] = [
  { kind: 'npc', label: 'NPC' },
  { kind: 'location', label: 'Location' },
  { kind: 'item', label: 'Item' },
  { kind: 'note', label: 'Note' },
  { kind: 'session', label: 'Session' },
]

interface NamedEntity {
  id: Id
  kind: EntityKind
  name: string
}

/** Loads every linkable entity in the campaign with a display name. */
function useCampaignEntities(campaignId: Id): NamedEntity[] {
  return (
    useLiveQuery(async () => {
      const [npcs, locations, items, notes, sessions] = await Promise.all([
        db.npcs.where('campaignId').equals(campaignId).toArray(),
        db.locations.where('campaignId').equals(campaignId).toArray(),
        db.items.where('campaignId').equals(campaignId).toArray(),
        db.notes.where('campaignId').equals(campaignId).toArray(),
        db.sessions.where('campaignId').equals(campaignId).toArray(),
      ])
      const out: NamedEntity[] = []
      npcs.forEach((n) => out.push({ id: n.id, kind: 'npc', name: n.name }))
      locations.forEach((l) => out.push({ id: l.id, kind: 'location', name: l.name }))
      items.forEach((i) => out.push({ id: i.id, kind: 'item', name: i.name }))
      notes.forEach((n) => out.push({ id: n.id, kind: 'note', name: n.title }))
      sessions.forEach((s) => out.push({ id: s.id, kind: 'session', name: s.title }))
      return out
    }, [campaignId]) ?? []
  )
}

const KIND_ICON: Record<EntityKind, string> = {
  campaign: '📚',
  session: '📝',
  npc: '🧑',
  location: '📍',
  item: '⚔️',
  note: '📄',
}

export function EntityLinks({
  campaignId,
  kind,
  id,
}: {
  campaignId: Id
  kind: EntityKind
  id: Id
}) {
  const entities = useCampaignEntities(campaignId)
  const links = useLiveQuery(() => linksForEntity(kind, id), [kind, id]) ?? []

  const nameOf = (k: EntityKind, eid: Id) =>
    entities.find((e) => e.kind === k && e.id === eid)?.name ?? '(deleted)'

  // Resolve the "other end" of each link relative to this entity.
  const connections = links.map((l: Link) => {
    const isFrom = l.fromKind === kind && l.fromId === id
    return {
      link: l,
      otherKind: isFrom ? l.toKind : l.fromKind,
      otherId: isFrom ? l.toId : l.fromId,
      label: l.label,
    }
  })

  const [targetKind, setTargetKind] = useState<EntityKind>('location')
  const [targetId, setTargetId] = useState('')
  const [label, setLabel] = useState('')

  const targetOptions = entities.filter(
    (e) => e.kind === targetKind && !(e.kind === kind && e.id === id),
  )

  async function add() {
    if (!targetId) return
    await createLink(campaignId, kind, id, targetKind, targetId, label || 'related to')
    setTargetId('')
    setLabel('')
  }

  return (
    <div>
      <div className="row wrap" style={{ marginBottom: 10 }}>
        {connections.length === 0 && <span className="faint">No connections yet.</span>}
        {connections.map((c) => (
          <span key={c.link.id} className="tag" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <span className="faint">{c.label}</span>
            <span>
              {KIND_ICON[c.otherKind]} {nameOf(c.otherKind, c.otherId)}
            </span>
            <button
              onClick={() => deleteLink(c.link.id)}
              aria-label="Remove link"
              style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: 0 }}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
        <input
          className="input"
          style={{ width: 150 }}
          placeholder="relationship (e.g. ally of)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <select
          className="select"
          style={{ width: 120 }}
          value={targetKind}
          onChange={(e) => {
            setTargetKind(e.target.value as EntityKind)
            setTargetId('')
          }}
        >
          {LINKABLE_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ width: 170 }}
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        >
          <option value="">Select…</option>
          {targetOptions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <button className="btn small" onClick={add} disabled={!targetId}>
          ＋ Link
        </button>
      </div>
    </div>
  )
}
