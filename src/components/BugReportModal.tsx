import { useMemo, useState } from 'react'
import { Modal } from './Modal'
import { useAuth } from '../auth/AuthProvider'
import { submitBugReport } from '../lib/bugReport'
import { getRecentErrors } from '../lib/errorLog'

/**
 * "Report a bug" dialog. The user describes the problem; we auto-attach the
 * current route, browser, app version, and any recent client errors, then POST
 * it to the /api/bug-report function (stores in Supabase + emails the maintainer).
 */
export function BugReportModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState(user?.email ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const recentErrors = useMemo(() => getRecentErrors(), [])

  async function submit() {
    setBusy(true)
    setError(null)
    const res = await submitBugReport({
      description,
      reporterEmail: email.trim() || null,
      userId: user?.id ?? null,
    })
    setBusy(false)
    if (res.ok) setDone(true)
    else setError(res.error ?? 'Something went wrong.')
  }

  if (done) {
    return (
      <Modal
        title="Thanks for the report"
        onClose={onClose}
        footer={<button className="btn primary" onClick={onClose}>Close</button>}
      >
        <p>Your report was sent. Thank you — it helps make D&amp;D Codex better.</p>
      </Modal>
    )
  }

  return (
    <Modal
      title="Report a bug"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy || !description.trim()}>
            {busy ? 'Sending…' : 'Send report'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="bug-desc">What went wrong?</label>
        <textarea
          id="bug-desc"
          className="textarea"
          rows={5}
          autoFocus
          placeholder="Describe the problem, and what you were doing when it happened."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="bug-email">Your email (optional)</label>
        <input
          id="bug-email"
          className="input"
          type="email"
          placeholder="So we can follow up if needed"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <button className="btn ghost small" onClick={() => setShowDetails((s) => !s)} type="button">
        {showDetails ? 'Hide' : 'Show'} technical details we’ll include
      </button>
      {showDetails && (
        <div className="bug-details">
          <div><span className="bug-details-key">Page</span> {location.hash || '/'}</div>
          <div><span className="bug-details-key">Browser</span> {navigator.userAgent}</div>
          <div><span className="bug-details-key">Recent errors</span> {recentErrors.length || 'none'}</div>
          {recentErrors.length > 0 && (
            <ul className="bug-details-errs">
              {recentErrors.slice(-5).map((e, i) => (
                <li key={i}>{e.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="bug-error">{error}</p>}
    </Modal>
  )
}
