import { Icon } from '../components/Icon'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  createPlayerNote,
  updatePlayerNote,
  deletePlayerNote,
  updateCampaign,
  deleteCampaign,
  createLink,
} from '../db/repo'
import { RichTextEditor } from '../components/RichTextEditor'
import { CharacterSheetEditor, CharacterSheetView, DdbImport, emptyCharacterSheet, totalLevel } from '../components/CharacterSheet'
import { TagInput } from '../components/TagInput'
import { CampaignLinks } from '../components/CampaignLinks'
import { ThoughtMap, type MapConfig } from '../components/ThoughtMap'
import { PlayerNav } from '../components/PlayerNav'
import { SessionStatusBadge } from '../components/SessionStatusBadge'
import { SessionPlanner } from '../components/SessionPlanner'
import { sessionStatus } from '../lib/sessionStatus'
import { useSessionSchedule } from '../lib/useSessionSchedule'
import { useAuth } from '../auth/AuthProvider'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { useLiveSession } from '../lib/useLiveSession'
import { useSharedEntities, SharedCard } from '../components/SharedEntities'
import { RecapTimeline, hasRecap } from '../components/RecapTimeline'
import type { SharedEntityRow } from '../auth/cloud'
import { NotesSaveStatus, type SaveState } from '../components/NotesSaveStatus'
import { htmlToText, wikiTargets } from '../lib/richtext'
import { NOTE_CARD_LABEL, type NoteCardType } from '../editor/NoteCard'
import { useConfirm } from '../components/ConfirmDialog'
import { disconnectEdge, disconnectNode, type CampaignGraph } from '../lib/graph'
import { buildPlayerGraph, PLAYER_KIND_META, PLAYER_MAP_SECTIONS } from '../lib/playerGraph'
import { formatDate } from '../lib/format'
import type { CharacterSheet, PlayerNote, PlayerNoteSection } from '../db/types'

interface SectionDef {
  key: PlayerNoteSection
  label: string
  /** Short name for the filter chip. */
  short: string
  icon: string
  blurb: string
  addLabel: string
}
const SECTIONS: SectionDef[] = [
  { key: 'journal', label: 'Session Journal', short: 'Journal', icon: '📓', blurb: 'What happened, session by session.', addLabel: 'Add entry' },
  { key: 'character', label: 'My Character', short: 'Character', icon: '🧝', blurb: 'Your PC — sheet notes, backstory, goals.', addLabel: 'Add page' },
  { key: 'quests', label: 'Quests', short: 'Quests', icon: '⚔️', blurb: 'Objectives, leads, and loose threads.', addLabel: 'Add quest' },
  { key: 'people', label: 'People & Places', short: 'People', icon: '🧑', blurb: "NPCs you've met and where you've been.", addLabel: 'Add entry' },
  { key: 'notes', label: 'Loose Notes', short: 'Loose', icon: '📝', blurb: 'Anything else worth remembering.', addLabel: 'Add note' },
]

// Where a DM-shared entity lands among the player's own sections.
const SHARED_KIND_SECTION: Record<string, PlayerNoteSection> = {
  npc: 'people',
  location: 'people',
  session: 'journal',
  note: 'notes',
  item: 'notes',
}

const KIND_ICON: Record<string, string> = {
  npc: '🧑', location: '🗺️', session: '📅', note: '📝', item: '⚔️',
}

const QUEST_STATUS: { value: string; label: string; color: string }[] = [
  { value: 'active', label: 'Active', color: 'var(--accent)' },
  { value: 'completed', label: 'Completed', color: 'var(--good)' },
  { value: 'failed', label: 'Failed', color: 'var(--danger)' },
]

