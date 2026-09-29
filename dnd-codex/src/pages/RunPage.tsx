import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createSession, updateSession } from '../db/repo'
import { RichTextEditor } from '../components/RichTextEditor'
import { SidePanel } from '../components/SidePanel'
import { StatBlockView } from '../components/StatBlockEditor'
import { DicePanel } from '../components/DiceRoller'
import { Icon } from '../components/Icon'
import { useCombat, CombatantRow, AddCustom, combatantFromNpc } from '../components/CombatRoster'
import { parseLeadingInt } from '../lib/combat'
import { formatDate, todayISODate } from '../lib/format'
import { isRichTextEmpty, wikiTargets } from '../lib/richtext'
import type { Id, Item, Location, Note, NPC, Session } from '../db/types'

// Run mode: the DM's at-the-table screen for one session. Three columns — what's
// in play (entities the session's notes link to, plus manual pins), the session's
// notes, and a compact combat tracker + dice roller. Everything reuses existing
// data: notes autosave to the session, combat is the same localStorage combat as
// the full tracker, and pins are a per-campaign localStorage list.

export type PeekKind = 'npc' | 'location' | 'item' | 'note'

interface PlayEntity {
  kind: PeekKind
  id: Id
  name: string
  sub: string
  npc?: NPC
}

const KIND_ORDER: PeekKind[] = ['npc', 'location', 'item', 'note']
const KIND_HEADING: Record<PeekKind, string> = { npc: 'NPCs', location: 'Locations', item: 'Items', note: 'Notes' }
const KIND_ICON: Record<PeekKind, string> = { npc: '🧑', location: '📍', item: '⚔️', note: '📄' }
const KIND_SECTION: Record<PeekKind, string> = { npc: 'npcs', location: 'locations', item: 'items', note: 'notes' }

const pinKey = (kind: PeekKind, id: Id) => `${kind}:${id}`
const pinsStorageKey = (campaignId: Id) => `codex.runPins.${campaignId}`

