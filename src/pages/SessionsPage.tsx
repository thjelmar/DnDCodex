import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createSession, updateSession, deleteSession } from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { Markdown } from '../lib/markdown'
import { formatDate, todayISODate } from '../lib/format'
import type { Session } from '../db/types'

export function SessionsPage() {
  const campaign = useCampaign()
  const sessions = useLiveQuery(
    () =>
      db.sessions
        .where('campaignId')
        .equals(campaign.id)
        .reverse()
        .sortBy('date'),
    [campaign.id],
  )

  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Keep a valid selection as the list changes.
  useEffect(() => {
    if (!sessions) return
    if (sessions.length === 0) {
      setSelectedId(null)
    } else if (!sessions.some((s) => s.id === selectedId)) {
      setSelectedId(sessions[0].id)
    }
  }, [sessions, selectedId])

  const selected = sessions?.find((s) => s.id === selectedId) ?? null

  async function addSession() {
    const s = await createSession(campaign.id, {
      title: `Session ${(sessions?.length ?? 0) + 1}`,
      date: todayISODate(),
    })
    setSelectedId(s.id)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
      <div>
        <button className="btn primary" style={{ width: '100%', marginBottom: 12 }} onClick={addSession}>
          ＋ New Session
        </button>
        {sessions?.length === 0 && <p className="faint">No sessions yet.</p>}
        {sessions?.map((s) => (
          <div
            key={s.id}
            className="list-row"
            style={{
              cursor: 'pointer',
              borderColor: s.id === selectedId ? 'var(--accent)' : undefined,
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 2,
            }}
            onClick={() => setSelectedId(s.id)}
          >
            <div className="title">{s.title}</div>
            <div className="sub">{formatDate(s.date)}</div>
          </div>
        ))}
      </div>

      <div>
        {selected ? (
          <SessionEditor key={selected.id} session={selected} onDelete={() => setSelectedId(null)} />
        ) : (
          <div className="empty">
            <div className="big">📝</div>
            <p>Select a session, or create one to start taking notes.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SessionEditor({ session, onDelete }: { session: Session; onDelete: () => void }) {
  const [title, setTitle] = useState(session.title)
  const [date, setDate] = useState(session.date)
  const [notes, setNotes] = useState(session.notes)
  const [dmNotes, setDmNotes] = useState(session.dmNotes)
  const [preview, setPreview] = useState(false)
  const [showDm, setShowDm] = useState(true)

  // Debounced autosave whenever a field changes.
  useEffect(() => {
    const t = setTimeout(() => {
      updateSession(session.id, { title, date, notes, dmNotes })
    }, 500)
    return () => clearTimeout(t)
  }, [title, date, notes, dmNotes, session.id])

  return (
    <div>
      <div className="form-row" style={{ gridTemplateColumns: '1fr 160px' }}>
        <div className="field">
          <label>Title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Date</label>
          <input
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className="row between" style={{ marginBottom: 6 }}>
        <label className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
          Session Notes
        </label>
        <button className="btn ghost small" onClick={() => setPreview((p) => !p)}>
          {preview ? '✎ Edit' : '👁 Preview'}
        </button>
      </div>
      {preview ? (
        <div className="card" style={{ cursor: 'default' }}>
          <Markdown text={notes} />
        </div>
      ) : (
        <textarea
          className="textarea tall"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What happened this session? Supports **markdown** and [[wiki links]]."
        />
      )}

      <div className="row between" style={{ margin: '20px 0 6px' }}>
        <label className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
          🔒 DM-only Notes
        </label>
        <button className="btn ghost small" onClick={() => setShowDm((s) => !s)}>
          {showDm ? 'Hide' : 'Show'}
        </button>
      </div>
      {showDm && (
        <textarea
          className="textarea"
          value={dmNotes}
          onChange={(e) => setDmNotes(e.target.value)}
          placeholder="Secret plans, foreshadowing, upcoming twists…"
        />
      )}

      <div className="row between" style={{ marginTop: 18 }}>
        <span className="faint" style={{ fontSize: 12 }}>
          Autosaves as you type.
        </span>
        <button
          className="btn danger small"
          onClick={async () => {
            if (confirm(`Delete "${session.title}"?`)) {
              await deleteSession(session.id)
              onDelete()
            }
          }}
        >
          Delete session
        </button>
      </div>
    </div>
  )
}
