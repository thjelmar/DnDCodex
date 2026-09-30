// Cloudflare Pages Function: GET /api/roadmap — the public "What we're working on"
// list. No sign-in needed.
//
// Reads the locked-down bug_reports table with the service role, but returns ONLY
// tickets the owner marked public, and only their public-safe fields: number,
// title, category, priority, stage, and dates. Reporter emails, descriptions,
// screenshots, and diagnostic context never leave the server.

interface Env {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

const DEFAULT_SUPABASE_URL = 'https://hxdrkifgwrbqpcevvbit.supabase.co'
const PUBLIC_COLUMNS = 'number,title,category,priority,status,source,created_at,released_at'

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // Small edge cache so a busy page doesn't hit the database on every view.
      'cache-control': 'public, max-age=60',
    },
  })
}

export const onRequestGet: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({ env }) => {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return json(500, { error: 'Server storage is not configured.' })

  const base = env.SUPABASE_URL || DEFAULT_SUPABASE_URL
  try {
    // A public ticket needs a title (the reporter's words are never shown).
    const res = await fetch(
      `${base}/rest/v1/bug_reports?select=${PUBLIC_COLUMNS}&is_public=eq.true&title=not.is.null&order=created_at.desc`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    )
    if (!res.ok) return json(502, { error: 'Could not load the roadmap.' })
    const tickets = await res.json()
    return json(200, { tickets })
  } catch {
    return json(502, { error: 'Could not reach the database.' })
  }
}
