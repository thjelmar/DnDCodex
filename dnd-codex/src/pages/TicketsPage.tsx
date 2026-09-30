import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { useConfirm } from '../components/ConfirmDialog'
import { Icon } from '../components/Icon'
import {
  CATEGORIES,
  PRIORITIES,
  StageBar,
  categoryLabel,
  priorityRank,
  stagesFor,
  ticketId,
} from '../lib/tickets'

// Owner-only ticket queue: site bug reports and your own tickets in one list.
// Reads and writes go through the /api/bug-reports function (the table is
// service-role-only), passing the signed-in user's token so the server can
// confirm they're the maintainer. A Claude session works the same queue with
// `npm run tickets`; ticking "Public" puts a ticket on the /roadmap page.

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
  reporter_email: string | null
  user_id: string | null
  route: string | null
  user_agent: string | null
  app_version: string | null
  screenshot?: string | null
  context?: Record<string, unknown> | null
}

type Fields = Partial<
  Pick<Ticket, 'title' | 'description' | 'category' | 'priority' | 'status' | 'is_public' | 'resolution_note'>
>

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
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
  const [adding, setAdding] = useState(false)
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
    setAdding(false)
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
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" /> New ticket
            </button>
          )}
        </div>
      </div>

      {!user && <p className="faint">Sign in as the maintainer to view tickets.</p>}

      {user && error && <p className="bug-error">{error}</p>}

      {user && !error && (
        <>
          {adding && <NewTicketForm token={token} onAdded={added} onCancel={() => setAdding(false)} />}

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
              <TicketCard key={t.id} ticket={t} onUpdate={update} onDelete={remove} onZoom={setLightbox} />
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
  onAdded,
  onCancel,
}: {
  token: string | null
  onAdded: (t: Ticket) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('enhancement')
  const [priority, setPriority] = useState('medium')
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
        body: JSON.stringify({ title, description, category, priority, is_public: isPublic }),
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
        <textarea
          id="tk-desc"
          className="textarea"
          rows={3}
          placeholder="What should change, and how you'll know it's done."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
  onUpdate,
  onDelete,
  onZoom,
}: {
  ticket: Ticket
  onUpdate: (id: string, fields: Fields) => void
  onDelete: (t: Ticket) => void
  onZoom: (dataUrl: string) => void
}) {
  const t = ticket
  const [open, setOpen] = useState(false)
  const [techOpen, setTechOpen] = useState(false)
  const [title, setTitle] = useState(t.title ?? '')
  const [note, setNote] = useState(t.resolution_note ?? '')
  const [hint, setHint] = useState<string | null>(null)
  useEffect(() => setTitle(t.title ?? ''), [t.title])
  useEffect(() => setNote(t.resolution_note ?? ''), [t.resolution_note])

  const stages = stagesFor(t.source)
  const released = t.status === 'released'

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
    // Clearing the title takes the ticket off the roadmap (it can't show untitled).
    onUpdate(t.id, v ? { title: v } : { title: null, is_public: false })
    if (v) setHint(null)
  }

  return (
    <div className={`card ticket-card${released ? ' released' : ''}`} style={{ cursor: 'default' }}>
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

          {t.description && (
            <div className="field">
              <label>{t.source === 'site' ? 'What they reported' : 'Details'}</label>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{t.description}</p>
            </div>
          )}

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

          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor={`tn-${t.id}`}>Resolution note</label>
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
