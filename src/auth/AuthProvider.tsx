import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

export type OAuthProvider = 'discord' | 'google'

export interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
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
  /** Update the signed-in user's own profile (display name / avatar). */
  updateProfile: (patch: { display_name?: string; avatar_url?: string | null }) => Promise<void>
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
    const cols = 'id, username, display_name, avatar_url'
    ;(async () => {
      let { data } = await supabase!.from('profiles').select(cols).eq('id', user.id).maybeSingle()
      if (!data) {
        // Safety net if the DB trigger didn't create one (e.g. user predates it).
        const meta = user.user_metadata ?? {}
        await supabase!.from('profiles').upsert({
          id: user.id,
          display_name: meta.full_name || meta.name || meta.user_name || user.email,
          avatar_url: meta.avatar_url ?? null,
        })
        const res = await supabase!.from('profiles').select(cols).eq('id', user.id).maybeSingle()
        data = res.data
      }
      if (!cancelled) setProfile((data as Profile) ?? null)
    })().catch(() => {
      // Table may not exist yet (migration not run) — fail soft, keep app usable.
      if (!cancelled) setProfile(null)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

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
