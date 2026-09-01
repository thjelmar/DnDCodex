import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// A single Supabase client for the app. Config comes from Vite env vars
// (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) — see .env.example. When those
// aren't set (e.g. a fresh clone with no backend yet), the client is null and
// the app keeps working fully local-first; auth UI just stays hidden.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null
