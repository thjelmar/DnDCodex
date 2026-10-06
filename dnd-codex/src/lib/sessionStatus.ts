// Derives the player header's session-status indicator from the DM's schedule
// and any live session. Pure and deterministic given `now`, so it's easy to
// reason about and test. The schedule fields are a lightweight stand-in for a
// future calendar add-on; see Campaign.nextSessionDate.

export interface SessionSchedule {
  /** ISO `yyyy-mm-dd`, or null when nothing is planned. */
  nextSessionDate?: string | null
  /** `HH:mm` (24h), optional. */
  nextSessionTime?: string | null
  /** ISO `yyyy-mm-dd` the session was moved off of, or null. */
  rescheduledFrom?: string | null
}

export type SessionStatus =
  /** A session is running now — the only actionable state. */
  | { kind: 'live'; label: string }
  /** Planned for today, moved to a later day. */
  | { kind: 'rescheduled'; label: string; date: string }
  /** Planned for today, not started yet. */
  | { kind: 'gameday'; label: string }
  /** Planned within today's calendar week — show the weekday. */
  | { kind: 'thisweek'; label: string; date: string }
  /** Planned further out — show the date. */
  | { kind: 'upcoming'; label: string; date: string }
  /** Nothing on the schedule. */
  | { kind: 'none'; label: string }

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Local midnight for an ISO `yyyy-mm-dd` (parsed as a local date, not UTC). */
function atLocalMidnight(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Whole days from `a`'s local midnight to `b`'s, positive when `b` is later. */
function daysBetween(a: Date, b: Date): number {
  const am = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()
  const bm = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime()
  return Math.round((bm - am) / DAY_MS)
}

/** Start of the Sunday–Saturday week containing `d` (local). */
function weekStart(d: Date): number {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  m.setDate(m.getDate() - m.getDay())
  return m.getTime()
}

/** "7:00 PM" from "19:00"; empty string when no/!valid time. */
export function formatTime(hhmm?: string | null): string {
  if (!hhmm) return ''
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m ?? 0).padStart(2, '0')} ${period}`
}

/** "Nov 14" (adds the year only when it isn't `now`'s). */
function formatDate(d: Date, now: Date): string {
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`
}

/** Appends " · 7:00 PM" when a time is set. */
function withTime(label: string, time?: string | null): string {
  const t = formatTime(time)
  return t ? `${label} · ${t}` : label
}

/**
 * The indicator state. `live` wins when a session is running; otherwise the
 * schedule decides. A past date (not today) reads as nothing scheduled — stale
 * schedules shouldn't nag.
 */
export function sessionStatus(
  schedule: SessionSchedule,
  isLive: boolean,
  now: Date = new Date(),
): SessionStatus {
  if (isLive) return { kind: 'live', label: 'Join session' }

  const { nextSessionDate, nextSessionTime, rescheduledFrom } = schedule
  if (!nextSessionDate) return { kind: 'none', label: 'No session scheduled' }

  const next = atLocalMidnight(nextSessionDate)
  const delta = daysBetween(now, next) // <0 past, 0 today, >0 future

  // Moved off today onto a later day → flag it on the original day.
  if (rescheduledFrom && daysBetween(now, atLocalMidnight(rescheduledFrom)) === 0 && delta > 0) {
    return {
      kind: 'rescheduled',
      label: withTime(`Rescheduled to ${formatDate(next, now)}`, nextSessionTime),
      date: nextSessionDate,
    }
  }

  if (delta < 0) return { kind: 'none', label: 'No session scheduled' }

  if (delta === 0) {
    return { kind: 'gameday', label: withTime('Game day · no session running', nextSessionTime) }
  }

  // Same Sun–Sat week as today → name the weekday instead of the date.
  if (weekStart(next) === weekStart(now)) {
    return {
      kind: 'thisweek',
      label: withTime(`Session ${WEEKDAYS[next.getDay()]}`, nextSessionTime),
      date: nextSessionDate,
    }
  }

  return {
    kind: 'upcoming',
    label: withTime(`Next session · ${formatDate(next, now)}`, nextSessionTime),
    date: nextSessionDate,
  }
}
