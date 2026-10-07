import { Icon } from './Icon'
import { addMonths, monthGrid, monthLabel, WEEKDAY_MIN } from '../lib/calendar'

// A small month-grid calendar, built from scratch (no date lib). Highlights the
// session date and (optionally) today. Read-only by default; pass `onPick` to
// make the days selectable — the DM picks the next-session date that way.

export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  today,
  onPick,
  backups,
  proposed,
}: {
  /** The month to display (any day in it; day-1 is conventional). */
  month: Date
  onMonthChange: (d: Date) => void
  /** The highlighted date (ISO `yyyy-mm-dd`), or null. */
  selected: string | null
  /** Today (ISO), ringed for orientation. */
  today: string
  /** When given, days become buttons that call this with the ISO clicked. */
  onPick?: (iso: string) => void
  /** Candidate "backup" days to mark (outlined), ISO strings. */
  backups?: Set<string>
  /** Player-suggested days awaiting the DM (dashed), ISO strings. */
  proposed?: Set<string>
}) {
  const days = monthGrid(month)
  return (
    <div className="monthcal">
      <div className="monthcal-head">
        <button
          type="button"
          className="btn ghost small"
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label="Previous month"
        >
          <Icon name="chevron-left" size={16} />
        </button>
        <span className="monthcal-title">{monthLabel(month)}</span>
        <button
          type="button"
          className="btn ghost small"
          onClick={() => onMonthChange(addMonths(month, 1))}
          aria-label="Next month"
        >
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
      <div className="monthcal-grid">
        {WEEKDAY_MIN.map((w) => (
          <span key={w} className="monthcal-dow">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const isSel = d.iso === selected
          const isToday = d.iso === today
          const isBackup = !isSel && !!backups?.has(d.iso)
          const isProposed = !isSel && !isBackup && !!proposed?.has(d.iso)
          const cls =
            `monthcal-day${d.inMonth ? '' : ' out'}${isSel ? ' sel' : ''}` +
            `${isBackup ? ' backup' : ''}${isProposed ? ' proposed' : ''}${isToday ? ' today' : ''}`
          return onPick ? (
            <button
              key={d.iso}
              type="button"
              className={cls}
              onClick={() => onPick(d.iso)}
              aria-pressed={isSel}
            >
              {d.day}
            </button>
          ) : (
            <span key={d.iso} className={cls} aria-current={isSel ? 'date' : undefined}>
              {d.day}
            </span>
          )
        })}
      </div>
    </div>
  )
}
