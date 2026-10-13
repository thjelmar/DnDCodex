import { useEffect, useRef, useState } from 'react'
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
import { Modal } from '../components/Modal'
import { formatDate, todayISODate } from '../lib/format'
import { ShareControl } from '../components/ShareControl'
import { MasterDetail } from '../components/MasterDetail'
import { Icon } from '../components/Icon'
import { BUILTIN_SESSION_TEMPLATES } from '../data/sessionTemplates'
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

  return (
    <MasterDetail
      selected={!!selected}
      onBack={() => setSelectedId(null)}
      backLabel="All sessions"
      list={
        <>
          <NewSessionControl campaignId={campaign.id} onCreated={setSelectedId} onBlank={addSession} />
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
      {savingTemplate && <SaveTemplateModal session={session} onClose={() => setSavingTemplate(false)} />}
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

/**
 * The "New Session" control: a primary button to create a blank session, plus a
 * caret that opens a menu of built-in and saved templates (T-8). Picking a
 * template pre-fills the new session's notes/tags.
 */
function NewSessionControl({
  campaignId,
  onCreated,
  onBlank,
}: {
  campaignId: string
  onCreated: (id: string) => void
  onBlank: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const userTemplates = useLiveQuery(
    () => db.templates.where('kind').equals('session').sortBy('label'),
    [],
  )

  // Close the menu on an outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function fromTemplate(data: Record<string, unknown>) {
    setOpen(false)
    const s = await createSessionFromTemplate(campaignId, data)
    onCreated(s.id)
  }

  return (
    <div ref={ref} className="new-template-wrap" style={{ marginBottom: 12 }}>
      <div className="row" style={{ gap: 0 }}>
        <button
          className="btn primary"
          style={{ flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          onClick={onBlank}
        >
          <Icon name="plus" size={15} color="inherit" /> New Session
        </button>
        <button
          className="btn primary"
          aria-label="New session from template"
          title="New from template"
          style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: '1px solid rgba(0,0,0,0.2)', padding: '0 10px' }}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="chevron-right" size={13} color="inherit" className={`sidebar-caret${open ? ' open' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="new-template-menu">
          <div className="new-template-group">Built-in</div>
          {BUILTIN_SESSION_TEMPLATES.map((t) => (
            <button key={t.id} className="new-template-opt" onClick={() => fromTemplate(t.data)}>
              <span className="new-template-label">{t.label}</span>
              <span className="new-template-desc">{t.description}</span>
            </button>
          ))}
          <div className="new-template-group">Your templates</div>
          {userTemplates?.length === 0 && (
            <div className="new-template-empty">None yet — open a session and “Save as template”.</div>
          )}
          {userTemplates?.map((t) => (
            <button key={t.id} className="new-template-opt" onClick={() => fromTemplate(t.data)}>
              <span className="new-template-label">{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Small modal to name and save the current session as a reusable template. */
function SaveTemplateModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const [label, setLabel] = useState(session.title)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    await saveSessionAsTemplate(session, label)
    onClose()
  }

  return (
    <Modal
      title="Save as template"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy || !label.trim()}>
            {busy ? 'Saving…' : 'Save template'}
          </button>
        </>
      }
    >
      <p className="faint" style={{ marginTop: 0 }}>
        Saves this session's notes, DM notes, and tags (not its title or date) as a reusable starting
        point. It syncs to your account and shows up under “New Session → template”.
      </p>
      <div className="field">
        <label>Template name</label>
        <input
          className="input"
          value={label}
          maxLength={60}
          autoFocus
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && label.trim() && save()}
          placeholder="e.g. Downtime week"
        />
      </div>
    </Modal>
  )
}
