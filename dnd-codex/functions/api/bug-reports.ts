// Cloudflare Pages Function: owner-only triage API for bug reports.
//   GET   /api/bug-reports        → list all reports (newest first)
//   PATCH /api/bug-reports        → update one report's status ({ id, status })
//
// The bug_reports table has RLS on with no policies, so it's unreadable by any
// client key — reads/writes here go through the service role. Access is gated to
// the maintainer: the caller must send their Supabase session token, which we
// verify against Supabase Auth and whose email must match BUG_ADMIN_EMAIL
// (falling back to BUG_REPORT_TO). This keeps report contents (which include
// reporter emails) private to the owner even though the endpoint is public.
//
// Extra env var (beyond the ones the reporter uses):
//   BUG_ADMIN_EMAIL — the app account email allowed to view reports. Defaults to
//                     BUG_REPORT_TO. Must match the email of the signed-in OAuth
//                     account you triage from.

interface Env {
  BUG_ADMIN_EMAIL?: string
  BUG_REPORT_TO?: string
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

const DEFAULT_SUPABASE_URL = 'https://hxdrkifgwrbqpcevvbit.supabase.co'
const STATUSES = new Set(['new', 'in_progress', 'resolved'])

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Verify the caller's Supabase token and that they're the configured admin. */
async function requireAdmin(
  request: Request,
  env: Env,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, error: 'Server storage is not configured.' }
  }
  const admin = (env.BUG_ADMIN_EMAIL || env.BUG_REPORT_TO || '').trim().toLowerCase()
  if (!admin) return { ok: false, status: 500, error: 'No admin email is configured.' }

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, error: 'Sign in to view reports.' }

  const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL
  let email = ''
  try {
    const res = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { ok: false, status: 401, error: 'Your session is invalid — sign in again.' }
    const user = (await res.json()) as { email?: string }
    email = (user.email || '').trim().toLowerCase()
  } catch {
    return { ok: false, status: 502, error: 'Could not verify your session.' }
  }

  if (!email || email !== admin) {
    return { ok: false, status: 403, error: 'You don’t have access to bug reports.' }
  }
  return { ok: true }
}

export const onRequestGet: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({
  request,
  env,
}) => {
  const gate = await requireAdmin(request, env)
  if (!gate.ok) return json(gate.status, { error: gate.error })

  const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL
  try {
    const res = await fetch(`${base}/rest/v1/bug_reports?select=*&order=created_at.desc`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return json(502, { error: 'Could not load reports.', detail: detail.slice(0, 300) })
    }
    const reports = await res.json()
    return json(200, { reports })
  } catch {
    return json(502, { error: 'Could not reach the database.' })
  }
}

export const onRequestPatch: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({
  request,
  env,
}) => {
  const gate = await requireAdmin(request, env)
  if (!gate.ok) return json(gate.status, { error: gate.error })

  let body: { id?: string; status?: string }
  try {
    body = (await request.json()) as { id?: string; status?: string }
  } catch {
    return json(400, { error: 'Invalid JSON body.' })
  }
  if (!body.id) return json(400, { error: 'A report id is required.' })
  if (!body.status || !STATUSES.has(body.status)) return json(400, { error: 'Invalid status.' })

  const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL
  try {
    const res = await fetch(`${base}/rest/v1/bug_reports?id=eq.${encodeURIComponent(body.id)}`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: body.status }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return json(502, { error: 'Could not update the report.', detail: detail.slice(0, 300) })
    }
    return json(200, { ok: true })
  } catch {
    return json(502, { error: 'Could not reach the database.' })
  }
}
