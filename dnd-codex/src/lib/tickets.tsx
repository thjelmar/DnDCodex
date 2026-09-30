// Shared vocabulary for tickets (the bug_reports table): categories, priorities,
// and progress stages, plus the stage bar shown on the Tickets and Roadmap pages.
// The server functions keep their own copies of the allowed values — keep them in
// step with these (functions/api/bug-report.ts, bug-reports.ts).

export type TicketCategory = 'issue' | 'enhancement' | 'feature'
export type TicketPriority = 'urgent' | 'high' | 'medium' | 'low'
export type TicketStatus = 'reported' | 'planned' | 'in_progress' | 'testing' | 'released'
export type TicketSource = 'site' | 'owner'

export const CATEGORIES: { key: TicketCategory; label: string }[] = [
  { key: 'issue', label: 'Issue' },
  { key: 'enhancement', label: 'Enhancement' },
  { key: 'feature', label: 'New feature' },
]

export const PRIORITIES: { key: TicketPriority; label: string }[] = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
]

export const STAGES: { key: TicketStatus; label: string }[] = [
  { key: 'reported', label: 'Reported' },
  { key: 'planned', label: 'Planned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'testing', label: 'Testing' },
  { key: 'released', label: 'Released' },
]

/** Site reports start at Reported; your own tickets start at Planned. */
export function stagesFor(source: string | null | undefined) {
  return source === 'owner' ? STAGES.filter((s) => s.key !== 'reported') : STAGES
}

export function categoryLabel(c: string | null | undefined): string {
  return CATEGORIES.find((x) => x.key === c)?.label ?? 'Untriaged'
}

export function priorityLabel(p: string | null | undefined): string {
  return PRIORITIES.find((x) => x.key === p)?.label ?? 'No priority'
}

/** Sort key: urgent first, unprioritized last. */
export function priorityRank(p: string | null | undefined): number {
  const i = PRIORITIES.findIndex((x) => x.key === p)
  return i === -1 ? PRIORITIES.length : i
}

export function ticketId(n: number | null | undefined): string {
  return n == null ? 'T-?' : `T-${n}`
}

/**
 * Stage progress bar. Owner tickets have no Reported stage, so their Planned
 * segment is drawn double-width to fill the same track.
 */
export function StageBar({
  source,
  status,
  showLabels = true,
}: {
  source: string | null | undefined
  status: string
  showLabels?: boolean
}) {
  const stages = stagesFor(source)
  const current = Math.max(0, stages.findIndex((s) => s.key === status))
  const released = status === 'released'
  const columns = stages.map((_, i) => (source === 'owner' && i === 0 ? '2fr' : '1fr')).join(' ')
  const label = stages[current]?.label ?? status
  return (
    <div
      className={`stage-bar${released ? ' released' : ''}`}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={stages.length}
      aria-valuenow={current + 1}
      aria-valuetext={label}
    >
      <div className="stage-track" style={{ gridTemplateColumns: columns }}>
        {stages.map((s, i) => (
          <span key={s.key} className={i <= current ? 'on' : ''} />
        ))}
      </div>
      {showLabels && (
        <div className="stage-labels" style={{ gridTemplateColumns: columns }}>
          {stages.map((s, i) => (
            <span key={s.key} className={i === current ? 'current' : ''}>
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
