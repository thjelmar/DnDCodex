import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

export type OAuthProvider = 'discord' | 'google'

interface AuthState {
  /** Whether a Supabase backend is configured at all. */
  configured: boolean
  /** True until the initial session check resolves. */
  loading: boolean
  session: Session | null
  user: User | null
  signIn: (provider: OAuthProvider) => Promise<void>
  signOut: () => Promise<void>
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

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

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

  return (
    <AuthContext.Provider
      value={{ configured: isSupabaseConfigured, loading, session, user: session?.user ?? null, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}
