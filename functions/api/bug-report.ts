// Cloudflare Pages Function: POST /api/bug-report
//
// Receives a bug report from the app, stores it in Supabase (service role, so it
// bypasses RLS on the locked-down bug_reports table), and emails it to the
// maintainer via Resend. Same-origin with the site, so no CORS handling needed.
//
// Required environment variables (set in Cloudflare → Pages project → Settings →
// Environment variables; these are server-side secrets, NOT the VITE_ build vars):
//   RESEND_API_KEY              — a Resend API key
//   BUG_REPORT_TO               — inbox that receives reports (your email)
// Optional:
//   BUG_REPORT_FROM             — verified sender; defaults to Resend's test
//                                 address, which can only email your own inbox
//   SUPABASE_URL                — project URL (defaults to the known project)
//   SUPABASE_SERVICE_ROLE_KEY   — enables durable storage; email still works
//                                 without it (storage is skipped)

interface Env {
  RESEND_API_KEY?: string
  BUG_REPORT_TO?: string
  BUG_REPORT_FROM?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

interface BugReportPayload {
  description?: string
  reporterEmail?: string | null
  userId?: string | null
  route?: string
  userAgent?: string
  appVersion?: string
  context?: Record<string, unknown>
  type?: string
  /** Optional screenshot as a data URL (e.g. data:image/webp;base64,…). */
  screenshot?: string | null
}

const DEFAULT_SUPABASE_URL = 'https://hxdrkifgwrbqpcevvbit.supabase.co'
const DEFAULT_FROM = 'D&D Codex <onboarding@resend.dev>'
const MAX_DESCRIPTION = 8000
// ~4MB of base64 ≈ a downscaled screenshot; reject anything wildly bigger.
const MAX_SCREENSHOT = 6_000_000
const TYPES: Record<string, { label: string; emoji: string }> = {
  bug: { label: 'Bug report', emoji: '🐛' },
  idea: { label: 'Idea', emoji: '💡' },
  question: { label: 'Question', emoji: '❓' },
}

/** Split a data URL into a servable email attachment (base64 content + name). */
function parseScreenshot(dataUrl: string | null | undefined): { filename: string; content: string } | null {
  if (!dataUrl) return null
  const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(dataUrl)
  if (!m) return null
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
  return { filename: `screenshot.${ext}`, content: m[2] }
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}

export const onRequestPost: (context: { request: Request; env: Env }) => Promise<Response> = async ({
  request,
  env,
}) => {
  let payload: BugReportPayload
  try {
    payload = (await request.json()) as BugReportPayload
  } catch {
    return json(400, { error: 'Invalid JSON body.' })
  }

  const description = (payload.description ?? '').trim()
  if (!description) return json(400, { error: 'A description is required.' })
  if (description.length > MAX_DESCRIPTION) return json(400, { error: 'Description too long.' })

  const type = payload.type && TYPES[payload.type] ? payload.type : 'bug'
  const screenshot =
    typeof payload.screenshot === 'string' &&
    payload.screenshot.startsWith('data:image/') &&
    payload.screenshot.length <= MAX_SCREENSHOT
      ? payload.screenshot
      : null

  const report = {
    description,
    reporter_email: payload.reporterEmail?.trim() || null,
    user_id: payload.userId || null,
    route: payload.route ?? null,
    user_agent: payload.userAgent ?? null,
    app_version: payload.appVersion ?? null,
    context: payload.context ?? {},
    report_type: type,
    screenshot,
  }

  // 1) Store it (best-effort — never fail the whole request just because storage
  //    is unconfigured or hiccups; the email is the primary channel).
  let stored = false
  if (env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL
      const res = await fetch(`${base}/rest/v1/bug_reports`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'content-type': 'application/json',
          prefer: 'return=minimal',
        },
        body: JSON.stringify(report),
      })
      stored = res.ok
    } catch {
      stored = false
    }
  }

  // 2) Email it. This is the channel the user asked for, so a failure here is a
  //    real failure the client should hear about.
  if (!env.RESEND_API_KEY || !env.BUG_REPORT_TO) {
    return json(500, { error: 'Email is not configured on the server.', stored })
  }

  const summary = description.split('\n')[0].slice(0, 80)
  const kind = TYPES[type]
  const ctx = report.context as Record<string, unknown>
  const rows: [string, string][] = [
    ['Type', kind.label],
    ['From', report.reporter_email || '(not provided)'],
    ['Account user id', report.user_id || '(signed out)'],
    ['Route', report.route || '(unknown)'],
    ['App version', report.app_version || '(unknown)'],
    ['User agent', report.user_agent || '(unknown)'],
    ['Screenshot', screenshot ? 'attached' : 'none'],
    ['Stored in Supabase', stored ? 'yes' : 'no'],
  ]
  const metaText = rows.map(([k, v]) => `${k}: ${v}`).join('\n')
  const metaHtml = rows.map(([k, v]) => `<tr><td style="color:#8a83a0;padding:2px 12px 2px 0">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')
  const contextText = Object.keys(ctx).length ? `\n\nContext:\n${JSON.stringify(ctx, null, 2)}` : ''

  const text = `${description}\n\n—\n${metaText}${contextText}`
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.5">
    <p style="white-space:pre-wrap;font-size:15px">${esc(description)}</p>
    <hr style="border:none;border-top:1px solid #ddd;margin:16px 0"/>
    <table style="font-size:13px;border-collapse:collapse">${metaHtml}</table>
    ${Object.keys(ctx).length ? `<pre style="font-size:12px;background:#f6f5fa;padding:10px;border-radius:6px;overflow:auto">${esc(JSON.stringify(ctx, null, 2))}</pre>` : ''}
  </div>`

  const attachment = parseScreenshot(screenshot)
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: env.BUG_REPORT_FROM || DEFAULT_FROM,
        to: [env.BUG_REPORT_TO],
        reply_to: report.reporter_email || undefined,
        subject: `${kind.emoji} ${kind.label}: ${summary}`,
        text,
        html,
        attachments: attachment ? [attachment] : undefined,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return json(502, { error: 'Could not send the email.', detail: detail.slice(0, 300), stored })
    }
  } catch {
    return json(502, { error: 'Could not reach the email service.', stored })
  }

  return json(200, { ok: true, stored })
}