export function PlayerNotesPage() {
  const { campaignId } = useParams()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { user } = useAuth()

  const campaign = useLiveQuery(
    // `?? null` so a missing campaign reads as "not found", not "still loading".
    async () => (campaignId ? ((await db.campaigns.get(campaignId)) ?? null) : null),
    [campaignId],
  )
  const notes = useLiveQuery(
    () =>
      campaignId
        ? db.playerNotes.where('campaignId').equals(campaignId).toArray()
        : Promise.resolve<PlayerNote[]>([]),
    [campaignId],
  )

  const [searchParams, setSearchParams] = useSearchParams()
  const sel = searchParams.get('sel')
  const [editingId, setEditingId] = useState<string | null>(() => sel)
  const [viewSharedId, setViewSharedId] = useState<string | null>(null)
  const [plannerOpen, setPlannerOpen] = useState(false)

  // A session notification links here with ?planner=1 to pop the RSVP/planner
  // straight away; strip the param so closing it doesn't reopen on re-render.
  useEffect(() => {
    if (searchParams.get('planner') !== '1') return
    setPlannerOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('planner')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const sharedRows = useSharedEntities(campaign?.linkedCampaignId)
  const liveSession = useLiveSession(campaign?.linkedCampaignId)
  const schedule = useSessionSchedule(campaign?.linkedCampaignId)
  // The one session indicator: live wins, otherwise the DM's schedule decides.
  const sessState = sessionStatus(schedule ?? {}, !!liveSession)
  // A session is scheduled and still ahead of us (not live, not unscheduled) —
  // the window for subscribing to the calendar and for RSVPing.
  const preSession =
    !!schedule?.nextSessionDate &&
    (sessState.kind === 'upcoming' ||
      sessState.kind === 'thisweek' ||
      sessState.kind === 'gameday' ||
      sessState.kind === 'rescheduled')
  // Resolve the open panel's row from the LIVE list (not a snapshot), so a
  // realtime re-push updates the open card and an un-share closes it.
  const viewShared = viewSharedId ? sharedRows.find((r) => r.id === viewSharedId) ?? null : null
  useEffect(() => {
    if (sel) setEditingId(sel)
  }, [sel])
  const nbRef = useRef<HTMLDivElement>(null)
  // Select a note (from the list, the character card or the map) and bring the notebook into view.
  function openNote(id: string) {
    setViewSharedId(null)
    setEditingId(id)
    setTimeout(() => nbRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0)
  }

  // Local name state for inline rename (debounced autosave).
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')
  useEffect(() => {
    if (campaign) setName(campaign.name)
  }, [campaign?.id])
  useEffect(() => {
    if (!campaign || name === campaign.name) return
    const t = setTimeout(() => updateCampaign(campaign.id, { name }), 500)
    return () => clearTimeout(t)
  }, [name, campaign])

  const bySection = useMemo(() => {
    const map = new Map<PlayerNoteSection, PlayerNote[]>()
    for (const n of notes ?? []) {
      if (!map.has(n.section)) map.set(n.section, [])
      map.get(n.section)!.push(n)
    }
    // Journal newest-first by date; everything else most-recently-edited.
    for (const [key, list] of map) {
      if (key === 'journal') list.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      else list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
    return map
  }, [notes])

  const playerGraph = useLiveQuery(
    () => (campaignId ? buildPlayerGraph(campaignId) : Promise.resolve<CampaignGraph>({ nodes: [], edges: [] })),
    [campaignId],
  )
  const mapConfig = useMemo<MapConfig>(
    () => ({
      meta: PLAYER_KIND_META,
      kinds: PLAYER_MAP_SECTIONS,
      onConnect: async (from, to, label) => {
        await createLink(campaignId!, 'playernote', from.id, 'playernote', to.id, label)
      },
      onDisconnectEdge: (edge) => disconnectEdge(edge),
      onDisconnectNode: (node) => disconnectNode(campaignId!, node),
      onOpen: (node) => openNote(node.id),
      emptyHint: 'Add People & Places and Quests above, then drag bubbles together to map how they connect.',
      gapLabel: 'Loose ends',
      gapWord: 'loose end',
    }),
    [campaignId],
  )

  if (campaign === undefined) return <div className="content faint">Loading…</div>
  if (!campaign || !campaignId) {
    return (
      <div className="content">
        <div className="empty">
          <div className="big">📓</div>
          <p>That campaign doesn't exist.</p>
          <Link className="btn" to="/">
            Back to campaigns
          </Link>
        </div>
      </div>
    )
  }

  async function addTo(section: PlayerNoteSection) {
    const n = await createPlayerNote(campaignId!, { section })
    openNote(n.id)
  }

  async function removeCampaign() {
    if (
      await confirm({
        title: 'Remove this campaign?',
        message: (
          <>
            Remove <strong>{campaign!.name}</strong> and all of your notes for it? This can't be
            undone.
          </>
        ),
        confirmLabel: 'Remove',
        danger: true,
      })
    ) {
      await deleteCampaign(campaign!.id)
      navigate('/')
    }
  }

  const journalNotes = bySection.get('journal') ?? []
  const showStory = hasRecap(sharedRows, journalNotes)
  const character = (bySection.get('character') ?? [])[0]

  return (
    <div className="content player-page">
      <PlayerNav campaignId={campaign.id} />

      <div className="player-hero">
        <div className="player-hero-title">
          <span aria-hidden className="player-hero-dot" style={{ background: campaign.color }} />
          {renaming ? (
            <input
              className="input"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setRenaming(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') setRenaming(false)
              }}
              aria-label="Campaign name"
              style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 600, padding: '2px 8px', maxWidth: 420 }}
            />
          ) : (
            <>
              <h1 className="mb-0">{campaign.name}</h1>
              <button
                className="btn ghost small"
                title="Rename campaign"
                aria-label="Rename campaign"
                onClick={() => setRenaming(true)}
                style={{ flexShrink: 0 }}
              >
                <Icon name="pencil" size={14} />
              </button>
            </>
          )}
        </div>
        <div className="player-hero-session">
          {sessState.kind === 'live' ? (
            <SessionStatusBadge status={sessState} onJoin={() => navigate(`/player/${campaign.id}/session`)} />
          ) : campaign.linkedCampaignId && preSession ? (
            // The status pill itself is the button that opens the planner
            // (calendar + add-to-calendar + RSVP). Everything hangs off the DM's
            // cloud campaign (linkedCampaignId), not the player's local copy.
            <SessionStatusBadge status={sessState} onClick={() => setPlannerOpen(true)} />
          ) : (
            <SessionStatusBadge status={sessState} />
          )}
        </div>
      </div>
      <div className="subtitle" style={{ marginBottom: 16 }}>
        A campaign you're playing in — your journal, character, and notes.
      </div>

      <div className="row wrap between" style={{ gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <CampaignLinks campaignId={campaign.id} links={campaign.externalLinks ?? []} />
      </div>

      {(character || showStory) && (
        <div className="player-spotlight">
          {character && (
            <button className="player-character-card" onClick={() => openNote(character.id)}>
              <span className="player-character-avatar">
                <Icon name="user" size={18} color="inherit" />
              </span>
              <span className="player-character-meta">
                <span className="player-character-name">{character.title || 'Your character'}</span>
                {character.characterData && (
                  <span className="faint" style={{ fontSize: 12 }}>
                    {character.characterData.species}{' '}
                    {character.characterData.classes.map((c) => `${c.name} ${c.level}`).join(' / ')} · L
                    {totalLevel(character.characterData)}
                  </span>
                )}
              </span>
              <span className="player-character-open">Open sheet →</span>
            </button>
          )}
          {showStory && (
            <section className="player-story">
              <div className="row between" style={{ alignItems: 'baseline' }}>
                <h2 className="mb-0">Story so far</h2>
                <Link to={`/player/${campaign.id}/story`} className="btn ghost small">
                  View all →
                </Link>
              </div>
              <div style={{ marginTop: 10 }}>
                <RecapTimeline sharedRows={sharedRows} journal={journalNotes} />
              </div>
            </section>
          )}
        </div>
      )}

      <div className="player-sections">
      <div ref={nbRef} style={{ scrollMarginTop: 12 }}>
      <PlayerNotebook
        notes={notes ?? []}
        sharedRows={sharedRows}
        editingId={editingId}
        viewSharedId={viewShared ? viewSharedId : null}
        onOpen={(id) => openNote(id)}
        onOpenShared={(id) => { setEditingId(null); setViewSharedId(id) }}
        onClose={() => { setEditingId(null); setViewSharedId(null) }}
        onAdd={addTo}
      />
      </div>

      <CollapsibleSection storageKey={`player.${campaign.id}.map`} defaultOpen={false} icon="🕸️" label="Map">
        <p className="faint" style={{ margin: '2px 0 10px' }}>
          Your People &amp; Places and Quests as a web — drag a bubble onto another to connect them, and spot who
          you haven’t tied in yet.
        </p>
        <ThoughtMap graph={playerGraph} config={mapConfig} />
      </CollapsibleSection>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '28px 0 16px' }} />
      <button className="btn danger small" onClick={removeCampaign}>
        Remove this campaign
      </button>
      </div>

      {plannerOpen && campaign.linkedCampaignId && (
        <SessionPlanner
          mode="player"
          campaign={campaign}
          cloudCampaignId={campaign.linkedCampaignId}
          userId={user?.id}
          schedule={schedule ?? {}}
          isLive={!!liveSession}
          signedIn={!!user}
          onClose={() => setPlannerOpen(false)}
        />
      )}
    </div>
  )
}

