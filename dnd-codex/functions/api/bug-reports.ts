// Cloudflare Pages Function: owner-only ticket API (site bug reports + your own
// tickets share the bug_reports table).
//   GET    /api/bug-reports   → list all tickets (newest first)
//   POST   /api/bug-reports   → add an owner ticket ({ title, description?, category?, priority?, status?, is_public? })
//   PATCH  /api/bug-reports   → edit one ticket ({ id, ...fields })
//   DELETE /api/bug-reports   → delete one ticket ({ id })
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
const STATUSES = new Set(['reported', 'planned', 'in_progress', 'testing', 'released'])
const CATEGORIES = new Set(['issue', 'enhancement', 'feature'])
const PRIORITIES = new Set(['urgent', 'high', 'medium', 'low'])
const MAX_TEXT = 8000

type Fields = Record<string, unknown>

/**
 * Validate the editable fields in a request body. Returns only the fields that
 * were present (so PATCH can send a partial update), or an error message.
 */
function pickFields(body: Fields): { fields: Fields } | { error: string } {
  const out: Fields = {}
  const text = (key: string) => {
    if (!(key in body)) return
    const v = body[key]
    if (v === null || v === '') out[key] = null
    else if (typeof v === 'string' && v.length <= MAX_TEXT) out[key] = v.trim() || null
    else throw new Error(`Invalid ${key}.`)
  }
  const oneOf = (key: string, allowed: Set<string>, nullable: boolean) => {
    if (!(key in body)) return
    const v = body[key]
    if (v === null && nullable) out[key] = null
    else if (typeof v === 'string' && allowed.has(v)) out[key] = v
    else throw new Error(`Invalid ${key}.`)
  }
  try {
    text('title')
    text('description')
    text('resolution_note')
    text('claimed_by')
    oneOf('category', CATEGORIES, true)
    oneOf('priority', PRIORITIES, true)
    oneOf('status', STATUSES, false)
    if ('is_public' in body) {
      if (typeof body.is_public !== 'boolean') throw new Error('Invalid is_public.')
      out.is_public = body.is_public
    }
  } catch (e) {
    return { error: (e as Error).message }
  }
  if ('status' in out) out.released_at = out.status === 'released' ? new Date().toISOString() : null
  return { fields: out }
}

function rest(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL
  return fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  })
}

async function readBody(request: Request): Promise<Fields | null> {
  try {
    const b = await request.json()
    return b && typeof b === 'object' ? (b as Fields) : null
  } catch {
    return null
  }
}

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

type Handler = (ctx: { request: Request; env: Env }) => Promise<Response>

export const onRequestGet: Handler = async ({ request, env }) => {
  const gate = await requireAdmin(request, env)
  if (!gate.ok) return json(gate.status, { error: gate.error })

  try {
    const res = await rest(env, 'bug_reports?select=*&order=created_at.desc')
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return json(502, { error: 'Could not load tickets.', detail: detail.slice(0, 300) })
    }
    const reports = await res.json()
    return json(200, { reports })
  } catch {
    return json(502, { error: 'Could not reach the database.' })
  }
}

export const onRequestPost: Handler = async ({ request, env }) => {
  const gate = await requireAdmin(request, env)
  if (!gate.ok) return json(gate.status, { error: gate.error })

  const body = await readBody(request)
  if (!body) return json(400, { error: 'Invalid JSON body.' })
  const picked = pickFields(body)
  if ('error' in picked) return json(400, { error: picked.error })
  const fields = picked.fields
  if (!fields.title) return json(400, { error: 'A title is required.' })
  // Your own tickets start at Planned — they have no "Reported" stage.
  if (!fields.status || fields.status === 'reported') fields.status = 'planned'

  try {
    const res = await rest(env, 'bug_reports?select=*', {
      method: 'POST',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ ...fields, source: 'owner' }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return json(502, { error: 'Could not add the ticket.', detail: detail.slice(0, 300) })
    }
    const rows = (await res.json()) as unknown[]
    return json(200, { ok: true, report: rows[0] ?? null })
  } catch {
    return json(502, { error: 'Could not reach the database.' })
  }
}

export const onRequestPatch: Handler = async ({ request, env }) => {
  const gate = await requireAdmin(request, env)
  if (!gate.ok) return json(gate.status, { error: gate.error })

  const body = await readBody(request)
  if (!body) return json(400, { error: 'Invalid JSON body.' })
  if (typeof body.id !== 'string' || !body.id) return json(400, { error: 'A ticket id is required.' })
  const picked = pickFields(body)
  if ('error' in picked) return json(400, { error: picked.error })
  if (Object.keys(picked.fields).length === 0) return json(400, { error: 'Nothing to update.' })

  try {
    const res = await rest(env, `bug_reports?id=eq.${encodeURIComponent(body.id)}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ ...picked.fields, updated_at: new Date().toISOString() }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return json(502, { error: 'Could not update the ticket.', detail: detail.slice(0, 300) })
    }
    return json(200, { ok: true })
  } catch {
    return json(502, { error: 'Could not reach the database.' })
  }
}

export const onRequestDelete: Handler = async ({ request, env }) => {
  const gate = await requireAdmin(request, env)
  if (!gate.ok) return json(gate.status, { error: gate.error })

  const body = await readBody(request)
  if (!body || typeof body.id !== 'string' || !body.id) return json(400, { error: 'A ticket id is required.' })

  try {
    const res = await rest(env, `bug_reports?id=eq.${encodeURIComponent(body.id)}`, {
      method: 'DELETE',
      headers: { prefer: 'return=minimal' },
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return json(502, { error: 'Could not delete the ticket.', detail: detail.slice(0, 300) })
    }
    return json(200, { ok: true })
  } catch {
    return json(502, { error: 'Could not reach the database.' })
  }
}
