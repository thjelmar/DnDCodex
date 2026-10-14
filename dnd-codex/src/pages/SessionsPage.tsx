import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  createSession,
  updateSession,
  deleteSession,
  createSessionFromTemplate,
  saveSessionAsTemplate,
} from '../db/repo'
import { useCampaign } from './CampaignLayout'
import { RichTextEditor } from '../components/RichTextEditor'
import { TagInput } from '../components/TagInput'
import { useConfirm } from '../components/ConfirmDialog'
import { formatDate, todayISODate } from '../lib/format'
import { ShareControl } from '../components/ShareControl'
import { MasterDetail } from '../components/MasterDetail'
import { Icon } from '../components/Icon'
import { NewFromTemplateControl } from '../components/NewFromTemplateControl'
import { SaveAsTemplateModal } from '../components/SaveAsTemplateModal'
import { BUILTIN_SESSION_TEMPLATES } from '../data/builtinTemplates'
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

  // A ?sel=<id> param (from search or a wiki link) selects that session, both
  // on first mount and whenever the param changes (e.g. a same-page wiki jump).
  const [searchParams] = useSearchParams()
  const sel = searchParams.get('sel')
  const [selectedId, setSelectedId] = useState<string | null>(() => sel)
  useEffect(() => {
    if (sel) setSelectedId(sel)
  }, [sel])

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

  async function fromTemplate(data: Record<string, unknown>) {
    const s = await createSessionFromTemplate(campaign.id, data)
    setSelectedId(s.id)
  }

  return (
    <MasterDetail
      selected={!!selected}
      onBack={() => setSelectedId(null)}
      backLabel="All sessions"
      list={
        <>
          <NewFromTemplateControl
            kind="session"
            builtins={BUILTIN_SESSION_TEMPLATES}
            blankLabel="New Session"
            onBlank={addSession}
            onFromTemplate={fromTemplate}
            emptyHint="None yet — open a session and “Save as template”."
          />
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
        </>
      }
      detail={
        selected ? (
          <SessionEditor key={selected.id} session={selected} onDelete={() => setSelectedId(null)} />
        ) : (
          <div className="empty">
            <div className="big">📝</div>
            <p>Select a session, or create one to start taking notes.</p>
          </div>
        )
      }
    />
  )
}

function SessionEditor({ session, onDelete }: { session: Session; onDelete: () => void }) {
  const confirm = useConfirm()
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [title, setTitle] = useState(session.title)
  const [date, setDate] = useState(session.date)
  const [tags, setTags] = useState(session.tags)
  const [notes, setNotes] = useState(session.notes)
  const [dmNotes, setDmNotes] = useState(session.dmNotes)
  const [showDm, setShowDm] = useState(true)

  // Debounced autosave whenever a field changes.
  useEffect(() => {
    const t = setTimeout(() => {
      updateSession(session.id, { title, date, tags, notes, dmNotes })
    }, 500)
    return () => clearTimeout(t)
  }, [title, date, tags, notes, dmNotes, session.id])

  return (
    <div>
      <div className="share-bar" style={{ gap: 8 }}>
        <Link to={`/run/${session.campaignId}?session=${session.id}`} className="btn ghost small" title="Open this session in Run mode">
          <Icon name="play" size={12} /> Run this session
        </Link>
        <button
          className="btn ghost small"
          onClick={() => setSavingTemplate(true)}
          title="Save this session's notes and tags as a reusable template"
        >
          <Icon name="plus" size={12} /> Save as template
        </button>
        <ShareControl campaignId={session.campaignId} kind="session" entity={session} />
      </div>
      {savingTemplate && (
        <SaveAsTemplateModal
          defaultLabel={session.title}
          placeholder="e.g. Downtime week"
          description="Saves this session's notes, DM notes, and tags (not its title or date) as a reusable starting point. It syncs to your account and shows up under “New Session → template”."
          onSave={(label) => saveSessionAsTemplate(session, label).then(() => {})}
          onClose={() => setSavingTemplate(false)}
        />
      )}
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

      <div className="field">
        <label>Tags</label>
        <TagInput campaignId={session.campaignId} tags={tags} onChange={setTags} />
      </div>

      <RichTextEditor
        campaignId={session.campaignId}
        value={notes}
        onChange={setNotes}
        label="Session Notes"
        placeholder="What happened this session? Use the toolbar, [[wiki links]], and images."
        minHeight={220}
        revealNeedsConfirm={session.sharedWithPlayers === true}
        shareable
      />

      <div className="row between" style={{ margin: '20px 0 6px' }}>
        <label className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
          🔒 DM-only Notes
        </label>
        <button className="btn ghost small" onClick={() => setShowDm((s) => !s)}>
          {showDm ? 'Hide' : 'Show'}
        </button>
      </div>
      {showDm && (
        <RichTextEditor
          campaignId={session.campaignId}
          value={dmNotes}
          onChange={setDmNotes}
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
            if (
              await confirm({
                title: 'Delete session?',
                message: (
                  <>
                    Delete <strong>{session.title}</strong>? This can't be undone.
                  </>
                ),
                confirmLabel: 'Delete',
                danger: true,
              })
            ) {
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

