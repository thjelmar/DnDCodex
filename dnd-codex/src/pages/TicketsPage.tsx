import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useConfirm } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import {
  CATEGORIES,
  DetailsView,
  type EditLine,
  Linkified,
  PRIORITIES,
  StageBar,
  appendCheck,
  categoryLabel,
  checklistProgress,
  commitUrl,
  priorityRank,
  serializeLines,
  shortSha,
  stageLabel,
  stagesFor,
  ticketId,
  toEditLines,
  toggleCheck,
} from '../lib/tickets'

// Owner-only ticket queue: site bug reports and your own tickets in one list.
// Reads and writes go through the /api/bug-reports function (the table is
// service-role-only), passing the signed-in user's token so the server can
// confirm they're the maintainer. A Claude session works the same queue with
// `npm run tickets`; ticking "Public" puts a ticket on the /roadmap page.
// A ticket can be a follow-up of another (follow_up_of holds the parent's
// T-number), and its details can hold "- [ ]" checklists you tick off in place.

interface TicketComment {
  id: string
  author: string
  body: string
  created_at: string
}

interface TicketCommit {
  id: string
  sha: string
  subject: string | null
  created_at: string
}

interface Ticket {
  id: string
  number: number | null
  created_at: string
  updated_at?: string | null
  released_at?: string | null
  source: string
  title: string | null
  description: string | null
  category: string | null
  priority: string | null
  status: string
  is_public: boolean
  resolution_note: string | null
  claimed_by: string | null
  follow_up_of?: number | null
  reporter_email: string | null
  user_id: string | null
  route: string | null
  user_agent: string | null
  app_version: string | null
  screenshot?: string | null
  context?: Record<string, unknown> | null
  ticket_comments?: TicketComment[] | null
  ticket_commits?: TicketCommit[] | null
}

type Fields = Partial<
  Pick<
    Ticket,
    'title' | 'description' | 'category' | 'priority' | 'status' | 'is_public' | 'resolution_note' | 'follow_up_of'
  >
>

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

/** Parse "T-5", "t5" or "5" into a ticket number. */
function parseTicketRef(v: string): number | null {
  const m = /^\s*(?:T-?)?(\d+)\s*$/i.exec(v)
  return m ? Number(m[1]) : null
}

/** The owner's working title: the public title, else the report's first line. */
function displayTitle(t: Ticket): string {
  return t.title || (t.description ?? '').split('\n')[0].slice(0, 100) || '(untitled)'
}

