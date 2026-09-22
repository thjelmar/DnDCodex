import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAuth } from '../auth/AuthProvider'
import { pushEntity } from '../auth/cloud'
import { setEntityShared } from '../db/repo'
import { revealEntity, revealHash, type ShareableKind } from '../lib/reveal'
import { Icon } from './Icon'
import type { NPC, Location, Note, Session, Item } from '../db/types'

const KIND_ICON: Record<ShareableKind, string> = {
  npc: '🧑', location: '🗺️', note: '📝', session: '📅', item: '⚔️',
}

interface Pending {
  kind: ShareableKind
  id: string
  title: string
  entity: NPC | Location | Note | Session | Item
}

/**
 * Campaign-header control that surfaces shared entities with unpushed edits and
 * lets the DM publish the ones they choose (or all). Hidden when nothing is
 * pending — it only appears when there are changes to push.
 */
export function PushChangesPanel({ campaignId }: { campaignId: string }) {
  const { user } = useAuth()
  const npcs = useLiveQuery(() => db.npcs.where('campaignId').equals(campaignId).toArray(), [campaignId]) ?? []
  const locations = useLiveQuery(() => db.locations.where('campaignId').equals(campaignId).toArray(), [campaignId]) ?? []
  const notes = useLiveQuery(() => db.notes.where('campaignId').equals(campaignId).toArray(), [campaignId]) ?? []
  const sessions = useLiveQuery(() => db.sessions.where('campaignId').equals(campaignId).toArray(), [campaignId]) ?? []
  const items = useLiveQuery(() => db.items.where('campaignId').equals(campaignId).toArray(), [campaignId]) ?? []

  const pending = useMemo<Pending[]>(() => {
    const out: Pending[] = []
    const scan = (kind: ShareableKind, arr: (NPC | Location | Note | Session | Item)[]) => {
      for (const e of arr) {
        if (!e.sharedWithPlayers) continue
        const snap = revealEntity(kind, e)
        if (e.sharedPushedHash !== revealHash(snap)) out.push({ kind, id: e.id, title: snap.title || 'Untitled', entity: e })
      }
    }
    scan('npc', npcs)
    scan('location', locations)
    scan('note', notes)
    scan('session', sessions)
    scan('item', items)
    return out
  }, [npcs, locations, notes, sessions, items])

  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  if (!user || pending.length === 0) return null

  const toggleOpen = () => {
    if (!open) setSelected(new Set(pending.map((p) => p.id)))
    setOpen((o) => !o)
  }

  const pushSelected = async () => {
    setBusy(true)
    try {
      for (const p of pending) {
        if (!selected.has(p.id)) continue
        const snap = revealEntity(p.kind, p.entity)
        await pushEntity(campaignId, p.id, p.kind, snap)
        await setEntityShared(p.kind, p.id, { sharedPushedHash: revealHash(snap) })
      }
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn small primary" onClick={toggleOpen} title="Publish edits to your shared player copies">
        <Icon name="upload" size={14} color="inherit" /> Push changes ({pending.length})
      </button>
      {open && (
        <div className="pushchanges-pop">
          <div className="pushchanges-head">Unpublished changes</div>
          <div className="pushchanges-list">
            {pending.map((p) => (
              <label key={p.id} className="pushchanges-item">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={(e) => {
                    const next = new Set(selected)
                    if (e.target.checked) next.add(p.id)
                    else next.delete(p.id)
                    setSelected(next)
                  }}
                />
                <span aria-hidden>{KIND_ICON[p.kind]}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
              </label>
            ))}
          </div>
          <div className="row between" style={{ marginTop: 8, gap: 8 }}>
            <button
              className="btn ghost small"
              onClick={() => setSelected(new Set(selected.size === pending.length ? [] : pending.map((p) => p.id)))}
            >
              {selected.size === pending.length ? 'Clear' : 'Select all'}
            </button>
            <button className="btn small primary" disabled={busy || selected.size === 0} onClick={pushSelected}>
              {busy ? 'Pushing…' : `Push ${selected.size}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
