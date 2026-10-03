import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import {
  getCurrentProfile,
  getSession,
  isCurrentUserAdmin,
  onAuthStateChange,
  signInWithPassword,
  signOut as authSignOut,
} from '@/services/authService'
import { AppError } from '@/lib/errors'
import { isSupabaseConfigured } from '@/lib/supabase'
import type { Profile } from '@/types'

type AuthContextValue = {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const resolveAccess = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession)
    setUser(nextSession?.user ?? null)

    if (!isSupabaseConfigured || !nextSession) {
      setProfile(null)
      setIsAdmin(false)
      return { isAdmin: false, profile: null as Profile | null }
    }

    try {
      const [nextProfile, admin] = await Promise.all([
        getCurrentProfile(),
        isCurrentUserAdmin(),
      ])
      setProfile(nextProfile)
      setIsAdmin(admin)
      return { isAdmin: admin, profile: nextProfile }
    } catch {
      setProfile(null)
      setIsAdmin(false)
      return { isAdmin: false, profile: null }
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    await resolveAccess(session)
  }, [resolveAccess, session])

  useEffect(() => {
    let mounted = true
    let unsubscribe = () => {}

    async function bootstrap() {
      if (!isSupabaseConfigured) {
        if (mounted) setLoading(false)
        return
      }

      const { data } = onAuthStateChange((event, nextSession) => {
        if (!mounted) return

        // Keep identity on token refresh without re-querying profile.
        if (event === 'TOKEN_REFRESHED') {
          setSession(nextSession)
          setUser(nextSession?.user ?? null)
          return
        }

        if (event === 'SIGNED_OUT') {
          setSession(null)
          setUser(null)
          setProfile(null)
          setIsAdmin(false)
          return
        }

        // INITIAL_SESSION is handled by the explicit getSession() bootstrap below
        // to avoid a double profile/admin fetch race on first load.
        if (event === 'INITIAL_SESSION') {
          return
        }

        // SIGNED_IN / USER_UPDATED: resolve admin access.
        if (
          event === 'SIGNED_IN' ||
          event === 'USER_UPDATED' ||
          event === 'PASSWORD_RECOVERY'
        ) {
          void resolveAccess(nextSession)
        }
      })
      unsubscribe = () => data.subscription.unsubscribe()

      try {
        // Explicit bootstrap so loading stays true until the first session resolve finishes,
        // even if INITIAL_SESSION is delayed/missed.
        const current = await getSession()
        if (!mounted) return
        await resolveAccess(current)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void bootstrap()

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [resolveAccess])

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user,
      profile,
      isAdmin,
      signIn: async (email, password) => {
        setLoading(true)
        try {
          const result = await signInWithPassword(email, password)
          const access = await resolveAccess(result.session)

          if (!access.isAdmin) {
            await authSignOut()
            await resolveAccess(null)
            throw new AppError(
              'forbidden',
              'هذا الحساب ليس لديه صلاحية إدارة متجر أثر.',
            )
          }
        } finally {
          setLoading(false)
        }
      },
      signOut: async () => {
        setLoading(true)
        try {
          await authSignOut()
          await resolveAccess(null)
        } finally {
          setLoading(false)
        }
      },
      refreshProfile,
    }),
    [loading, session, user, profile, isAdmin, refreshProfile, resolveAccess],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
