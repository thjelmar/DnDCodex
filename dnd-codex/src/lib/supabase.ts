import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isDemo } from './demo'

// A single Supabase client for the app. Config comes from Vite env vars
// (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — see .env.example. When those
// aren't set (e.g. a fresh clone with no backend yet), the client is null and
// the app keeps working fully local-first; auth UI just stays hidden.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// The demo never has a backend: no client is created at all, so nothing in it can reach
// Supabase (no auth refresh, no Realtime socket, no REST call). The demo flag lives in
// sessionStorage and is set before the reload that starts the demo (see lib/demo.ts).
export const isSupabaseConfigured = Boolean(url && anonKey) && !isDemo()

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      global: {
        // Force every REST read to hit the network. Safari (and other browsers'
        // heuristic HTTP caching) will otherwise serve a cached shared_entities /
        // shared_images GET, so a realtime-triggered refetch returns a STALE
        // snapshot and the player's card doesn't visibly update even though the
        // live event arrived. `no-store` keeps reads fresh; Realtime is a
        // WebSocket and is unaffected by this.
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    })
  : null
