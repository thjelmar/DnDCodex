import { useEffect } from 'react'
import { CHANGELOG, type ChangeKind } from '../data/changelog'
import { markChangelogSeen } from '../lib/useChangelog'
import { formatDate } from '../lib/format'

const KIND_LABEL: Record<ChangeKind, string> = {
  new: 'New',
  improved: 'Improved',
  fixed: 'Fixed',
}

export function ChangelogPage() {
  // Opening the page clears the "new" dot in the sidebar for this browser.
  useEffect(() => {
    markChangelogSeen()
  }, [])

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="mb-0">What’s New</h1>
          <div className="subtitle">Recent additions and fixes to D&amp;D Codex.</div>
        </div>
      </div>

      <div className="changelog">
        {CHANGELOG.map((entry) => (
          <article key={entry.date} className="changelog-entry">
            <div className="changelog-meta">
              <time className="changelog-date" dateTime={entry.date}>{formatDate(entry.date)}</time>
            </div>
            <div className="changelog-body">
              <h2 className="changelog-title">{entry.title}</h2>
              <ul className="changelog-list">
                {entry.changes.map((c, i) => (
                  <li key={i} className="changelog-change">
                    <span className={`changelog-tag tag-${c.kind}`}>{KIND_LABEL[c.kind]}</span>
                    <span className="changelog-text">{c.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>

      <div className="faint" style={{ fontSize: 12, marginTop: 24 }}>
        Have an idea or found a bug? Use “Report something” in the sidebar, and see what’s on the way under “Roadmap”.
      </div>
    </div>
  )
}
