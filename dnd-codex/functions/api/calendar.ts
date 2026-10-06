// Cloudflare Pages Function: GET /api/calendar?c=<campaignId>&t=<token>
//
// Serves a text/calendar (.ics) feed of a campaign's NEXT scheduled session, for
// players to SUBSCRIBE to (webcal://…) — their calendar app re-polls this URL and
// auto-updates when the DM changes the date. No file downloads, no OAuth.
//
// The token (campaign_calendar_tokens) is a per-campaign capability; the service
// role reads the schedule + campaign name server-side. A campaign with no date
// returns an empty-but-valid calendar so the subscription stays live. The event
// carries a VALARM so the player's own calendar handles the reminder.
//
// Required environment variable (Cloudflare → Pages → Settings → Environment
// variables, already set for the other functions):
//   SUPABASE_SERVICE_ROLE_KEY   — bypasses RLS to read the feed row
// Optional: SUPABASE_URL (defaults to the known project).

interface Env {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

const DEFAULT_SUPABASE_URL = 'https://hxdrkifgwrbqpcevvbit.supabase.co'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function icsDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '')
}
function icsDateTime(isoDate: string, hhmm: string): string {
  const [h, m] = hhmm.split(':')
  return `${icsDate(isoDate)}T${pad(Number(h))}${pad(Number(m))}00`
}
function nextDay(isoDate: string): string {
  const d = new Date(isoDate.slice(0, 10) + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}
function plusHours(dt: string, hours: number): string {
  const y = +dt.slice(0, 4), mo = +dt.slice(4, 6), d = +dt.slice(6, 8)
  const h = +dt.slice(9, 11), mi = +dt.slice(11, 13)
  const t = new Date(y, mo - 1, d, h + hours, mi)
  return `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}T${pad(t.getHours())}${pad(t.getMinutes())}00`
}
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** VCALENDAR with 0 or 1 next-session event. CRLF line endings per RFC 5545. */
function buildCalendar(name: string, date: string | null, time: string | null): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//D&D Codex//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(name)} — sessions`]
  if (date) {
    const timed = !!time
    const start = timed ? icsDateTime(date, time!) : icsDate(date)
    lines.push(
      'BEGIN:VEVENT',
      `UID:next-session-${date}-${encodeURIComponent(name)}@dnd-codex`,
      `DTSTAMP:${stamp}`,
      timed ? `DTSTART:${start}` : `DTSTART;VALUE=DATE:${start}`,
      timed ? `DTEND:${plusHours(start, 3)}` : `DTEND;VALUE=DATE:${nextDay(date)}`,
      `SUMMARY:${esc(`${name} — session`)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`${name} session`)}`,
      timed ? 'TRIGGER:-PT2H' : 'TRIGGER:-P1D',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export const onRequestGet: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({ request, env }) => {
  const url = new URL(request.url)
  const campaignId = (url.searchParams.get('c') || '').toLowerCase()
  const token = (url.searchParams.get('t') || '').toLowerCase()
  // Reject anything that isn't a UUID so nothing untrusted reaches the query.
  if (!UUID_RE.test(campaignId) || !UUID_RE.test(token)) {
    return new Response('Bad request', { status: 400 })
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return new Response('Not configured', { status: 500 })

  const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  }
  try {
    // 1) The token must match the campaign, or there's nothing to serve.
    const tokRes = await fetch(
      `${base}/rest/v1/campaign_calendar_tokens?select=campaign_id&campaign_id=eq.${campaignId}&token=eq.${token}`,
      { headers },
    )
    const toks = tokRes.ok ? ((await tokRes.json()) as unknown[]) : []
    if (!Array.isArray(toks) || toks.length === 0) return new Response('Not found', { status: 404 })

    // 2) Name + current schedule (either may be absent; the feed still validates).
    const [campRes, schedRes] = await Promise.all([
      fetch(`${base}/rest/v1/campaigns?select=name&id=eq.${campaignId}`, { headers }),
      fetch(`${base}/rest/v1/session_schedule?select=next_date,next_time&campaign_id=eq.${campaignId}`, { headers }),
    ])
    const camp = campRes.ok ? ((await campRes.json()) as { name?: string }[])[0] : undefined
    const sched = schedRes.ok ? ((await schedRes.json()) as { next_date?: string; next_time?: string }[])[0] : undefined
    const body = buildCalendar(camp?.name || 'Campaign', sched?.next_date ?? null, sched?.next_time ?? null)

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
        'content-disposition': 'inline; filename="dnd-codex.ics"',
        // Subscribed calendars re-poll on their own cadence; a short edge cache
        // keeps a popular feed off the database without hiding date changes long.
        'cache-control': 'public, max-age=3600',
      },
    })
  } catch {
    return new Response('Upstream error', { status: 502 })
  }
}
