import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { setTheme, normalizeTheme, normalizeAccent } from '../lib/theme'

export type OAuthProvider = 'discord' | 'google'

/** Per-user session-reminder prefs (migration 0032). A missing object / key
 *  means "on" — the reminders tick treats only an explicit `false` as opt-out. */
export interface ReminderPrefs {
  offsets?: { day?: boolean; hour?: boolean; start?: boolean }
  channels?: { inapp?: boolean; email?: boolean; push?: boolean }
}

export interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  /** Per-user appearance (migration 0031); null = app default. */
  theme: string | null
  accent: string | null
  /** Per-user reminder prefs (migration 0032); null = all defaults on. */
  reminder_prefs: ReminderPrefs | null
}

interface AuthState {
  /** Whether a Supabase backend is configured at all. */
  configured: boolean
  /** True until the initial session check resolves. */
  loading: boolean
  session: Session | null
  user: User | null
  /** The signed-in user's profile row (null until loaded / if signed out). */
  profile: Profile | null
  signIn: (provider: OAuthProvider) => Promise<void>
  signOut: () => Promise<void>
  /** Update the signed-in user's own profile (display name / avatar / appearance). */
  updateProfile: (patch: {
    display_name?: string
    avatar_url?: string | null
    theme?: string
    accent?: string
    reminder_prefs?: ReminderPrefs
  }) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  // Load (or create) the profile row whenever the signed-in user changes.
  const userId = session?.user?.id
  useEffect(() => {
    if (!supabase || !session?.user) {
      setProfile(null)
      return
    }
    let cancelled = false
    const user = session.user
    const cols = 'id, username, display_name, avatar_url, theme, accent, reminder_prefs'
    const baseCols = 'id, username, display_name, avatar_url'
    ;(async () => {
      // Prefer the appearance columns; fall back if migration 0031 hasn't run.
      const first = await supabase!.from('profiles').select(cols).eq('id', user.id).maybeSingle()
      let row: Record<string, unknown> | null = first.data
      if (first.error) {
        const fb = await supabase!.from('profiles').select(baseCols).eq('id', user.id).maybeSingle()
        row = fb.data
      }
      if (!row) {
        // Safety net if the DB trigger didn't create one (e.g. user predates it).
        const meta = user.user_metadata ?? {}
        await supabase!.from('profiles').upsert({
          id: user.id,
          display_name: meta.full_name || meta.name || meta.user_name || user.email,
          avatar_url: meta.avatar_url ?? null,
        })
        const res = await supabase!.from('profiles').select(baseCols).eq('id', user.id).maybeSingle()
        row = res.data
      }
      // The fallback select omits the newer columns; default them so Profile is whole.
      if (!cancelled) setProfile(row ? ({ theme: null, accent: null, reminder_prefs: null, ...row } as unknown as Profile) : null)
    })().catch(() => {
      // Table may not exist yet (migration not run) — fail soft, keep app usable.
      if (!cancelled) setProfile(null)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  // The account is the source of truth for appearance: once the profile loads
  // (or changes), apply + re-cache it so it matches across devices. Signed out,
  // we leave the last cached choice in place (the boot script already applied it).
  useEffect(() => {
    if (!profile) return
    setTheme(normalizeTheme(profile.theme), normalizeAccent(profile.accent))
  }, [profile?.theme, profile?.accent])

  async function signIn(provider: OAuthProvider) {
    if (!supabase) return
    // Returns the player to the app after the provider round-trip; supabase-js
    // then exchanges the code (PKCE) and fires onAuthStateChange.
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
  }

  async function signOut() {
    await supabase?.auth.signOut()
  }

  async function updateProfile(patch: { display_name?: string; avatar_url?: string | null }) {
    if (!supabase || !session?.user) return
    const { error } = await supabase
      .from('profiles')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', session.user.id)
    if (error) throw new Error(error.message)
    setProfile((p) => (p ? { ...p, ...patch } : p))
  }

  return (
    <AuthContext.Provider
      value={{ configured: isSupabaseConfigured, loading, session, user: session?.user ?? null, profile, signIn, signOut, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}