export function TicketsPage() {
  const { user, session } = useAuth()
  const token = session?.access_token ?? null
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [view, setView] = useState<'open' | 'released' | 'all'>('open')
  const [category, setCategory] = useState<string>('all')
  const [source, setSource] = useState<string>('all')
  // The new-ticket form; followUpOf pre-links it when opened from "New follow-up".
  const [adding, setAdding] = useState<{ followUpOf: number | null } | null>(null)
  // A ticket to expand and scroll to (clicking a link). k re-triggers the same one.
  const [focus, setFocus] = useState<{ n: number; k: number } | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const confirm = useConfirm()

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/bug-reports', { headers: { authorization: `Bearer ${token}` } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((body as { error?: string }).error || `Error ${res.status}.`)
        setTickets([])
      } else {
        setTickets(((body as { reports?: Ticket[] }).reports ?? []) as Ticket[])
      }
    } catch {
      setError('Could not reach the server. (This page only works on the deployed site.)')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  async function update(id: string, fields: Fields) {
    // Optimistic — revert on failure.
    const prev = tickets
    setSaveError(null)
    setTickets((ts) =>
      ts.map((t) =>
        t.id === id
          ? {
              ...t,
              ...fields,
              ...('status' in fields
                ? { released_at: fields.status === 'released' ? new Date().toISOString() : null }
                : {}),
            }
          : t,
      ),
    )
    try {
      const res = await fetch('/api/bug-reports', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, ...fields }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setTickets(prev)
        setSaveError(body.error || 'Could not save that change.')
      }
    } catch {
      setTickets(prev)
      setSaveError('Could not reach the server.')
    }
  }

  async function remove(t: Ticket) {
    const ok = await confirm({
      title: `Delete ${ticketId(t.number)}?`,
      message: 'This removes the ticket for good, including any screenshot.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    const prev = tickets
    setTickets((ts) => ts.filter((x) => x.id !== t.id))
    try {
      const res = await fetch('/api/bug-reports', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: t.id }),
      })
      if (!res.ok) {
        setTickets(prev)
        setSaveError('Could not delete that ticket.')
      }
    } catch {
      setTickets(prev)
      setSaveError('Could not reach the server.')
    }
  }

  function added(t: Ticket) {
    setTickets((ts) => [t, ...ts])
    setAdding(null)
  }

  // Add/remove a comment or commit on a ticket, then reload so the embedded
  // lists refresh. Cards keep their open/expanded state (keyed by ticket id).
  async function addThread(resource: 'comment' | 'commit', payload: Record<string, unknown>): Promise<boolean> {
    setSaveError(null)
    try {
      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ resource, ...payload }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setSaveError(body.error || 'Could not save that.')
        return false
      }
      await load()
      return true
    } catch {
      setSaveError('Could not reach the server.')
      return false
    }
  }

  async function delThread(resource: 'comment' | 'commit', id: string): Promise<void> {
    setSaveError(null)
    try {
      const res = await fetch('/api/bug-reports', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ resource, id }),
      })
      if (!res.ok) setSaveError('Could not delete that.')
      else await load()
    } catch {
      setSaveError('Could not reach the server.')
    }
  }

  function newFollowUp(parent: Ticket) {
    setAdding({ followUpOf: parent.number })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const inView = tickets.filter((t) =>
    view === 'all' ? true : view === 'released' ? t.status === 'released' : t.status !== 'released',
  )
  const shown = inView
    .filter((t) => (category === 'all' ? true : category === 'untriaged' ? !t.category : t.category === category))
    .filter((t) => (source === 'all' ? true : t.source === source))
    .sort((a, b) =>
      view === 'released'
        ? (b.released_at ?? '').localeCompare(a.released_at ?? '')
        : priorityRank(a.priority) - priorityRank(b.priority) || (b.number ?? 0) - (a.number ?? 0),
    )
  const byNumber = new Map(tickets.filter((t) => t.number != null).map((t) => [t.number!, t]))

  function focusTicket(n: number) {
    if (!byNumber.has(n)) {
      setSaveError(`${ticketId(n)} isn't in the queue (it may have been deleted).`)
      return
    }
    // Widen the filters if they hide it.
    if (!shown.some((t) => t.number === n)) {
      setView('all')
      setCategory('all')
      setSource('all')
    }
    setFocus({ n, k: Date.now() })
  }

  const openCount = tickets.filter((t) => t.status !== 'released').length
  const countIn = (c: string) =>
    inView.filter((t) => (c === 'untriaged' ? !t.category : t.category === c)).length

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Tickets</h1>
          <div className="subtitle">Site reports and your own changes, in one queue.</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          {user && !error && (
            <button className="btn primary" onClick={() => setAdding({ followUpOf: null })}>
              <Icon name="plus" /> New ticket
            </button>
          )}
        </div>
      </div>

      {!user && <p className="faint">Sign in as the maintainer to view tickets.</p>}

      {user && error && <p className="bug-error">{error}</p>}

      {user && !error && (
        <>
          {adding && (
            <NewTicketForm
              key={adding.followUpOf ?? 'new'}
              token={token}
              followUpOf={adding.followUpOf != null ? byNumber.get(adding.followUpOf) ?? null : null}
              onClearFollowUp={() => setAdding({ followUpOf: null })}
              onAdded={added}
              onCancel={() => setAdding(null)}
            />
          )}

          <div className="ticket-filters">
            <div className="seg-filter">
              <button className={view === 'open' ? 'active' : ''} onClick={() => setView('open')}>
                Open ({openCount})
              </button>
              <button className={view === 'released' ? 'active' : ''} onClick={() => setView('released')}>
                Released ({tickets.length - openCount})
              </button>
              <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
                All ({tickets.length})
              </button>
            </div>
            <div className="seg-filter">
              <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>
                Any type
              </button>
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  className={category === c.key ? 'active' : ''}
                  onClick={() => setCategory(c.key)}
                >
                  {c.label} ({countIn(c.key)})
                </button>
              ))}
              <button className={category === 'untriaged' ? 'active' : ''} onClick={() => setCategory('untriaged')}>
                Untriaged ({countIn('untriaged')})
              </button>
            </div>
            <select
              className="select"
              style={{ width: 'auto' }}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              aria-label="Source"
            >
              <option value="all">From anyone</option>
              <option value="site">Site reports</option>
              <option value="owner">Yours</option>
            </select>
          </div>

          {saveError && <p className="bug-error" style={{ marginBottom: 12 }}>{saveError}</p>}

          {!loading && shown.length === 0 && (
            <p className="faint">{tickets.length === 0 ? 'No tickets yet.' : 'None in this view.'}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shown.map((t) => (
              <TicketCard
                key={t.id}
                ticket={t}
                parent={t.follow_up_of != null ? byNumber.get(t.follow_up_of) : undefined}
                followUps={tickets
                  .filter((x) => x.follow_up_of != null && x.follow_up_of === t.number)
                  .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))}
                focusKey={focus && focus.n === t.number ? focus.k : null}
                hasTicket={(n) => byNumber.has(n)}
                onUpdate={update}
                onDelete={remove}
                onZoom={setLightbox}
                onGoTo={focusTicket}
                onFollowUp={newFollowUp}
                onAddThread={addThread}
                onDelThread={delThread}
              />
            ))}
          </div>
        </>
      )}

      {lightbox && (
        <div className="bug-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="Screenshot">
          <img src={lightbox} alt="Report screenshot" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

function NewTicketForm({
  token,
  followUpOf,
  onClearFollowUp,
  onAdded,
  onCancel,
}: {
  token: string | null
  followUpOf: Ticket | null
  onClearFollowUp: () => void
  onAdded: (t: Ticket) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  // A follow-up starts with its parent's category and priority.
  const [category, setCategory] = useState(followUpOf?.category ?? 'enhancement')
  const [priority, setPriority] = useState(followUpOf?.priority ?? 'medium')
  const [isPublic, setIsPublic] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!title.trim()) {
      setError('Give the ticket a title.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/bug-reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title,
          description,
          category,
          priority,
          is_public: isPublic,
          ...(followUpOf?.number != null ? { follow_up_of: followUpOf.number } : {}),
        }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; report?: Ticket }
      if (!res.ok || !body.report) setError(body.error || 'Could not add the ticket.')
      else onAdded(body.report)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card ticket-new">
      {followUpOf && (
        <div className="ticket-parent-chip">
          <Icon name="link" /> Follow-up of
          <span className="ticket-link" style={{ cursor: 'default' }}>
            <span className="ticket-num">{ticketId(followUpOf.number)}</span>
            <span className="ticket-link-title">{displayTitle(followUpOf)}</span>
          </span>
          <button className="btn ghost small" onClick={onClearFollowUp} aria-label="Don't link">
            <Icon name="x" />
          </button>
        </div>
      )}
      <div className="field">
        <label htmlFor="tk-title">Title</label>
        <input
          id="tk-title"
          className="input"
          autoFocus
          placeholder="Add initiative rolls to the combat tracker"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
      <div className="field">
        <label htmlFor="tk-desc">Details (optional, never shown publicly)</label>
        <DetailsEditor
          id="tk-desc"
          placeholder="What should change, and how you'll know it's done."
          value={description}
          onChange={setDescription}
        />
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="select" style={{ width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        <select className="select" style={{ width: 'auto' }} value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          {PRIORITIES.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
        <label className="row" style={{ gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          Show on roadmap
        </label>
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn primary" onClick={submit} disabled={busy}>
          {busy ? 'Adding…' : 'Add ticket'}
        </button>
      </div>
      {error && <p className="bug-error">{error}</p>}
    </div>
  )
}

function TicketCard({
  ticket,
  parent,
  followUps,
  focusKey,
  hasTicket,
  onUpdate,
  onDelete,
  onZoom,
  onGoTo,
  onFollowUp,
  onAddThread,
  onDelThread,
}: {
  ticket: Ticket
  parent: Ticket | undefined
  followUps: Ticket[]
  focusKey: number | null
  hasTicket: (n: number) => boolean
  onUpdate: (id: string, fields: Fields) => void
  onDelete: (t: Ticket) => void
  onZoom: (dataUrl: string) => void
  onGoTo: (n: number) => void
  onFollowUp: (t: Ticket) => void
  onAddThread: (resource: 'comment' | 'commit', payload: Record<string, unknown>) => Promise<boolean>
  onDelThread: (resource: 'comment' | 'commit', id: string) => void
}) {
  const t = ticket
  const cardRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [techOpen, setTechOpen] = useState(false)
  const [title, setTitle] = useState(t.title ?? '')
  const [note, setNote] = useState(t.resolution_note ?? '')
  const [editingDetails, setEditingDetails] = useState(false)
  const [draft, setDraft] = useState(t.description ?? '')
  const [newItem, setNewItem] = useState('')
  const [linkInput, setLinkInput] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commitsOpen, setCommitsOpen] = useState(false)
  const [commitSha, setCommitSha] = useState('')
  const [commitSubject, setCommitSubject] = useState('')
  const [commitBusy, setCommitBusy] = useState(false)
  useEffect(() => setTitle(t.title ?? ''), [t.title])
  useEffect(() => setNote(t.resolution_note ?? ''), [t.resolution_note])

  const comments = t.ticket_comments ?? []
  const commits = t.ticket_commits ?? []

  async function addComment() {
    const body = commentText.trim()
    if (!body || t.number == null) return
    setCommentBusy(true)
    const ok = await onAddThread('comment', { ticket_number: t.number, body })
    setCommentBusy(false)
    if (ok) setCommentText('')
  }

  async function addCommit() {
    const sha = commitSha.trim()
    if (!sha || t.number == null) return
    setCommitBusy(true)
    const ok = await onAddThread('commit', {
      ticket_number: t.number,
      sha,
      ...(commitSubject.trim() ? { subject: commitSubject.trim() } : {}),
    })
    setCommitBusy(false)
    if (ok) {
      setCommitSha('')
      setCommitSubject('')
      setCommitsOpen(true)
    }
  }

  // Clicked through from another ticket's link: open, scroll to, and flash.
  useEffect(() => {
    if (focusKey == null) return
    setOpen(true)
    setFocused(true)
    // Wait a frame so a filter change has rendered this card in place.
    requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    const timer = setTimeout(() => setFocused(false), 1800)
    return () => clearTimeout(timer)
  }, [focusKey])

  const stages = stagesFor(t.source)
  const released = t.status === 'released'
  const progress = checklistProgress(t.description)

  function togglePublic(next: boolean) {
    if (next && !t.title) {
      setOpen(true)
      setHint('Add a public title first. The reporter’s own words are never shown on the roadmap.')
      return
    }
    setHint(null)
    onUpdate(t.id, { is_public: next })
  }

  function saveTitle() {
    const v = title.trim()
    if (v === (t.title ?? '')) return
    if (!v && !t.description) {
      setTitle(t.title ?? '')
      setHint('A ticket needs a title or some details.')
      return
    }
    // Clearing the title takes the ticket off the roadmap (it can't show untitled).
    onUpdate(t.id, v ? { title: v } : { title: null, is_public: false })
    if (v) setHint(null)
  }

  function startEditing() {
    setDraft(t.description ?? '')
    setEditingDetails(true)
  }

  function saveDetails() {
    const v = draft.replace(/\s+$/, '')
    if (!v && !t.title) {
      setHint('A ticket needs a title or some details.')
      return
    }
    setHint(null)
    if (v !== (t.description ?? '')) onUpdate(t.id, { description: v || null })
    setEditingDetails(false)
  }

  function addItem() {
    const v = newItem.trim()
    if (!v) return
    onUpdate(t.id, { description: appendCheck(t.description, v) })
    setNewItem('')
  }

  function link() {
    const n = parseTicketRef(linkInput)
    if (n == null) {
      setLinkError('Enter a ticket number, like T-5.')
      return
    }
    if (n === t.number) {
      setLinkError('A ticket can’t follow up itself.')
      return
    }
    if (!hasTicket(n)) {
      setLinkError(`There’s no ${ticketId(n)}.`)
      return
    }
    setLinkError(null)
    onUpdate(t.id, { follow_up_of: n })
    setLinkInput('')
  }

  const detailsLabel = t.source === 'site' ? 'What they reported' : 'Details'

  return (
    <div
      ref={cardRef}
      className={`card ticket-card${released ? ' released' : ''}${focused ? ' focused' : ''}`}
      style={{ cursor: 'default' }}
    >
      <div className="ticket-head">
        <button className="ticket-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="ticket-num">{ticketId(t.number)}</span>
          <span className="ticket-title">
            {displayTitle(t)}
            {t.source === 'site' && (
              <span className="ticket-src" title="Came in through the site">
                <Icon name="inbox" />
              </span>
            )}
          </span>
        </button>
        <div className="ticket-controls">
          <select
            className={`select ticket-cat cat-${t.category ?? 'none'}`}
            value={t.category ?? ''}
            onChange={(e) => onUpdate(t.id, { category: e.target.value || null })}
            aria-label="Category"
          >
            {!t.category && <option value="">Untriaged</option>}
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <select
            className={`select ticket-pri pri-${t.priority ?? 'none'}`}
            value={t.priority ?? ''}
            onChange={(e) => onUpdate(t.id, { priority: e.target.value || null })}
            aria-label="Priority"
          >
            <option value="">No priority</option>
            {PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
          <select
            className="select"
            value={t.status}
            onChange={(e) => onUpdate(t.id, { status: e.target.value })}
            aria-label="Stage"
          >
            {stages.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
          <label className="ticket-public" title="Show on the public roadmap">
            <input type="checkbox" checked={t.is_public} onChange={(e) => togglePublic(e.target.checked)} />
            Public
          </label>
        </div>
      </div>

      <StageBar source={t.source} status={t.status} showLabels={false} />

      <div className="ticket-sub">
        <span>{categoryLabel(t.category)}</span>
        <span>{t.source === 'site' ? 'Site report' : 'Yours'}</span>
        <span>{fmtDate(t.created_at)}</span>
        {progress.total > 0 && (
          <span title="Checklist items done">
            ☑ {progress.done}/{progress.total}
          </span>
        )}
        {t.follow_up_of != null && (
          <button className="ticket-sub-link" onClick={() => onGoTo(t.follow_up_of!)}>
            Follow-up of {ticketId(t.follow_up_of)}
          </button>
        )}
        {followUps.length > 0 && (
          <span>
            {followUps.length === 1 ? '1 follow-up' : `${followUps.length} follow-ups`}
          </span>
        )}
        {t.claimed_by && !released && <span>Worked on by {t.claimed_by}</span>}
        {released && t.released_at && <span>Released {new Date(t.released_at).toLocaleDateString()}</span>}
      </div>
      {t.resolution_note && !open && <p className="ticket-note">{t.resolution_note}</p>}
      {hint && <p className="bug-error">{hint}</p>}

      {open && (
        <div className="ticket-body">
          <div className="field">
            <label htmlFor={`tt-${t.id}`}>Public title</label>
            <input
              id={`tt-${t.id}`}
              className="input"
              placeholder={t.source === 'site' ? 'How this should read on the roadmap' : 'Title'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </div>

          <div className="field">
            <div className="ticket-field-head">
              <label htmlFor={`td-${t.id}`}>{detailsLabel}</label>
              {!editingDetails && (
                <button className="btn ghost small" onClick={startEditing}>
                  <Icon name="pencil" /> {t.description ? 'Edit' : 'Add details'}
                </button>
              )}
            </div>
            {editingDetails ? (
              <>
                <DetailsEditor
                  id={`td-${t.id}`}
                  autoFocus
                  placeholder="What should change, and how you'll know it's done."
                  value={draft}
                  onChange={setDraft}
                  onSubmit={saveDetails}
                  onCancel={() => setEditingDetails(false)}
                />
                <div className="ticket-editor-bar">
                  <span style={{ flex: 1 }} />
                  <button className="btn ghost small" onClick={() => setEditingDetails(false)}>Cancel</button>
                  <button className="btn primary small" onClick={saveDetails}>Save</button>
                </div>
              </>
            ) : (
              <>
                {t.description && (
                  <DetailsView
                    text={t.description}
                    onToggle={(line) => onUpdate(t.id, { description: toggleCheck(t.description ?? '', line) })}
                  />
                )}
                <input
                  className="input ticket-add-item"
                  placeholder="+ Add a checklist item"
                  aria-label="Add a checklist item"
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addItem()}
                  onBlur={addItem}
                />
              </>
            )}
          </div>

          {t.screenshot && (
            <img
              src={t.screenshot}
              alt="Reporter screenshot"
              className="bug-report-shot"
              onClick={() => onZoom(t.screenshot!)}
            />
          )}

          {t.source === 'site' && (
            <div className="bug-report-meta">
              {t.reporter_email && <span><b>From:</b> {t.reporter_email}</span>}
              {t.route && <span><b>Route:</b> {t.route}</span>}
              {t.app_version && <span><b>Version:</b> {t.app_version}</span>}
            </div>
          )}

          <div className="ticket-links">
            <span className="label">Follow-up of</span>
            {t.follow_up_of != null ? (
              <>
                <TicketLink n={t.follow_up_of} ticket={parent} onGoTo={onGoTo} />
                <button
                  className="btn ghost small"
                  onClick={() => onUpdate(t.id, { follow_up_of: null })}
                  aria-label="Remove link"
                  title="Remove link"
                >
                  <Icon name="x" />
                </button>
              </>
            ) : (
              <>
                <input
                  className="input ticket-link-input"
                  placeholder="T-…"
                  aria-label="Ticket this follows up"
                  value={linkInput}
                  onChange={(e) => {
                    setLinkInput(e.target.value)
                    setLinkError(null)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && link()}
                />
                <button className="btn ghost small" onClick={link} disabled={!linkInput.trim()}>
                  <Icon name="link" /> Link
                </button>
                {linkError && <span className="bug-error" style={{ margin: 0 }}>{linkError}</span>}
              </>
            )}
          </div>
          <div className="ticket-links">
            <span className="label">Follow-ups</span>
            {followUps.length === 0 && <span className="faint">None</span>}
            {followUps.map((f) => (
              <TicketLink key={f.id} n={f.number!} ticket={f} onGoTo={onGoTo} />
            ))}
            {t.number != null && (
              <button className="btn ghost small" onClick={() => onFollowUp(t)}>
                <Icon name="plus" /> New follow-up
              </button>
            )}
          </div>

          {/* Comment thread — collapsible, most recent shown collapsed. */}
          <div className="field ticket-comments-field" style={{ marginTop: 12 }}>
            <div className="ticket-field-head">
              <label>Comments {comments.length > 0 && <span className="faint">· {comments.length}</span>}</label>
              {comments.length > 1 && (
                <button className="btn ghost small" onClick={() => setCommentsOpen((o) => !o)}>
                  {commentsOpen ? 'Collapse' : `Show all ${comments.length}`}
                </button>
              )}
            </div>
            {comments.length > 0 && (
              <ul className="comment-list">
                {(commentsOpen ? comments : comments.slice(-1)).map((c) => (
                  <li key={c.id} className="comment-row">
                    <div className="comment-meta">
                      <span className="comment-author">{c.author}</span>
                      <span className="faint">{fmtDate(c.created_at)}</span>
                      <span style={{ flex: 1 }} />
                      <button className="tk-del" title="Delete comment" aria-label="Delete comment" onClick={() => onDelThread('comment', c.id)}>
                        <Icon name="x" />
                      </button>
                    </div>
                    <ClampText text={c.body} />
                  </li>
                ))}
                {!commentsOpen && comments.length > 1 && (
                  <li className="faint" style={{ fontSize: 12, paddingLeft: 2 }}>
                    + {comments.length - 1} earlier — “Show all”.
                  </li>
                )}
              </ul>
            )}
            <textarea
              className="textarea"
              rows={2}
              placeholder="Add a comment — a thought, or a correction to bring up next session."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
              <button className="btn ghost small" onClick={addComment} disabled={commentBusy || !commentText.trim()}>
                {commentBusy ? 'Adding…' : 'Add comment'}
              </button>
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor={`tn-${t.id}`}>Resolution note <span className="faint">· one-line summary</span></label>
            <textarea
              id={`tn-${t.id}`}
              className="textarea"
              rows={2}
              placeholder="What was done, and where (commit or PR)."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note.trim() !== (t.resolution_note ?? '') && onUpdate(t.id, { resolution_note: note.trim() || null })}
            />
          </div>

          {/* Recorded commits — a collapsible list, most recent shown collapsed. */}
          <div className="field ticket-commits">
            <div className="ticket-field-head">
              <label>Commits {commits.length > 0 && <span className="faint">· {commits.length}</span>}</label>
              {commits.length > 1 && (
                <button className="btn ghost small" onClick={() => setCommitsOpen((o) => !o)}>
                  {commitsOpen ? 'Collapse' : `Show all ${commits.length}`}
                </button>
              )}
            </div>
            {commits.length === 0 ? (
              <p className="faint" style={{ margin: '2px 0 0', fontSize: 12 }}>No commits recorded.</p>
            ) : (
              <ul className="commit-list">
                {(commitsOpen ? commits : commits.slice(-1)).map((c) => (
                  <li key={c.id} className="commit-row">
                    <a href={commitUrl(c.sha)} target="_blank" rel="noreferrer" className="ticket-commit-link" title={`Commit ${c.sha} on GitHub`}>
                      {shortSha(c.sha)}
                    </a>
                    <span className="commit-subject">{c.subject || <span className="faint">(no subject)</span>}</span>
                    <button className="tk-del" title="Remove commit" aria-label="Remove commit" onClick={() => onDelThread('commit', c.id)}>
                      <Icon name="x" />
                    </button>
                  </li>
                ))}
                {!commitsOpen && commits.length > 1 && (
                  <li className="faint" style={{ fontSize: 12, paddingLeft: 2 }}>
                    + {commits.length - 1} earlier — “Show all”.
                  </li>
                )}
              </ul>
            )}
            <div className="commit-add">
              <input
                className="input commit-sha"
                placeholder="commit SHA"
                aria-label="Commit SHA"
                value={commitSha}
                onChange={(e) => setCommitSha(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCommit()}
              />
              <input
                className="input"
                placeholder="subject (optional)"
                aria-label="Commit subject"
                value={commitSubject}
                onChange={(e) => setCommitSubject(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCommit()}
              />
              <button className="btn ghost small" onClick={addCommit} disabled={commitBusy || !commitSha.trim()}>
                Add
              </button>
            </div>
          </div>

          <div className="row between" style={{ marginTop: 8 }}>
            {t.source === 'site' ? (
              <button className="btn ghost small" onClick={() => setTechOpen((o) => !o)}>
                {techOpen ? 'Hide' : 'Show'} technical details
              </button>
            ) : (
              <span />
            )}
            <button className="btn ghost small danger" onClick={() => onDelete(t)}>
              <Icon name="trash" /> Delete
            </button>
          </div>
          {techOpen && (
            <div className="bug-details" style={{ marginTop: 8 }}>
              <div><span className="bug-details-key">User agent</span> {t.user_agent || '—'}</div>
              <div><span className="bug-details-key">Account</span> {t.user_id || '(signed out)'}</div>
              {t.context && (
                <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {JSON.stringify(t.context, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** A comment body: long text clamps with a "Show more" toggle; commit SHAs in it
 *  link to the GitHub commit page. */
function ClampText({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 320
  const shown = open || !long ? text : `${text.slice(0, 320).replace(/\s+\S*$/, '')}…`
  return (
    <div className="comment-body">
      <Linkified text={shown} />
      {long && (
        <button className="comment-more" onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

/** A clickable chip for a linked ticket: number, title, and stage. */
function TicketLink({ n, ticket, onGoTo }: { n: number; ticket: Ticket | undefined; onGoTo: (n: number) => void }) {
  return (
    <button
      className={`ticket-link${ticket?.status === 'released' ? ' released' : ''}`}
      onClick={() => onGoTo(n)}
      title={ticket ? `${displayTitle(ticket)} (${stageLabel(ticket.status)})` : undefined}
    >
      <span className="ticket-num">{ticketId(n)}</span>
      <span className="ticket-link-title">{ticket ? displayTitle(ticket) : '(not found)'}</span>
      {ticket && <span className="faint">· {stageLabel(ticket.status)}</span>}
    </button>
  )
}

/**
 * Row editor for ticket details. Each stored line is one editable row that keeps
 * the shape it has when rendered: a checklist item still shows its checkbox, a
 * bullet its dot. Clicking the empty box beside a plain line turns that line INTO
 * a checklist item in place, and the ¶ button on a check item demotes it back to
 * plain text — so existing text becomes a checklist without retyping it. The
 * stored "- [ ]" syntax is unchanged (scripts/tickets.mjs still parses it);
 * toEditLines / serializeLines round-trip it. Cmd/Ctrl+Enter saves, Esc cancels.
 */
function DetailsEditor({
  id,
  value,
  onChange,
  placeholder,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  id?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
  onSubmit?: () => void
  onCancel?: () => void
}) {
  const parsed = toEditLines(value)
  // Empty details still needs a row to type into.
  const rows: EditLine[] = parsed.length ? parsed : [{ kind: 'text', text: '' }]
  // Which row to focus after the next change (-1 once consumed). Starts at the
  // last row when opened with autoFocus, so editing lands at the end.
  const focusRow = useRef<number>(autoFocus ? rows.length - 1 : -1)

  function commit(next: EditLine[], focus?: number) {
    if (focus != null) focusRow.current = focus
    onChange(serializeLines(next.length ? next : [{ kind: 'text', text: '' }]))
  }

  function setText(i: number, text: string) {
    // A pasted (or Shift+Enter) multi-line value splits into rows so the model
    // stays one line per row.
    const parts = text.split('\n')
    if (parts.length === 1) {
      commit(rows.map((r, j) => (j === i ? { ...r, text } : r)))
      return
    }
    const made: EditLine[] = parts.map((p, k) => (k === 0 ? { ...rows[i], text: p } : { kind: 'text', text: p }))
    commit([...rows.slice(0, i), ...made, ...rows.slice(i + 1)], i + made.length - 1)
  }

  function toggleDone(i: number) {
    commit(rows.map((r, j) => (j === i && r.kind === 'check' ? { ...r, done: !r.done } : r)))
  }

  // The box beside a line: a plain/bullet line becomes a checklist item; a check
  // item becomes plain text. Text and indent carry over, so nothing is retyped.
  function toggleKind(i: number) {
    const r = rows[i]
    const next: EditLine =
      r.kind === 'check'
        ? { kind: 'text', text: r.text }
        : { kind: 'check', indent: r.kind === 'bullet' ? r.indent : 0, done: false, text: r.text }
    commit(rows.map((x, j) => (j === i ? next : x)), i)
  }

  function addRow(kind: 'check' | 'text', at = rows.length) {
    const made: EditLine =
      kind === 'check' ? { kind: 'check', indent: 0, done: false, text: '' } : { kind: 'text', text: '' }
    commit([...rows.slice(0, at), made, ...rows.slice(at)], at)
  }

  function removeRow(i: number) {
    commit(rows.filter((_, j) => j !== i), Math.max(0, i - 1))
  }

  function indentRow(i: number, delta: number) {
    const r = rows[i]
    if (r.kind === 'text') return
    commit(rows.map((x, j) => (j === i ? { ...r, indent: Math.max(0, Math.min(8, r.indent + delta)) } : x)))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, i: number) {
    const r = rows[i]
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault()
      onCancel()
      return
    }
    if (e.key === 'Enter') {
      if ((e.metaKey || e.ctrlKey) && onSubmit) {
        e.preventDefault()
        onSubmit()
        return
      }
      if (e.shiftKey) return // soft newline → setText splits it into rows
      e.preventDefault()
      // Enter on an empty list item ends the list (becomes a plain row).
      if (r.kind !== 'text' && !r.text.trim()) {
        commit([...rows.slice(0, i), { kind: 'text', text: '' }, ...rows.slice(i + 1)], i)
        return
      }
      addRow(r.kind === 'check' ? 'check' : 'text', i + 1)
      return
    }
    if (e.key === 'Backspace' && !r.text && rows.length > 1 && e.currentTarget.selectionStart === 0) {
      e.preventDefault()
      removeRow(i)
      return
    }
    if (e.key === 'Tab' && r.kind !== 'text') {
      e.preventDefault()
      indentRow(i, e.shiftKey ? -1 : 1)
    }
  }

  return (
    <div className="ticket-editor">
      <div className="ticket-rows">
        {rows.map((r, i) => {
          const focusMe = focusRow.current === i
          if (focusMe) focusRow.current = -1
          return (
            <div
              key={i}
              className={`tk-row tk-${r.kind}${r.kind === 'check' && r.done ? ' done' : ''}`}
              style={{ marginLeft: (r.kind === 'text' ? 0 : r.indent) * 10 }}
            >
              {r.kind === 'check' ? (
                <input
                  type="checkbox"
                  className="tk-box"
                  checked={r.done}
                  onChange={() => toggleDone(i)}
                  aria-label={r.done ? 'Mark not done' : 'Mark done'}
                />
              ) : (
                <button
                  type="button"
                  className="tk-box tk-box-empty"
                  onClick={() => toggleKind(i)}
                  title="Make this a checklist item"
                  aria-label="Make this a checklist item"
                />
              )}
              <AutoRow
                id={i === 0 ? id : undefined}
                value={r.text}
                placeholder={i === 0 && rows.length === 1 ? placeholder : undefined}
                autoFocus={focusMe}
                onChange={(v) => setText(i, v)}
                onKeyDown={(e) => onKeyDown(e, i)}
              />
              {r.kind === 'check' && (
                <button
                  type="button"
                  className="tk-kind"
                  onClick={() => toggleKind(i)}
                  title="Make this plain text"
                  aria-label="Make this plain text"
                >
                  <Icon name="text" />
                </button>
              )}
              <button
                type="button"
                className="tk-del"
                onClick={() => removeRow(i)}
                title="Remove line"
                aria-label="Remove line"
              >
                <Icon name="x" />
              </button>
            </div>
          )
        })}
      </div>
      <div className="ticket-editor-bar">
        <button type="button" className="btn ghost small" onClick={() => addRow('check')}>
          <Icon name="check" /> Checklist item
        </button>
        <button type="button" className="btn ghost small" onClick={() => addRow('text')}>
          <Icon name="plus" /> Text line
        </button>
        <span className="ticket-hint">
          Click the box beside a line to make it a checklist item. Enter adds a line; Tab indents.
        </span>
      </div>
    </div>
  )
}

/** A one-line-per-row input that grows to fit its text (wrapping long lines). */
function AutoRow({
  id,
  value,
  placeholder,
  autoFocus,
  onChange,
  onKeyDown,
}: {
  id?: string
  value: string
  placeholder?: string
  autoFocus?: boolean
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  useEffect(() => {
    const el = ref.current
    if (autoFocus && el) {
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [autoFocus])

  return (
    <textarea
      id={id}
      ref={ref}
      className="tk-input"
      rows={1}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  )
}
