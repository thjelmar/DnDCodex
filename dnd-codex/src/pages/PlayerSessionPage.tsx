import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createPlayerNote, updatePlayerNote } from '../db/repo'
import { RichTextEditor } from '../components/RichTextEditor'
import { SharedHandouts } from '../components/SharedHandouts'
import { PlayerLiveBoardView } from '../components/PlayerLiveBoard'
import { useLiveScene } from '../auth/liveScene'
import { Icon } from '../components/Icon'
import { useLiveSession } from '../lib/useLiveSession'
import { formatDate } from '../lib/format'

/**
 * The player's live-session workspace. Reachable only while the DM has a live
 * session running (Run mode → "Start live session"): shows the handouts the DM
 * is currently sharing, a notes area that writes to a Journal entry for this
 * session (so it also feeds the player's Journal + "Story So Far"), and the
 * DM's live battle map in the Tabletop (see PlayerLiveBoardView); its full
 * screen puts these same session notes beside the map.
 */
export function PlayerSessionPage() {
  const { campaignId = '' } = useParams()
  // `?? null` so a missing campaign reads as "not found", not "still loading".
  const campaign = useLiveQuery(async () => (await db.campaigns.get(campaignId)) ?? null, [campaignId])
  const live = useLiveSession(campaign?.linkedCampaignId)
  const sessionRef = live ? live.sessionId ?? 'live' : null
  // While the Tabletop is full screen, its notes panel owns the notes editor.
  const [mapFull, setMapFull] = useState(false)
  // The DM's live battle map (one subscription for the page, so the board can
  // move between columns without re-subscribing).
  const liveMap = useLiveScene(campaign?.linkedCampaignId)
  const mapLive = !!liveMap.scene

  // Find the Journal entry for this live session (by sessionRef), if any.
  const noteId = useLiveQuery(async () => {
    if (!sessionRef) return null
    const n = await db.playerNotes
      .where('campaignId')
      .equals(campaignId)
      .filter((x) => x.section === 'journal' && x.sessionRef === sessionRef)
      .first()
    return n?.id ?? null
  }, [campaignId, sessionRef])

  // No note is created just for joining — the session note is created lazily the
  // moment the player actually writes something (see SessionNotes), so joining a
  // session never leaves an empty "Session" journal entry behind.

  if (campaign === undefined) return <div className="content faint">Loading…</div>
  if (!campaign) {
    return (
      <div className="content">
        <SessionEmpty campaignId={campaignId} message="That campaign doesn’t exist in this browser." />
      </div>
    )
  }

  if (!campaign.linkedCampaignId) {
    return (
      <div className="content">
        <SessionEmpty campaignId={campaignId} message="This campaign isn’t linked to a shared world, so there’s no live session to join." />
      </div>
    )
  }

  if (!live) {
    return (
      <div className="content">
        <SessionEmpty campaignId={campaignId} message="Your DM hasn’t started a live session right now. When they do, you’ll be able to join from your campaign home." />
      </div>
    )
  }

  const linkedId = campaign.linkedCampaignId
  // Title a new note after the session (the DM's session title, else its date) —
  // never the bare word "Session".
  const noteTitle = live.title || (live.sessionDate ? formatDate(live.sessionDate) : 'Session notes')
  const notesEditor =
    noteId === undefined ? (
      <p className="faint" style={{ fontSize: 13 }}>Preparing your notes…</p>
    ) : (
      <SessionNotes
        key={sessionRef ?? 'none'}
        initialNoteId={noteId}
        campaignId={campaignId}
        sessionRef={sessionRef!}
        defaultTitle={noteTitle}
        date={live.sessionDate || undefined}
      />
    )
  const notesCard = (
    <>
      <div className="run-col-heading"><Icon name="pencil" size={15} /> My session notes</div>
      {mapFull ? (
        // The full-screen map shows these notes beside it; unmount this copy
        // so it reloads fresh afterwards instead of saving a stale body.
        <p className="faint" style={{ fontSize: 13 }}>Your notes are open beside the full-screen map.</p>
      ) : (
        notesEditor
      )}
      <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>Saved to your Journal and the “Story So Far” recap.</p>
    </>
  )
  const board = (compact: boolean) => (
    <PlayerLiveBoardView
      live={liveMap}
      linkedCampaignId={linkedId}
      compact={compact}
      onExpandedChange={setMapFull}
      notesLabel="Notes"
      notes={
        <>
          <div className="run-col-heading"><Icon name="pencil" size={15} /> My session notes</div>
          {notesEditor}
        </>
      }
      empty={
        <div className="session-vtt-slot">
          <Icon name="map" size={28} strokeWidth={1.3} />
          <p className="faint" style={{ fontSize: 13, margin: '8px 0 0' }}>Your DM’s battle map appears here when they show one.</p>
        </div>
      }
    />
  )

  return (
    <div className="session-page">
      <div className="session-header">
        <span aria-hidden className="run-dot" style={{ background: campaign.color }} />
        <h1 className="mb-0 run-title">{live.title || 'Session'}</h1>
        <span className="run-live-on"><span className="run-live-dot" /> Live</span>
        {live.sessionDate && <span className="faint" style={{ fontSize: 13 }}>{formatDate(live.sessionDate)}</span>}
        <div style={{ flex: 1 }} />
        <Link to={`/player/${campaignId}`} className="btn ghost small">
          <Icon name="arrow-left" size={13} /> Leave
        </Link>
      </div>

      {/* While the DM is showing a map it takes the main column and your notes
          move to the rail; otherwise notes lead and the Tabletop waits there. */}
      <div className={`session-grid${mapLive ? ' map-live' : ''}`}>
        {mapLive ? (
          <section className="session-map">
            <div className="card run-card session-vtt">
              <div className="run-col-heading"><Icon name="map" size={15} /> Tabletop</div>
              {board(false)}
            </div>
          </section>
        ) : (
          <section className="session-notes">{notesCard}</section>
        )}

        <aside className="session-aside">
          {mapLive && <div className="card run-card session-notes-rail">{notesCard}</div>}
          <SharedHandouts linkedCampaignId={campaign.linkedCampaignId} />
          {!mapLive && (
            <div className="card run-card session-vtt">
              <div className="run-col-heading"><Icon name="map" size={15} /> Tabletop</div>
              {board(true)}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

/** True if rich-text HTML holds anything real (text or an image), not just
 *  empty paragraphs — so we never create/keep a blank session note. */
function hasContent(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0 || /<img/i.test(html)
}

/**
 * The session notes editor. The Journal note is created LAZILY — only once the
 * player actually writes something — so joining a session never leaves a blank
 * "Session" entry behind. Bound to any existing note (a re-join) via `initialNoteId`.
 */
function SessionNotes({
  initialNoteId,
  campaignId,
  sessionRef,
  defaultTitle,
  date,
}: {
  initialNoteId: string | null
  campaignId: string
  sessionRef: string
  defaultTitle: string
  date?: string
}) {
  // The note we're bound to once it exists (starts from any existing note).
  const idRef = useRef<string | null>(initialNoteId)
  const existing = useLiveQuery(() => (initialNoteId ? db.playerNotes.get(initialNoteId) : undefined), [initialNoteId])
  const [body, setBody] = useState('')
  const loaded = useRef(false)
  const saved = useRef('') // last body persisted (or loaded), to skip no-op saves

  // Load an existing note's body once.
  useEffect(() => {
    if (existing && !loaded.current) {
      loaded.current = true
      saved.current = existing.body
      setBody(existing.body)
    }
  }, [existing])

  const bodyRef = useRef(body)
  bodyRef.current = body

  // Create the note on first real content; after that, save what's typed —
  // including an emptied note (WYSIWYG). We don't auto-delete an emptied note:
  // it's the player's own entry, it's hidden from "Story So Far" while empty, and
  // deleting a just-synced record raced the sync layer and the editor's reload.
  async function persist(html: string) {
    if (html === saved.current) return
    if (idRef.current) {
      await updatePlayerNote(idRef.current, { body: html })
      saved.current = html
    } else if (hasContent(html)) {
      const n = await createPlayerNote(campaignId, { section: 'journal', title: defaultTitle, date })
      await updatePlayerNote(n.id, { sessionRef, body: html })
      idRef.current = n.id
      loaded.current = true
      saved.current = html
    }
  }

  // Autosave 500ms after the last keystroke.
  useEffect(() => {
    if (body === saved.current) return
    const t = setTimeout(() => persist(body), 500)
    return () => clearTimeout(t)
  }, [body])

  // Flush on unmount too (the page moves the editor between columns), so a
  // keystroke still inside the debounce isn't lost — and an emptied note is cleaned up.
  useEffect(() => () => void persist(bodyRef.current), [])

  return (
    <RichTextEditor
      campaignId={campaignId}
      value={body}
      onChange={setBody}
      placeholder="Jot down what happens this session — [[wiki links]] and images work too."
      minHeight={280}
    />
  )
}

function SessionEmpty({ campaignId, message }: { campaignId: string; message: string }) {
  return (
    <div className="empty" style={{ marginTop: 24 }}>
      <div className="big"><Icon name="play" size={36} strokeWidth={1.4} /></div>
      <p style={{ maxWidth: 420, margin: '0 auto 14px' }}>{message}</p>
      <Link className="btn small" to={`/player/${campaignId}`}>
        <Icon name="arrow-left" size={13} /> Back to campaign home
      </Link>
    </div>
  )
}
