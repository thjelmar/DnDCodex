// Cloudflare Pages Function: POST /api/reminders-tick
//
// The engine behind session reminders (T-9 #4). A scheduled caller (pg_cron via
// pg_net) hits this every ~15 min with a shared secret. For each campaign that
// has an upcoming session it works out which reminder marks (1 day before, 1
// hour before, at start) are due right now, and for each member who hasn't
// opted out and hasn't already been reminded, it delivers on each enabled
// channel and records the send in reminder_log so it never double-sends.
//
// Channels:
//   - in-app bell (always on) — inserts a notification row.
//   - email (Phase 2) — sent via Resend, only when RESEND_API_KEY + RESEND_FROM
//     are set. Deploys dark until then. With Resend's test
//     sender (onboarding@resend.dev) delivery is limited to the account owner's
//     own email — enough to verify the plumbing before a domain is verified.
//   - web push (Phase 3) — not yet.
//
// Required environment variables (Cloudflare -> Pages -> Settings -> Env vars):
//   SUPABASE_SERVICE_ROLE_KEY   — bypasses RLS to read schedules + write rows,
//                                 and read member emails via the admin API
//   REMINDERS_CRON_SECRET       — shared secret; callers must send it (below)
// Optional:
//   SUPABASE_URL                — defaults to the known project
//   REMINDERS_DEFAULT_TZ        — IANA tz for schedules saved before tz capture
//                                 (default 'America/New_York')
//   RESEND_API_KEY              — Resend API key; enables the email channel
//   RESEND_FROM                 — e.g. 'D&D Codex <reminders@yourdomain>' or,
//                                 for testing, 'D&D Codex <onboarding@resend.dev>'
//
// Auth: send the secret as `x-reminders-secret: <REMINDERS_CRON_SECRET>`.

interface Env {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  REMINDERS_CRON_SECRET?: string
  REMINDERS_DEFAULT_TZ?: string
  RESEND_API_KEY?: string
  RESEND_FROM?: string
}

const DEFAULT_SUPABASE_URL = 'https://hxdrkifgwrbqpcevvbit.supabase.co'
const DEFAULT_TZ = 'America/New_York'
const DEFAULT_HOUR = '18:00' // assumed start for an all-day (no time) session
const GRACE_MS = 90 * 60 * 1000 // a mark stays "due" this long after it passes
const POST_START_MS = 2 * 60 * 60 * 1000 // never remind more than this past start
const APP_URL = 'https://dndcodex.pages.dev/'
const RESEND_URL = 'https://api.resend.com/emails'

type OffsetKind = 'day' | 'hour' | 'start'
type Channel = 'inapp' | 'email'
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
  const hr = g('hour') % 24 // some engines report 24 at midnight
  const tzAsUTC = Date.UTC(g('year'), g('month') - 1, g('day'), hr, g('minute'), g('second'))
  const offset = tzAsUTC - asUTC
  return asUTC - offset
}

/** Readable session date like "Friday, October 17" (parts shown as stored). */
function fmtDate(iso: string): string {
  const [y, mo, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}
/** "19:00" -> "7:00 PM". */
function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ap = h < 12 ? 'AM' : 'PM'
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
}
function markPhrase(kind: OffsetKind): string {
  return kind === 'day' ? 'tomorrow' : kind === 'hour' ? 'in about an hour' : 'starting now'
}