function loadPins(campaignId: Id): string[] {
  try {
    const raw = localStorage.getItem(pinsStorageKey(campaignId))
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function RunPage() {
  const { campaignId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const combat = useCombat()

  const campaign = useLiveQuery(() => db.campaigns.get(campaignId), [campaignId])
  const sessions = useLiveQuery(
    () => db.sessions.where('campaignId').equals(campaignId).reverse().sortBy('date'),
    [campaignId],
  )
  const world = useLiveQuery(async () => {
    const [npcs, locations, items, notes] = await Promise.all([
      db.npcs.where('campaignId').equals(campaignId).toArray(),
      db.locations.where('campaignId').equals(campaignId).toArray(),
      db.items.where('campaignId').equals(campaignId).toArray(),
      db.notes.where('campaignId').equals(campaignId).toArray(),
    ])
    return { npcs, locations, items, notes }
  }, [campaignId])
  const links = useLiveQuery(() => db.links.where('campaignId').equals(campaignId).toArray(), [campaignId])

  // Newest session by default; ?session=<id> picks another (and survives refresh).
  const session = sessions?.find((s) => s.id === params.get('session')) ?? sessions?.[0] ?? null

  const [pins, setPins] = useState<string[]>(() => loadPins(campaignId))
  useEffect(() => {
    try { localStorage.setItem(pinsStorageKey(campaignId), JSON.stringify(pins)) } catch { /* ignore */ }
  }, [campaignId, pins])
  const togglePin = (kind: PeekKind, id: Id) => {
    const k = pinKey(kind, id)
    setPins((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))
  }

  const [peek, setPeek] = useState<{ kind: PeekKind; id: Id } | null>(null)

  // Every NPC/location/item/note as a lookup, by composite key and by name.
  const index = useMemo(() => {
    const byKey = new Map<string, PlayEntity>()
    const byName = new Map<string, PlayEntity>()
    if (!world) return { byKey, byName }
    const put = (e: PlayEntity) => {
      byKey.set(pinKey(e.kind, e.id), e)
      const n = e.name.trim().toLowerCase()
      if (n && !byName.has(n)) byName.set(n, e)
    }
    world.npcs.forEach((n) => put({ kind: 'npc', id: n.id, name: n.name, sub: [n.role, n.race].filter(Boolean).join(' · '), npc: n }))
    world.locations.forEach((l) => put({ kind: 'location', id: l.id, name: l.name, sub: l.type }))
    world.items.forEach((i) => put({ kind: 'item', id: i.id, name: i.name, sub: [i.rarity, i.category].filter(Boolean).join(' · ') }))
    world.notes.forEach((n) => put({ kind: 'note', id: n.id, name: n.title, sub: 'World note' }))
    return { byKey, byName }
  }, [world])

  // What's in play: wiki links in this session's notes, explicit Connections to
  // the session, then manual pins. Each entity appears once, with why it's here.
  const inPlay = useMemo(() => {
    const out = new Map<string, { e: PlayEntity; linked: boolean; pinned: boolean }>()
    const add = (e: PlayEntity | undefined, how: 'linked' | 'pinned') => {
      if (!e) return
      const k = pinKey(e.kind, e.id)
      const cur = out.get(k) ?? { e, linked: false, pinned: false }
      cur[how] = true
      out.set(k, cur)
    }
    if (session) {
      for (const t of [...wikiTargets(session.dmNotes), ...wikiTargets(session.notes)]) {
        add(index.byName.get(t.toLowerCase()), 'linked')
      }
      for (const l of links ?? []) {
        if (l.fromKind === 'session' && l.fromId === session.id) add(index.byKey.get(`${l.toKind}:${l.toId}`), 'linked')
        if (l.toKind === 'session' && l.toId === session.id) add(index.byKey.get(`${l.fromKind}:${l.fromId}`), 'linked')
      }
    }
    pins.forEach((k) => add(index.byKey.get(k), 'pinned'))
    return [...out.values()]
  }, [session, links, pins, index])

  function peekByName(target: string) {
    const e = index.byName.get(target.trim().toLowerCase())
    if (e) setPeek({ kind: e.kind, id: e.id })
  }

  function addToCombat(npc: NPC) {
    combat.addCombatants([combatantFromNpc(npc)])
  }

  async function newSession() {
    const s = await createSession(campaignId, {
      title: `Session ${(sessions?.length ?? 0) + 1}`,
      date: todayISODate(),
    })
    setParams({ session: s.id }, { replace: true })
  }

  if (campaign === undefined || sessions === undefined) {
    return <div className="content faint">Loading…</div>
  }
  if (!campaign) {
    return (
      <div className="content">
        <div className="empty">
          <div className="big">🗺️</div>
          <p>That campaign doesn't exist.</p>
          <Link className="btn" to="/">Back to campaigns</Link>
        </div>
      </div>
    )
  }

  const peekEntity = peek ? index.byKey.get(pinKey(peek.kind, peek.id)) : undefined

  return (
    <div className="run-page">
      <div className="run-header">
        <span aria-hidden className="run-dot" style={{ background: campaign.color }} />
        <h1 className="mb-0 run-title">{campaign.name}</h1>
        <span className="run-badge"><Icon name="play" size={11} color="inherit" /> Run mode</span>
        {sessions.length > 0 && (
          <select
            className="select run-session-pick"
            value={session?.id ?? ''}
            onChange={(e) => setParams({ session: e.target.value }, { replace: true })}
            aria-label="Session"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.title} — {formatDate(s.date)}</option>
            ))}
          </select>
        )}
        <button className="btn ghost small" onClick={newSession}>
          <Icon name="plus" size={13} /> New session
        </button>
        <div style={{ flex: 1 }} />
        <Link to={`/campaign/${campaign.id}`} className="btn ghost small">
          <Icon name="arrow-left" size={13} /> Exit run mode
        </Link>
      </div>

      <div className="run-grid">
        {/* In play */}
        <aside className="run-col run-play">
          <div className="run-col-heading">In play</div>
          <PinPicker index={index.byKey} pinned={pins} onPin={togglePin} />
          {inPlay.length === 0 ? (
            <p className="faint run-hint">
              Nothing yet. [[Wiki links]] in this session's notes show up here automatically, or pin anything above.
            </p>
          ) : (
            KIND_ORDER.map((kind) => {
              const rows = inPlay.filter((r) => r.e.kind === kind)
              if (rows.length === 0) return null
              return (
                <div key={kind} className="run-play-group">
                  <div className="sidebar-heading run-play-kind">{KIND_HEADING[kind]}</div>
                  {rows.map(({ e, pinned, linked }) => (
                    <div key={e.id} className="run-play-row">
                      <button className="run-play-main" onClick={() => setPeek({ kind: e.kind, id: e.id })} title="Peek">
                        <span aria-hidden>{KIND_ICON[e.kind]}</span>
                        <span className="run-play-text">
                          <span className="run-play-name">{e.name || '(untitled)'}</span>
                          {e.sub && <span className="run-play-sub faint">{e.sub}</span>}
                        </span>
                      </button>
                      {e.npc && (
                        <button className="btn ghost small" onClick={() => addToCombat(e.npc!)} title="Add to combat">
                          <Icon name="swords" size={14} />
                        </button>
                      )}
                      <button
                        className={`btn ghost small run-pin${pinned ? ' on' : ''}`}
                        onClick={() => togglePin(e.kind, e.id)}
                        title={pinned ? 'Unpin' : linked ? 'Pin (keeps it here across sessions)' : 'Pin'}
                      >
                        <Icon name="pin" size={14} color={pinned ? 'var(--accent)' : 'var(--text-dim)'} />
                      </button>
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </aside>

        {/* Session notes */}
        <section className="run-col run-notes">
          {session ? (
            <RunSessionNotes key={session.id} session={session} onWikiLink={peekByName} />
          ) : (
            <div className="empty">
              <div className="big">📝</div>
              <p>No sessions yet in this campaign.</p>
              <button className="btn primary" onClick={newSession}>
                <Icon name="plus" size={15} color="inherit" /> Start a session
              </button>
            </div>
          )}
        </section>

        {/* Combat + dice */}
        <aside className="run-col run-tools">
          <RunCombat combat={combat} />
          <div className="card run-card">
            <div className="run-col-heading"><Icon name="dice" size={15} /> Dice</div>
            <DicePanel compact />
          </div>
        </aside>
      </div>

      {peek && peekEntity && world && (
        <SidePanel
          title={<>{KIND_ICON[peekEntity.kind]} {peekEntity.name || '(untitled)'}</>}
          onClose={() => setPeek(null)}
          footer={
            <>
              <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={() => togglePin(peekEntity.kind, peekEntity.id)}>
                <Icon name="pin" size={14} /> {pins.includes(pinKey(peekEntity.kind, peekEntity.id)) ? 'Unpin' : 'Pin'}
              </button>
              {peekEntity.npc && (
                <button className="btn" onClick={() => addToCombat(peekEntity.npc!)}>
                  <Icon name="swords" size={14} /> Add to combat
                </button>
              )}
              <Link className="btn" to={`/campaign/${campaignId}/${KIND_SECTION[peekEntity.kind]}?sel=${peekEntity.id}`}>
                <Icon name="external" size={14} /> Open page
              </Link>
            </>
          }
        >
          <Peek kind={peekEntity.kind} id={peekEntity.id} world={world} campaignId={campaignId} onWikiLink={peekByName} />
        </SidePanel>
      )}
    </div>
  )
}

/** The session's DM notes (prep, on top — what you read mid-session) and the
 *  player-facing notes (the log of what happened). Autosaves like the editor. */
function RunSessionNotes({ session, onWikiLink }: { session: Session; onWikiLink: (t: string) => void }) {
  const [notes, setNotes] = useState(session.notes)
  const [dmNotes, setDmNotes] = useState(session.dmNotes)

  useEffect(() => {
    if (notes === session.notes && dmNotes === session.dmNotes) return
    const t = setTimeout(() => { updateSession(session.id, { notes, dmNotes }) }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, dmNotes, session.id])

  return (
    <>
      <div className="run-session-title">
        <h2 className="mb-0">{session.title}</h2>
        <span className="faint">{formatDate(session.date)}</span>
        <Link to={`/campaign/${session.campaignId}/sessions?sel=${session.id}`} className="btn ghost small" style={{ marginLeft: 'auto' }}>
          <Icon name="pencil" size={13} /> Edit details
        </Link>
      </div>
      <RichTextEditor
        campaignId={session.campaignId}
        value={dmNotes}
        onChange={setDmNotes}
        label="🔒 DM notes"
        placeholder="Your prep: hooks, secrets, what the villain does next…"
        minHeight={160}
        onWikiLink={onWikiLink}
      />
      <RichTextEditor
        campaignId={session.campaignId}
        value={notes}
        onChange={setNotes}
        label="Session notes"
        placeholder="Log what happens as you play. [[Wiki links]] pop into the In play list."
        minHeight={200}
        revealNeedsConfirm={session.sharedWithPlayers === true}
        onWikiLink={onWikiLink}
      />
      <div className="faint" style={{ fontSize: 12 }}>Autosaves as you type. Click a [[wiki link]] to peek at it without leaving.</div>
    </>
  )
}

/** Search box that pins any NPC/location/item/note to the In play list. */
function PinPicker({
  index,
  pinned,
  onPin,
}: {
  index: Map<string, PlayEntity>
  pinned: string[]
  onPin: (kind: PeekKind, id: Id) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const term = q.trim().toLowerCase()
  const results = term
    ? [...index.entries()]
        .filter(([k, e]) => !pinned.includes(k) && e.name.toLowerCase().includes(term))
        .slice(0, 8)
        .map(([, e]) => e)
    : []

  return (
    <div className="run-pinpick" ref={ref}>
      <input
        className="input"
        placeholder="Pin an NPC, place, item…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) { onPin(results[0].kind, results[0].id); setQ('') }
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && term && (
        <div className="run-pinpick-pop">
          {results.length === 0 ? (
            <div className="faint" style={{ padding: '6px 8px', fontSize: 13 }}>No matches.</div>
          ) : (
            results.map((e) => (
              <button key={e.id} className="run-pinpick-opt" onClick={() => { onPin(e.kind, e.id); setQ('') }}>
                <span aria-hidden>{KIND_ICON[e.kind]}</span> {e.name}
                {e.sub && <span className="faint" style={{ fontSize: 11 }}> · {e.sub}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** Compact tracker for the right column — same combat as the full page. */
function RunCombat({ combat }: { combat: ReturnType<typeof useCombat> }) {
  const { state, activeId } = combat
  const [adding, setAdding] = useState(false)
  const n = state.combatants.length
  return (
    <div className="card run-card">
      <div className="run-col-heading row between" style={{ alignItems: 'center' }}>
        <span><Icon name="swords" size={15} /> Combat</span>
        <Link to="/tools/combat" className="btn ghost small" title="Open the full tracker">
          Full tracker <Icon name="chevron-right" size={13} />
        </Link>
      </div>

      <div className="run-combat-bar">
        {state.active ? (
          <>
            <span className="run-round">Round <strong>{state.round}</strong></span>
            <button className="btn ghost small" onClick={() => combat.step(-1)} title="Previous turn">
              <Icon name="chevron-left" size={15} />
            </button>
            <button className="btn primary small" onClick={() => combat.step(1)} title="Next turn">
              Next <Icon name="chevron-right" size={14} color="inherit" />
            </button>
          </>
        ) : (
          <button className="btn primary small" onClick={combat.start} disabled={n === 0}>Start combat</button>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn ghost small" onClick={combat.rollAll} disabled={n === 0} title="Roll initiative for everyone">
          <Icon name="dice" size={14} />
        </button>
        <button className="btn ghost small" onClick={combat.sortNow} disabled={n === 0} title="Re-sort by initiative">Sort</button>
        {(n > 0 || state.active) && (
          <button className="btn ghost small danger" onClick={combat.end}>End</button>
        )}
      </div>

      {n === 0 ? (
        <p className="faint run-hint">No combatants. Use <Icon name="swords" size={12} /> on an NPC in play, or add one below.</p>
      ) : (
        <div className="combat-list compact">
          {state.combatants.map((c, i) => (
            <CombatantRow
              key={c.id}
              c={c}
              index={i}
              active={c.id === activeId}
              onPatch={(p) => combat.patch(c.id, p)}
              onDamage={(amt) => combat.adjustHp(c.id, -amt)}
              onHeal={(amt) => combat.adjustHp(c.id, amt)}
              onRemove={() => combat.removeCombatant(c.id)}
            />
          ))}
        </div>
      )}

      {adding ? (
        <div style={{ marginTop: 10 }}>
          <AddCustom onAdd={(row) => combat.addCombatants([row])} />
          <button className="btn ghost small" style={{ marginTop: 6 }} onClick={() => setAdding(false)}>Done adding</button>
        </div>
      ) : (
        <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} /> Add combatant
        </button>
      )}
    </div>
  )
}

/** Read-only quick view of an entity, for glancing at mid-session. */
export function Peek({
  kind,
  id,
  world,
  campaignId,
  onWikiLink,
}: {
  kind: PeekKind
  id: Id
  world: { npcs: NPC[]; locations: Location[]; items: Item[]; notes: Note[] }
  campaignId: Id
  onWikiLink: (t: string) => void
}) {
  const prose = (html: string) =>
    isRichTextEmpty(html) ? null : (
      <RichTextEditor campaignId={campaignId} value={html} editable={false} onWikiLink={onWikiLink} />
    )

  if (kind === 'npc') {
    const n = world.npcs.find((x) => x.id === id)
    if (!n) return null
    const home = n.locationId ? world.locations.find((l) => l.id === n.locationId) : undefined
    const sb = n.statBlockData
    return (
      <div className="run-peek">
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <Portrait imageId={n.imageId} />
          <div className="run-peek-facts">
            {n.role && <div><span className="faint">Role</span> {n.role}</div>}
            {n.race && <div><span className="faint">Ancestry</span> {n.race}</div>}
            <div><span className="faint">Disposition</span> {n.disposition}</div>
            {home && (
              <div>
                <span className="faint">Found in</span>{' '}
                <button className="linklike" onClick={() => onWikiLink(home.name)}>{home.name}</button>
              </div>
            )}
            {sb && (
              <div>
                <span className="faint">HP</span> {parseLeadingInt(sb.hp) ?? '—'} · <span className="faint">AC</span> {parseLeadingInt(sb.ac) ?? '—'}
              </div>
            )}
          </div>
        </div>
        {prose(n.description)}
        {sb && <StatBlockView name={n.name} block={sb} />}
        {prose(n.statBlock)}
      </div>
    )
  }
  if (kind === 'location') {
    const l = world.locations.find((x) => x.id === id)
    if (!l) return null
    const parent = l.parentLocationId ? world.locations.find((x) => x.id === l.parentLocationId) : undefined
    const ruler = l.rulerNpcId ? world.npcs.find((x) => x.id === l.rulerNpcId) : undefined
    const here = world.npcs.filter((x) => x.locationId === l.id)
    return (
      <div className="run-peek">
        <Portrait imageId={l.imageId} wide />
        <div className="run-peek-facts">
          <div><span className="faint">Type</span> {l.type}</div>
          {parent && (
            <div><span className="faint">Within</span> <button className="linklike" onClick={() => onWikiLink(parent.name)}>{parent.name}</button></div>
          )}
          {ruler && (
            <div><span className="faint">Ruler</span> <button className="linklike" onClick={() => onWikiLink(ruler.name)}>{ruler.name}</button></div>
          )}
          {l.population && <div><span className="faint">Population</span> {l.population}</div>}
          {here.length > 0 && (
            <div>
              <span className="faint">NPCs here</span>{' '}
              {here.map((x, i) => (
                <span key={x.id}>
                  {i > 0 && ', '}
                  <button className="linklike" onClick={() => onWikiLink(x.name)}>{x.name}</button>
                </span>
              ))}
            </div>
          )}
        </div>
        {prose(l.description)}
      </div>
    )
  }
  if (kind === 'item') {
    const it = world.items.find((x) => x.id === id)
    if (!it) return null
    return (
      <div className="run-peek">
        <Portrait imageId={it.imageId} />
        <div className="run-peek-facts">
          <div><span className="faint">Rarity</span> {it.rarity}{it.attunement ? ' (requires attunement)' : ''}</div>
          {it.category && <div><span className="faint">Type</span> {it.category}</div>}
          {it.value && <div><span className="faint">Value</span> {it.value}</div>}
        </div>
        {prose(it.description)}
      </div>
    )
  }
  const note = world.notes.find((x) => x.id === id)
  if (!note) return null
  return <div className="run-peek">{prose(note.body) ?? <p className="faint">This note is empty.</p>}</div>
}

function Portrait({ imageId, wide = false }: { imageId: Id | null | undefined; wide?: boolean }) {
  const image = useLiveQuery(() => (imageId ? db.images.get(imageId) : undefined), [imageId])
  if (!image) return null
  return <img className={`run-portrait${wide ? ' wide' : ''}`} src={image.dataUrl} alt={image.name} />
}
