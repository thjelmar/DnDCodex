// Cloudflare Pages Function: POST /api/reminders-tick
//
// The engine behind session reminders (T-9 #4). A scheduled caller (pg_cron via
// pg_net) hits this every ~15 min with a shared secret. For each campaign that
// has an upcoming session it works out which reminder marks (1 day before, 1
// hour before, at start) are due right now, and for each member who hasn't
// opted out and hasn't already been reminded, it drops an in-app notification
// (the bell) and records the send in reminder_log so it never double-sends.
//
// Phase 1 = in-app channel only. Email + web push are later phases that reuse
// the same due-mark logic, prefs, and ledger (just more channels).
//
// Required environment variables (Cloudflare -> Pages -> Settings -> Env vars):
//   SUPABASE_SERVICE_ROLE_KEY   — bypasses RLS to read schedules + write rows
//   REMINDERS_CRON_SECRET       — shared secret; callers must send it (see below)
// Optional:
//   SUPABASE_URL                — defaults to the known project
//   REMINDERS_DEFAULT_TZ        — IANA tz for schedules saved before tz capture
//                                 (default 'America/New_York')
//
// Auth: send the secret as `x-reminders-secret: <REMINDERS_CRON_SECRET>`.

interface Env {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  REMINDERS_CRON_SECRET?: string
  REMINDERS_DEFAULT_TZ?: string
}

const DEFAULT_SUPABASE_URL = 'https://hxdrkifgwrbqpcevvbit.supabase.co'
const DEFAULT_TZ = 'America/New_York'
const DEFAULT_HOUR = '18:00' // assumed start for an all-day (no time) session
const GRACE_MS = 90 * 60 * 1000 // a mark stays "due" this long after it passes
const POST_START_MS = 2 * 60 * 60 * 1000 // never remind more than this past start

type OffsetKind = 'day' | 'hour' | 'start'
const OFFSETS: { kind: OffsetKind; beforeMs: number }[] = [
  { kind: 'day', beforeMs: 24 * 60 * 60 * 1000 },
  { kind: 'hour', beforeMs: 60 * 60 * 1000 },
  { kind: 'start', beforeMs: 0 },
]

/** Turn a wall-clock date/time in an IANA tz into a UTC epoch (ms).
 *  Computes the tz's offset at the approximate instant and corrects the guess —
 *  accurate except within a DST transition gap, which is fine for reminders. */
function wallClockToInstant(dateStr: string, timeStr: string, tz: string): number {
  const [y, mo, d] = dateStr.slice(0, 10).split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  const asUTC = Date.UTC(y, mo - 1, d, h, mi)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(asUTC))
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  // `hour` can come back as 24 at midnight in some engines; normalize.
  const hr = g('hour') % 24
  const tzAsUTC = Date.UTC(g('year'), g('month') - 1, g('day'), hr, g('minute'), g('second'))
  const offset = tzAsUTC - asUTC
  return asUTC - offset
}

interface Schedule { campaign_id: string; next_date: string | null; next_time: string | null; timezone: string | null }
interface Member { user_id: string }
interface Prefs { id: string; reminder_prefs: { offsets?: Record<string, boolean>; channels?: Record<string, boolean> } | null }
interface LogRow { recipient_id: string; offset_kind: string; channel: string }

