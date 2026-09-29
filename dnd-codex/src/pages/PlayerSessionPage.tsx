import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createPlayerNote, updatePlayerNote } from '../db/repo'
import { RichTextEditor } from '../components/RichTextEditor'
import { SharedHandouts } from '../components/SharedHandouts'
import { Icon } from '../components/Icon'
import { useLiveSession } from '../lib/useLiveSession'
import { formatDate } from '../lib/format'

/**
 * The player's live-session workspace. Reachable only while the DM has a live
 * session running (Run mode → "Start live session"): shows the handouts the DM
 * is currently sharing, a notes area that writes to a Journal entry for this
 * session (so it also feeds the player's Journal + "Story So Far"), and a slot
 * for the DM's VTT (wired later).
 */
export function PlayerSessionPage() {
  const { campaignId = '' } = useParams()
  const campaign = useLiveQuery(() => db.campaigns.get(campaignId), [campaignId])
  const live = useLiveSession(campaign?.linkedCampaignId)
  const sessionRef = live ? live.sessionId ?? 'live' : null

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

  // Create it once when the player first joins and none exists yet.
  const creating = useRef(false)
  useEffect(() => {
    if (!live || noteId !== null || creating.current) return
    creating.current = true
    ;(async () => {
      try {
        const n = await createPlayerNote(campaignId, {
          section: 'journal',
          title: live.title || 'Session',
          date: live.sessionDate || undefined,
        })
        await updatePlayerNote(n.id, { sessionRef: sessionRef! })
      } finally {
        creating.current = false
      }
    })()
  }, [live, noteId, campaignId, sessionRef])

  if (!campaign) return null

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

      <div className="session-grid">
        <section className="session-notes">
          <div className="run-col-heading"><Icon name="pencil" size={15} /> My session notes</div>
          {noteId ? <SessionNotes noteId={noteId} campaignId={campaignId} /> : <p className="faint" style={{ fontSize: 13 }}>Preparing your notes…</p>}
          <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>Saved to your Journal and the “Story So Far” recap.</p>
        </section>

        <aside className="session-aside">
          <SharedHandouts linkedCampaignId={campaign.linkedCampaignId} />
          <div className="card run-card session-vtt">
            <div className="run-col-heading"><Icon name="map" size={15} /> Tabletop</div>
            <div className="session-vtt-slot">
              <Icon name="map" size={28} strokeWidth={1.3} />
              <p className="faint" style={{ fontSize: 13, margin: '8px 0 0' }}>Your DM’s virtual tabletop will appear here.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** The session notes editor, bound to a Journal PlayerNote with autosave. */
function SessionNotes({ noteId, campaignId }: { noteId: string; campaignId: string }) {
  const note = useLiveQuery(() => db.playerNotes.get(noteId), [noteId])
  const [body, setBody] = useState('')
  const loaded = useRef<string | null>(null)

  // Load the note body once per note (external updates handled by the editor).
  useEffect(() => {
    if (note && loaded.current !== note.id) {
      loaded.current = note.id
      setBody(note.body)
    }
  }, [note])

  // Autosave 500ms after the last keystroke.
  useEffect(() => {
    if (!note || body === note.body) return
    const t = setTimeout(() => updatePlayerNote(note.id, { body }), 500)
    return () => clearTimeout(t)
  }, [body, note])

  if (!note) return null
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