interface Schedule { campaign_id: string; next_date: string | null; next_time: string | null; timezone: string | null }
interface Member { user_id: string }
interface Prefs { id: string; reminder_prefs: { offsets?: Record<string, boolean>; channels?: Record<string, boolean> } | null }
interface LogRow { recipient_id: string; offset_kind: string; channel: string }
interface Claimed { id: string; recipient_id: string; offset_kind: OffsetKind; channel: Channel }

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
  const emailKey = env.RESEND_API_KEY
  const emailFrom = env.RESEND_FROM
  const emailOn = !!(emailKey && emailFrom)
  const channels: Channel[] = emailOn ? ['inapp', 'email'] : ['inapp']

  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  }
  const now = Date.now()
  const rest = (path: string, init?: RequestInit) => fetch(`${base}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init?.headers || {}) } })

  // Member email lookup via the GoTrue admin API, cached across the run.
  const emailCache = new Map<string, string | null>()
  async function emailFor(uid: string): Promise<string | null> {
    if (emailCache.has(uid)) return emailCache.get(uid)!
    let email: string | null = null
    try {
      const r = await fetch(`${base}/auth/v1/admin/users/${uid}`, { headers })
      if (r.ok) email = ((await r.json()) as { email?: string }).email || null
    } catch { /* leave null */ }
    emailCache.set(uid, email)
    return email
  }

  async function sendEmail(to: string, kind: OffsetKind, campaignName: string, date: string, time: string | null): Promise<boolean> {
    const when = fmtDate(date) + (time ? ` at ${fmt12(time)}` : '')
    const subject = `Session ${kind === 'start' ? 'starting now' : markPhrase(kind)} — ${campaignName}`
    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px">
      <h2 style="margin:0 0 8px">${campaignName}</h2>
      <p style="margin:0 0 4px;font-size:16px">Your session is <strong>${markPhrase(kind)}</strong>.</p>
      <p style="margin:0 0 16px;color:#444">${when}</p>
      <p style="margin:0 0 16px"><a href="${APP_URL}" style="color:#7c3aed">Open D&amp;D Codex →</a></p>
      <p style="margin:0;color:#999;font-size:12px">You're receiving this because you're in this campaign. Manage reminders in Preferences.</p>
    </div>`
    try {
      const r = await fetch(RESEND_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${emailKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: emailFrom, to: [to], subject, html }),
      })
      return r.ok
    } catch {
      return false
    }
  }

  try {
    const sinceDate = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const schedRes = await rest(`session_schedule?select=campaign_id,next_date,next_time,timezone&next_date=gte.${sinceDate}`)
    const schedules = (schedRes.ok ? await schedRes.json() : []) as Schedule[]

    let considered = 0
    let sentInapp = 0
    let sentEmail = 0

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

      // Recipients, campaign name, their prefs, and what's already been sent
      // (every channel, so in-app and email dedup independently).
      const [memRes, campRes, logRes] = await Promise.all([
        rest(`campaign_members?select=user_id&campaign_id=eq.${s.campaign_id}`),
        rest(`campaigns?select=name&id=eq.${s.campaign_id}`),
        rest(`reminder_log?select=recipient_id,offset_kind,channel&campaign_id=eq.${s.campaign_id}&session_date=eq.${s.next_date}`),
      ])
      const members = (memRes.ok ? await memRes.json() : []) as Member[]
      const campaignName = ((campRes.ok ? await campRes.json() : []) as { name?: string }[])[0]?.name || 'Campaign'
      const alreadySent = new Set(((logRes.ok ? await logRes.json() : []) as LogRow[]).map((r) => `${r.recipient_id}|${r.offset_kind}|${r.channel}`))
      if (members.length === 0) continue

      const ids = members.map((m) => m.user_id)
      const prefRes = await rest(`profiles?select=id,reminder_prefs&id=in.(${ids.join(',')})`)
      const prefs = (prefRes.ok ? await prefRes.json() : []) as Prefs[]
      const prefById = new Map(prefs.map((p) => [p.id, p.reminder_prefs]))
      const wants = (uid: string, kind: OffsetKind, channel: Channel) => {
        const pr = prefById.get(uid)
        return (pr?.offsets?.[kind] !== false) && (pr?.channels?.[channel] !== false)
      }

      // Candidate (recipient, kind, channel) triples, filtered by prefs + the
      // cheap pre-check.
      const candidates: { uid: string; kind: OffsetKind; channel: Channel }[] = []
      for (const m of members) {
        for (const kind of dueKinds) {
          for (const channel of channels) {
            if (alreadySent.has(`${m.user_id}|${kind}|${channel}`)) continue
            if (!wants(m.user_id, kind, channel)) continue
            candidates.push({ uid: m.user_id, kind, channel })
          }
        }
      }
      if (candidates.length === 0) continue
      considered += candidates.length

      // Claim each via reminder_log FIRST (unique + ignore-duplicates), so
      // overlapping ticks can't double-send: only rows WE insert come back.
      const logInsert = candidates.map((c) => ({
        campaign_id: s.campaign_id,
        recipient_id: c.uid,
        session_date: s.next_date,
        offset_kind: c.kind,
        channel: c.channel,
      }))
      const claimRes = await rest('reminder_log', {
        method: 'POST',
        headers: { prefer: 'return=representation,resolution=ignore-duplicates' },
        body: JSON.stringify(logInsert),
      })
      const claimed = (claimRes.ok ? await claimRes.json() : []) as Claimed[]
      if (claimed.length === 0) continue

      // Dispatch per channel. A failed send un-claims its row so a later tick
      // retries (within the grace window) rather than silently dropping it.
      const inapp = claimed.filter((c) => c.channel === 'inapp')
      if (inapp.length > 0) {
        const notifs = inapp.map((c) => ({
          campaign_id: s.campaign_id,
          recipient_id: c.recipient_id,
          actor_id: null,
          type: 'session_reminder',
          payload: { date: s.next_date, time: s.next_time || null, campaignName, offset: c.offset_kind },
        }))
        const nRes = await rest('notifications', { method: 'POST', headers: { prefer: 'return=minimal' }, body: JSON.stringify(notifs) })
        if (nRes.ok) sentInapp += inapp.length
        else await rest(`reminder_log?id=in.(${inapp.map((c) => c.id).join(',')})`, { method: 'DELETE', headers: { prefer: 'return=minimal' } })
      }

      for (const c of claimed.filter((x) => x.channel === 'email')) {
        const to = await emailFor(c.recipient_id)
        const ok = to ? await sendEmail(to, c.offset_kind, campaignName, s.next_date, s.next_time) : false
        if (ok) sentEmail += 1
        else await rest(`reminder_log?id=eq.${c.id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } })
      }
    }

    return new Response(JSON.stringify({ ok: true, schedules: schedules.length, considered, sentInapp, sentEmail, emailOn, hasKey: !!emailKey, hasFrom: !!emailFrom }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 502, headers: { 'content-type': 'application/json' } })
  }
}