/** True when rich-text HTML has no real content (empty, whitespace, empty tags). */
function isBlankHtml(html: string): boolean {
  return !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}


type NbFilter = 'all' | PlayerNoteSection

/** What a list row shows under the title: card counts for a live-session note, else the first words. */
function noteSummary(n: PlayerNote): string {
  const counts: Record<string, number> = {}
  for (const m of n.body.matchAll(/data-note-card="(\w+)"/g)) counts[m[1]] = (counts[m[1]] ?? 0) + 1
  const parts = Object.entries(counts).map(([t, c]) => `${c} ${NOTE_CARD_LABEL[t as NoteCardType] ?? t}`)
  return parts.length ? parts.join(' · ') : htmlToText(n.body).slice(0, 110)
}

/** A search box entry like "@mira" or "#gate" matches the name after the symbol. */
function matchesQuery(q: string, n: PlayerNote): boolean {
  const t = q.replace(/^[@#!?+]/, '').trim().toLowerCase()
  if (!t) return true
  return (
    n.title.toLowerCase().includes(t) ||
    n.tags.some((g) => g.toLowerCase().includes(t)) ||
    htmlToText(n.body).toLowerCase().includes(t)
  )
}

/**
 * The player's notebook (T-124): a searchable list of every entry (and what the DM shared),
 * the open entry beside it, and its links and backlinks. On a phone it is the list, then the
 * entry full screen with a back button.
 */
function PlayerNotebook({
  notes,
  sharedRows,
  editingId,
  viewSharedId,
  onOpen,
  onOpenShared,
  onClose,
  onAdd,
}: {
  notes: PlayerNote[]
  sharedRows: SharedEntityRow[]
  editingId: string | null
  viewSharedId: string | null
  onOpen: (id: string) => void
  onOpenShared: (id: string) => void
  onClose: () => void
  onAdd: (section: PlayerNoteSection) => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<NbFilter>('all')
  const [newOpen, setNewOpen] = useState(false)
  const editing = notes.find((n) => n.id === editingId) ?? null
  const viewShared = viewSharedId ? sharedRows.find((r) => r.id === viewSharedId) ?? null : null
  const open = !!(editing || viewShared)

  const groups = SECTIONS.map((section) => {
    const mine = notes
      .filter((n) => n.section === section.key && matchesQuery(query, n))
      .sort((a, b) =>
        section.key === 'journal' ? (b.date || '').localeCompare(a.date || '') : b.updatedAt.localeCompare(a.updatedAt),
      )
    const shared = sharedRows
      .filter((r) => r.data.kind !== 'session' && (SHARED_KIND_SECTION[r.data.kind] ?? 'notes') === section.key)
      .filter((r) => {
        const t = query.replace(/^[@#!?+]/, '').trim().toLowerCase()
        return !t || (r.data.title || '').toLowerCase().includes(t)
      })
      .sort((a, b) => (a.data.title || '').localeCompare(b.data.title || ''))
    return { section, mine, shared }
  })
  const visible = groups.filter((g) => filter === 'all' || g.section.key === filter)
  const shown = visible.reduce((n, g) => n + g.mine.length + g.shared.length, 0)
  const totals = new Map(groups.map((g) => [g.section.key, g.mine.length + g.shared.length]))

  return (
    <div className={`notebook${open ? ' has-note' : ''}`} data-testid="notebook">
      <aside className="nb-list" aria-label="Notes">
        <div className="nb-list-head">
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, or try @mira #gate"
            aria-label="Search notes"
            data-testid="nb-search"
          />
          <div className="nb-new">
            <button className="btn primary" data-testid="nb-new" aria-haspopup="menu" aria-expanded={newOpen} onClick={() => setNewOpen((o) => !o)}>
              <Icon name="plus" size={13} /> New
            </button>
            {newOpen && (
              <div className="nb-new-menu" role="menu">
                {SECTIONS.map((s) => (
                  <button
                    key={s.key}
                    role="menuitem"
                    data-testid={`nb-new-${s.key}`}
                    onClick={() => {
                      setNewOpen(false)
                      onAdd(s.key)
                    }}
                  >
                    <span aria-hidden>{s.icon}</span> {s.addLabel} <span className="faint">· {s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="nb-chips" role="group" aria-label="Filter by section">
          <button className={`nb-chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>
            All {notes.length + groups.reduce((n, g) => n + g.shared.length, 0)}
          </button>
          {SECTIONS.map((s) => (
            <button key={s.key} className={`nb-chip${filter === s.key ? ' on' : ''}`} onClick={() => setFilter(filter === s.key ? 'all' : s.key)}>
              {s.short} {totals.get(s.key) || ''}
            </button>
          ))}
        </div>
        <div className="nb-items">
          {shown === 0 && (
            <p className="faint nb-none" data-testid="nb-none">
              {query ? 'No notes match that search.' : 'Nothing here yet. Use New to add a journal entry, quest, or note.'}
            </p>
          )}
          {visible.map(({ section, mine, shared }) =>
            mine.length + shared.length === 0 ? null : (
              <div key={section.key} className="nb-group" data-testid={`nb-group-${section.key}`}>
                <div className="nb-group-title">{section.label}</div>
                {shared.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`nb-item${viewSharedId === r.id ? ' sel' : ''}`}
                    onClick={() => onOpenShared(r.id)}
                  >
                    <span className="nb-ico" aria-hidden>{KIND_ICON[r.data.kind] ?? '📄'}</span>
                    <span className="nb-item-main">
                      <span className="nb-item-title">{r.data.title}</span>
                      <span className="nb-item-meta"><span className="shared-pill"><Icon name="eye" size={12} color="inherit" /> Shared by DM</span></span>
                    </span>
                  </button>
                ))}
                {mine.map((n) => {
                  const status = QUEST_STATUS.find((q) => q.value === n.status)
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className={`nb-item${editingId === n.id ? ' sel' : ''}`}
                      data-testid="nb-item"
                      onClick={() => onOpen(n.id)}
                    >
                      <span className="nb-ico" aria-hidden>{section.icon}</span>
                      <span className="nb-item-main">
                        <span className="nb-item-title">{n.title}</span>
                        {noteSummary(n) && <span className="nb-item-prev">{noteSummary(n)}</span>}
                        <span className="nb-item-meta">
                          {n.section === 'journal' && n.date && <span>{formatDate(n.date)}</span>}
                          {n.section === 'quests' && status && <span style={{ color: status.color }}>{status.label}</span>}
                          {n.section === 'character' && n.characterData && (
                            <span>{n.characterData.species} {n.characterData.classes.map((c) => `${c.name} ${c.level}`).join(' / ')}</span>
                          )}
                          {n.tags.slice(0, 3).map((g) => <span key={g} className="nb-tag">#{g}</span>)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            ),
          )}
        </div>
      </aside>

      <section className="nb-editor" aria-label="Note">
        {editing ? (
          <PlayerEntryEditor key={editing.id} note={editing} onBack={onClose} />
        ) : viewShared ? (
          <div className="nb-shared">
            <button className="btn ghost small nb-back" onClick={onClose}><Icon name="arrow-left" size={13} /> Notes</button>
            <SharedCard row={viewShared} />
          </div>
        ) : (
          <div className="nb-empty" data-testid="nb-empty">
            <div className="big" aria-hidden>📓</div>
            <p className="faint">Pick a note from the list, or use New to start one.</p>
          </div>
        )}
      </section>

      {editing && <NotebookSide note={editing} notes={notes} onOpen={onOpen} />}
    </div>
  )
}

/** Names this note links to with [[wiki links]], and the notes that link to it by title. */
function NotebookSide({ note, notes, onOpen }: { note: PlayerNote; notes: PlayerNote[]; onOpen: (id: string) => void }) {
  const links = wikiTargets(note.body)
  const title = note.title.trim().toLowerCase()
  const backlinks = title
    ? notes.filter((n) => n.id !== note.id && wikiTargets(n.body).some((t) => t.toLowerCase() === title))
    : []
  const byTitle = (name: string) => notes.find((n) => n.id !== note.id && n.title.trim().toLowerCase() === name.toLowerCase())
  return (
    <aside className="nb-side" aria-label="Links" data-testid="nb-side">
      <div className="nb-side-title">Linked from this note</div>
      {links.length === 0 ? (
        <p className="faint nb-side-none">No links yet. Select a name and press Link.</p>
      ) : (
        links.map((name) => {
          const target = byTitle(name)
          return target ? (
            <button key={name} className="nb-link" onClick={() => onOpen(target.id)}>{name}</button>
          ) : (
            <span key={name} className="nb-link nb-link-plain">{name}</span>
          )
        })
      )}
      <div className="nb-side-title">Backlinks</div>
      {backlinks.length === 0 ? (
        <p className="faint nb-side-none">No other note links here.</p>
      ) : (
        backlinks.map((n) => (
          <button key={n.id} className="nb-link" onClick={() => onOpen(n.id)}>{n.title}</button>
        ))
      )}
    </aside>
  )
}

function PlayerEntryEditor({ note, onBack }: { note: PlayerNote; onBack: () => void }) {
  const confirm = useConfirm()
  const section = SECTIONS.find((s) => s.key === note.section)
  const [title, setTitle] = useState(note.title)
  const [tags, setTags] = useState(note.tags)
  const [body, setBody] = useState(note.body)
  const [date, setDate] = useState(note.date)
  const [status, setStatus] = useState(note.status)
  const [characterData, setCharacterData] = useState<CharacterSheet | null>(note.characterData ?? null)
  const [charEdit, setCharEdit] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
    } else {
      setSaveState('saving')
    }
    const t = setTimeout(() => {
      void updatePlayerNote(note.id, { title, tags, body, date, status, characterData }).then(() => setSaveState('saved'))
    }, 500)
    return () => clearTimeout(t)
  }, [title, tags, body, date, status, characterData, note.id])

  return (
    <div className="nb-entry" data-testid="nb-entry">
      <div className="nb-entry-bar">
        <button className="btn ghost small nb-back" onClick={onBack} aria-label="Back to notes">
          <Icon name="arrow-left" size={13} /> Notes
        </button>
        <span className="pill-tag">{section?.icon} {section?.label ?? 'Entry'}</span>
        <span style={{ flex: 1 }} />
        <NotesSaveStatus state={saveState} />
        <button
          className="btn ghost small danger-text"
          onClick={async () => {
            if (
              await confirm({
                title: 'Delete entry?',
                message: (
                  <>
                    Delete <strong>{note.title}</strong>? This can't be undone.
                  </>
                ),
                confirmLabel: 'Delete',
                danger: true,
              })
            ) {
              await deletePlayerNote(note.id)
              onBack()
            }
          }}
        >
          Delete
        </button>
      </div>

      <input
        className="nb-title"
        aria-label={note.section === 'character' ? 'Character name' : 'Title'}
        value={title}
        placeholder="Title"
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="nb-meta">
        {note.section === 'journal' && (
          <label className="nb-meta-field">
            <span>Session date</span>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
        {note.section === 'quests' && (
          <label className="nb-meta-field">
            <span>Status</span>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              {QUEST_STATUS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
        )}
        <div className="nb-meta-field nb-meta-tags">
          <span>Tags</span>
          <TagInput campaignId={note.campaignId} tags={tags} onChange={setTags} />
        </div>
      </div>

      {note.section === 'character' && (
        <div className="field">
          {characterData ? (
            <>
              <div className="row between" style={{ alignItems: 'center', marginBottom: 8 }}>
                <span className="char-sub-label" style={{ margin: 0 }}>Character sheet</span>
                <button className="btn ghost small" onClick={() => setCharEdit((e) => !e)}>
                  <Icon name={charEdit ? 'eye' : 'pencil'} size={13} /> {charEdit ? 'View' : 'Edit'}
                </button>
              </div>
              {charEdit ? (
                <>
                  <DdbImport existing={characterData.ddb} onImported={(sheet, name, backstory) => {
                    setCharacterData({ ...sheet, ac: sheet.ac ?? characterData.ac })
                    if (name && (!title.trim() || title === 'Untitled')) setTitle(name)
                    if (backstory && isBlankHtml(body)) setBody(backstory)
                  }} />
                  <CharacterSheetEditor value={characterData} onChange={setCharacterData} />
                </>
              ) : (
                <CharacterSheetView value={characterData} name={title} />
              )}
            </>
          ) : (
            <div className="char-empty">
              <p className="faint" style={{ marginTop: 0 }}>Make this a structured character sheet — build it by hand, or import from D&amp;D Beyond.</p>
              <button className="btn small" onClick={() => setCharacterData(emptyCharacterSheet())}><Icon name="plus" size={13} /> Create sheet</button>
              <div style={{ marginTop: 12 }}><DdbImport onImported={(sheet, name, backstory) => {
                setCharacterData(sheet)
                if (name && (!title.trim() || title === 'Untitled')) setTitle(name)
                if (backstory && isBlankHtml(body)) setBody(backstory)
              }} /></div>
            </div>
          )}
        </div>
      )}

      <RichTextEditor
        campaignId={note.campaignId}
        value={body}
        onChange={setBody}
        label={note.section === 'character' ? 'Backstory & notes' : undefined}
        placeholder="Write freely. Formatting, [[wiki links]], and images all work."
        minHeight={260}
        variant="player"
      />
    </div>
  )
}
