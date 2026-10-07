import type { Session, Campaign } from '../db/types'

// Builds an RFC-5545 iCalendar (.ics) file from sessions. Importing this into
// Google Calendar / Apple Calendar / Outlook creates one all-day event per
// session. This is the interoperable, no-API-key path to "sync with an outside
// calendar"; a live two-way Google Calendar integration can come later.

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Formats a YYYY-MM-DD as an iCalendar DATE value (YYYYMMDD). */
function icsDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${y}${m}${d}`
}

/** Next day, for an all-day event's non-inclusive DTEND. */
function nextDay(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function sessionsToICS(
  sessions: Session[],
  campaignsById: Map<string, Campaign>,
  stampISO: string,
): string {
  const stamp = stampISO.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//D&D Codex//EN',
    'CALSCALE:GREGORIAN',
  ]
  for (const s of sessions) {
    const campaign = campaignsById.get(s.campaignId)
    const title = campaign ? `${campaign.name}: ${s.title}` : s.title
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@dnd-codex`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(s.date)}`,
      `DTEND;VALUE=DATE:${nextDay(s.date)}`,
      `SUMMARY:${escapeText(title)}`,
      s.notes ? `DESCRIPTION:${escapeText(s.notes.slice(0, 300))}` : 'DESCRIPTION:',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  // iCalendar requires CRLF line endings.
  return lines.join('\r\n')
}

// ── Month-grid helpers for the from-scratch calendar (no date lib) ──────────
// Dates are handled as LOCAL `yyyy-mm-dd` strings to match the rest of the
// scheduler (see lib/sessionStatus.ts) and avoid UTC off-by-one bugs. Weeks
// start Sunday, the same week convention sessionStatus uses.

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Minimal weekday headers, Sunday first. */
export const WEEKDAY_MIN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/** Local `yyyy-mm-dd` for a Date (not UTC). */
export function localIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "October 2026" for the calendar header. */
export function monthLabel(d: Date): string {
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}

/** The first of a month `n` months away from `d` (keeps day-1 to avoid overflow). */
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

/** The month (day-1) that should be shown first: the one holding `iso`, else now. */
export function monthOf(iso: string | null | undefined): Date {
  if (iso) {
    const [y, m] = iso.split('-').map(Number)
    return new Date(y, (m ?? 1) - 1, 1)
  }
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), 1)
}

export interface GridDay {
  /** Local `yyyy-mm-dd`. */
  iso: string
  /** Day-of-month number to show. */
  day: number
  /** False for the leading/trailing days that belong to the adjacent month. */
  inMonth: boolean
}

/**
 * The 6×7 = 42 cell grid for the month containing `d`, starting on the Sunday on
 * or before the 1st and running six full weeks so the grid height never jumps.
 */
export function monthGrid(d: Date): GridDay[] {
  const year = d.getFullYear()
  const month = d.getMonth()
  const first = new Date(year, month, 1)
  // Back up to the Sunday that starts the first visible week.
  const start = new Date(year, month, 1 - first.getDay())
  const days: GridDay[] = []
  for (let i = 0; i < 42; i++) {
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    days.push({ iso: localIso(cur), day: cur.getDate(), inMonth: cur.getMonth() === month })
  }
  return days
}