export const onRequest: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({ request, env }) => {
  if (request.method !== 'POST' && request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }
  const secret = env.REMINDERS_CRON_SECRET
  if (!secret || request.headers.get('x-reminders-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return new Response('Not configured', { status: 500 })

  const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL
  const defaultTz = env.REMINDERS_DEFAULT_TZ || DEFAULT_TZ
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  }
  const now = Date.now()
  const rest = (path: string, init?: RequestInit) => fetch(`${base}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init?.headers || {}) } })

  try {
    // Upcoming schedules only (fetched a little into the past so a just-started
    // session still gets its at-start reminder). Volume is one row per campaign.
    const sinceDate = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const schedRes = await rest(`session_schedule?select=campaign_id,next_date,next_time,timezone&next_date=gte.${sinceDate}`)
    const schedules = (schedRes.ok ? await schedRes.json() : []) as Schedule[]

    let considered = 0
    let sent = 0

    for (const s of schedules) {
      if (!s.next_date) continue
      const tz = s.timezone || defaultTz
      const startMs = wallClockToInstant(s.next_date, s.next_time || DEFAULT_HOUR, tz)
      if (now > startMs + POST_START_MS) continue // session already well underway

      const dueKinds = OFFSETS.filter(({ beforeMs }) => {
        const mark = startMs - beforeMs
        return now >= mark && now <= mark + GRACE_MS
      }).map((o) => o.kind)
      if (dueKinds.length === 0) continue

      // Recipients, campaign name, their prefs, and what's already been sent.
      const [memRes, campRes, logRes] = await Promise.all([
        rest(`campaign_members?select=user_id&campaign_id=eq.${s.campaign_id}`),
        rest(`campaigns?select=name&id=eq.${s.campaign_id}`),
        rest(`reminder_log?select=recipient_id,offset_kind,channel&campaign_id=eq.${s.campaign_id}&session_date=eq.${s.next_date}&channel=eq.inapp`),
      ])
      const members = (memRes.ok ? await memRes.json() : []) as Member[]
      const campaignName = ((campRes.ok ? await campRes.json() : []) as { name?: string }[])[0]?.name || 'Campaign'
      const alreadySent = new Set(((logRes.ok ? await logRes.json() : []) as LogRow[]).map((r) => `${r.recipient_id}|${r.offset_kind}`))
      if (members.length === 0) continue

      const ids = members.map((m) => m.user_id)
      const prefRes = await rest(`profiles?select=id,reminder_prefs&id=in.(${ids.join(',')})`)
      const prefs = (prefRes.ok ? await prefRes.json() : []) as Prefs[]
      const prefById = new Map(prefs.map((p) => [p.id, p.reminder_prefs]))
      const wants = (uid: string, kind: OffsetKind) => {
        const pr = prefById.get(uid)
        return (pr?.offsets?.[kind] !== false) && (pr?.channels?.inapp !== false)
      }

      // Candidate (recipient, kind) pairs, filtered by prefs + the cheap pre-check.
      const candidates: { uid: string; kind: OffsetKind }[] = []
      for (const m of members) {
        for (const kind of dueKinds) {
          if (alreadySent.has(`${m.user_id}|${kind}`)) continue
          if (!wants(m.user_id, kind)) continue
          candidates.push({ uid: m.user_id, kind })
        }
      }
      if (candidates.length === 0) continue

      // Claim each via reminder_log FIRST (unique constraint + ignore-duplicates),
      // so overlapping ticks can't double-send: only rows WE insert come back.
      const logInsert = candidates.map((c) => ({
        campaign_id: s.campaign_id,
        recipient_id: c.uid,
        session_date: s.next_date,
        offset_kind: c.kind,
        channel: 'inapp',
      }))
      const claimRes = await rest('reminder_log', {
        method: 'POST',
        headers: { prefer: 'return=representation,resolution=ignore-duplicates' },
        body: JSON.stringify(logInsert),
      })
      const claimed = (claimRes.ok ? await claimRes.json() : []) as { recipient_id: string; offset_kind: string }[]
      if (claimed.length === 0) continue

      // One bell notification per claimed reminder.
      const notifs = claimed.map((c) => ({
        campaign_id: s.campaign_id,
        recipient_id: c.recipient_id,
        actor_id: null,
        type: 'session_reminder',
        payload: { date: s.next_date, time: s.next_time || null, campaignName, offset: c.offset_kind },
      }))
      await rest('notifications', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(notifs) })
      sent += claimed.length
      considered += candidates.length
    }

    return new Response(JSON.stringify({ ok: true, schedules: schedules.length, considered, sent }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 502, headers: { 'content-type': 'application/json' } })
  }
}
