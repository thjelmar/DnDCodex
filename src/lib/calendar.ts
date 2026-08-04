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
