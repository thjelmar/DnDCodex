import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'

// Owner-only triage view of submitted bug reports. Reads them through the
// /api/bug-reports function (the table is service-role-only), passing the signed
// -in user's token so the server can confirm they're the maintainer. Lets the
// owner move a report between new / in progress / resolved.

interface BugReport {
  id: string
  created_at: string
  description: string
  reporter_email: string | null
  user_id: string | null
  route: string | null
  user_agent: string | null
  app_version: string | null
  status: string
  report_type?: string | null
  screenshot?: string | null
  context?: Record<string, unknown> | null
}

const STATUSES: { key: string; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
]

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function BugReportsPage() {
  const { user, session } = useAuth()
  const token = session?.access_token ?? null
  const [reports, setReports] = useState<BugReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')

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
        setReports([])
      } else {
        setReports(((body as { reports?: BugReport[] }).reports ?? []) as BugReport[])
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

  async function setStatus(id: string, status: string) {
    // Optimistic — revert on failure.
    const prev = reports
    setReports((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)))
    try {
      const res = await fetch('/api/bug-reports', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) setReports(prev)
    } catch {
      setReports(prev)
    }
  }

  const shown = filter === 'all' ? reports : reports.filter((r) => r.status === filter)
  const counts = STATUSES.map((s) => ({ ...s, n: reports.filter((r) => r.status === s.key).length }))

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1>Bug reports</h1>
          <div className="subtitle">Issues players and users have sent you.</div>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {!user && <p className="faint">Sign in as the maintainer to view bug reports.</p>}

      {user && error && <p className="bug-error">{error}</p>}

      {user && !error && (
        <>
          <div className="seg-filter" style={{ marginBottom: 16 }}>
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              All ({reports.length})
            </button>
            {counts.map((s) => (
              <button key={s.key} className={filter === s.key ? 'active' : ''} onClick={() => setFilter(s.key)}>
                {s.label} ({s.n})
              </button>
            ))}
          </div>

          {!loading && shown.length === 0 && (
            <p className="faint">{reports.length === 0 ? 'No reports yet.' : 'None in this view.'}</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {shown.map((r) => (
              <BugReportCard key={r.id} report={r} onStatus={setStatus} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function BugReportCard({
  report,
  onStatus,
}: {
  report: BugReport
  onStatus: (id: string, status: string) => void
}) {
  const [open, setOpen] = useState(false)
  const r = report
  return (
    <div className="card" style={{ cursor: 'default' }}>
      <div className="row between" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {r.report_type && <span className="bug-type-chip">{r.report_type}</span>}
            <span className={`bug-status-chip status-${r.status}`}>
              {STATUSES.find((s) => s.key === r.status)?.label ?? r.status}
            </span>
            <span className="faint" style={{ fontSize: 12 }}>{fmtDate(r.created_at)}</span>
          </div>
          <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{r.description}</p>
        </div>
        <select
          className="select"
          style={{ width: 'auto', flex: 'none' }}
          value={r.status}
          onChange={(e) => onStatus(r.id, e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>

      {r.screenshot && (
        <a href={r.screenshot} target="_blank" rel="noopener noreferrer">
          <img
            src={r.screenshot}
            alt="Reporter screenshot"
            style={{ maxWidth: '100%', marginTop: 10, borderRadius: 6, border: '1px solid var(--border)' }}
          />
        </a>
      )}

      <div className="bug-report-meta">
        {r.reporter_email && <span><b>From:</b> {r.reporter_email}</span>}
        {r.route && <span><b>Route:</b> {r.route}</span>}
        {r.app_version && <span><b>Version:</b> {r.app_version}</span>}
      </div>

      <button className="btn ghost small" onClick={() => setOpen((o) => !o)} style={{ marginTop: 8 }}>
        {open ? 'Hide' : 'Show'} technical details
      </button>
      {open && (
        <div className="bug-details" style={{ marginTop: 8 }}>
          <div><span className="bug-details-key">User agent</span> {r.user_agent || '—'}</div>
          <div><span className="bug-details-key">Account</span> {r.user_id || '(signed out)'}</div>
          {r.context && (
            <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(r.context, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
