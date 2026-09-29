import { useMemo, useRef, useState } from 'react'
import { Modal } from './Modal'
import { useAuth } from '../auth/AuthProvider'
import { submitBugReport } from '../lib/bugReport'
import { getRecentErrors } from '../lib/errorLog'
import { processImageFile } from '../lib/image'

const TYPES = [
  { key: 'bug', label: '🐛 Bug' },
  { key: 'idea', label: '💡 Idea' },
  { key: 'question', label: '❓ Question' },
]

/**
 * "Report a bug" dialog. The user describes the problem; we auto-attach the
 * current route, browser, app version, and any recent client errors, then POST
 * it to the /api/bug-report function (stores in Supabase + emails the maintainer).
 */
export function BugReportModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const [type, setType] = useState('bug')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState(user?.email ?? '')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [shotBusy, setShotBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const recentErrors = useMemo(() => getRecentErrors(), [])

  async function pickScreenshot(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setShotBusy(true)
    setError(null)
    try {
      const processed = await processImageFile(file)
      setScreenshot(processed.dataUrl)
    } catch {
      setError('That file couldn’t be read as an image.')
    } finally {
      setShotBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function submit() {
    setBusy(true)
    setError(null)
    const res = await submitBugReport({
      description,
      reporterEmail: email.trim() || null,
      userId: user?.id ?? null,
      type,
      screenshot,
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
        <label htmlFor="bug-type">Type</label>
        <select id="bug-type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="bug-desc">
          {type === 'idea' ? 'Your idea' : type === 'question' ? 'Your question' : 'What went wrong?'}
        </label>
        <textarea
          id="bug-desc"
          className="textarea"
          rows={5}
          autoFocus
          placeholder={
            type === 'idea'
              ? 'Describe the feature or improvement you’d like.'
              : type === 'question'
                ? 'What would you like to know?'
                : 'Describe the problem, and what you were doing when it happened.'
          }
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Screenshot (optional)</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => pickScreenshot(e.target.files)}
        />
        {screenshot ? (
          <div className="bug-shot">
            <img src={screenshot} alt="Attached screenshot" />
            <div className="row" style={{ gap: 6, marginTop: 6 }}>
              <button className="btn ghost small" onClick={() => fileRef.current?.click()} disabled={shotBusy}>
                Replace
              </button>
              <button className="btn ghost small danger" onClick={() => setScreenshot(null)}>Remove</button>
            </div>
          </div>
        ) : (
          <button className="btn small" onClick={() => fileRef.current?.click()} disabled={shotBusy}>
            {shotBusy ? 'Processing…' : 'Attach a screenshot'}
          </button>
        )}
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
