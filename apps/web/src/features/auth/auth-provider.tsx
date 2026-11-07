import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { fetchMyProfile } from './api'
import { AuthContext, authKeys, type AuthState } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setSessionLoaded(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      setSessionLoaded(true)
      if (event === 'SIGNED_OUT') queryClient.clear()
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [queryClient])

  const userId = session?.user.id
  const profileQuery = useQuery({
    queryKey: authKeys.profile(userId),
    queryFn: () => fetchMyProfile(userId!),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  })

  // A session without a visible profile means the account is deactivated: sign out.
  const deactivated = !!userId && profileQuery.isSuccess && profileQuery.data === null
  useEffect(() => {
    if (deactivated) {
      toast.error('Your account is inactive. Contact an administrator.')
      void supabase.auth.signOut()
    }
  }, [deactivated])

  const value = useMemo<AuthState>(() => {
    const profile = profileQuery.data ?? null
    return {
      isLoading: !sessionLoaded || (!!userId && profileQuery.isPending),
      session,
      profile,
      isAdmin: !!profile?.is_active && profile.roles.includes('admin'),
      isEmployee: !!profile?.is_active && profile.roles.includes('employee'),
    }
  }, [sessionLoaded, session, userId, profileQuery.data, profileQuery.isPending])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
