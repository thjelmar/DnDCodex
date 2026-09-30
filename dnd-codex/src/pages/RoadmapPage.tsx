import { useEffect, useState } from 'react'
import { StageBar, categoryLabel, priorityLabel, priorityRank } from '../lib/tickets'

// Public "What we're working on" page — anyone can view it, no sign-in. Shows the
// tickets the owner marked public (via /api/roadmap, which returns only titles,
// categories, priorities, and stages), with a progress bar for each.

interface RoadmapTicket {
  number: number
  title: string
  category: string | null
  priority: string | null
  status: string
  source: string
  created_at: string
  released_at: string | null
}

const RECENT_RELEASES = 10

export function RoadmapPage({ onReport }: { onReport: () => void }) {
  const [tickets, setTickets] = useState<RoadmapTicket[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/roadmap')
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { tickets?: RoadmapTicket[]; error?: string }
        if (cancelled) return
        if (!res.ok) setError(body.error || `Error ${res.status}.`)
        else setTickets(body.tickets ?? [])
      })
      .catch(() => !cancelled && setError('Could not reach the server. (This page only works on the deployed site.)'))
    return () => {
      cancelled = true
    }
  }, [])

  const active = (tickets ?? [])
    .filter((t) => t.status !== 'released')
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.number - a.number)
  const released = (tickets ?? [])
    .filter((t) => t.status === 'released')
    .sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''))
    .slice(0, RECENT_RELEASES)

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="mb-0">What we’re working on</h1>
          <div className="subtitle">Fixes and features on the way to D&amp;D Codex.</div>
        </div>
        <button className="btn" onClick={onReport}>Report something</button>
      </div>

      {error && <p className="bug-error">{error}</p>}
      {!error && tickets === null && <p className="faint">Loading…</p>}
      {tickets && active.length === 0 && released.length === 0 && (
        <p className="faint">Nothing on the roadmap right now. Have an idea? Use “Report something”.</p>
      )}

      {active.length > 0 && (
        <div className="roadmap-list">
          {active.map((t) => (
            <RoadmapCard key={t.number} ticket={t} />
          ))}
        </div>
      )}

      {released.length > 0 && (
        <>
          <h2 className="roadmap-heading">Recently released</h2>
          <div className="roadmap-list">
            {released.map((t) => (
              <RoadmapCard key={t.number} ticket={t} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function RoadmapCard({ ticket: t }: { ticket: RoadmapTicket }) {
  const released = t.status === 'released'
  return (
    <div className={`card roadmap-card${released ? ' released' : ''}`} style={{ cursor: 'default' }}>
      <div className="roadmap-head">
        <span className={`ticket-chip cat-${t.category ?? 'none'}`}>{categoryLabel(t.category)}</span>
        <span className="roadmap-title">{t.title}</span>
        {released ? (
          <span className="roadmap-released">
            ✓ Released{t.released_at ? ` ${new Date(t.released_at).toLocaleDateString()}` : ''}
          </span>
        ) : (
          t.priority && (
            <span className={`roadmap-pri pri-${t.priority}`}>
              <span className="pri-dot" aria-hidden />
              {priorityLabel(t.priority)}
            </span>
          )
        )}
      </div>
      {t.source === 'site' && !released && <div className="roadmap-src">Reported by a user</div>}
      <StageBar source={t.source} status={t.status} showLabels={!released} />
    </div>
  )
}
