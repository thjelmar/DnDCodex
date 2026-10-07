import { Icon, type IconName } from './Icon'
import type { SessionStatus } from '../lib/sessionStatus'

// Renders a session-status indicator. `live` is an actionable button (join the
// running session); every other state is a status pill, colour-coded by how
// imminent it is. Shared by the DM's scheduler preview and the player header.

const ICON: Record<SessionStatus['kind'], IconName> = {
  live: 'play',
  rescheduled: 'calendar-x',
  gameday: 'clock',
  thisweek: 'calendar',
  upcoming: 'calendar',
  none: 'moon',
}

export function SessionStatusBadge({
  status,
  onJoin,
  onClick,
}: {
  status: SessionStatus
  /** Called when the player clicks "Join session" (live state only). */
  onJoin?: () => void
  /** When set (non-live states), the whole badge becomes a button — e.g. the
   *  player's session box that opens the planner. */
  onClick?: () => void
}) {
  if (status.kind === 'live') {
    return (
      <button type="button" className="sess-badge live" onClick={onJoin}>
        <span className="sess-live-dot" />
        {status.label}
      </button>
    )
  }
  if (onClick) {
    return (
      <button type="button" className={`sess-badge ${status.kind} sess-badge-btn`} onClick={onClick}>
        <Icon name={ICON[status.kind]} size={14} color="inherit" />
        {status.label}
      </button>
    )
  }
  return (
    <span className={`sess-badge ${status.kind}`}>
      <Icon name={ICON[status.kind]} size={14} color="inherit" />
      {status.label}
    </span>
  )
}
