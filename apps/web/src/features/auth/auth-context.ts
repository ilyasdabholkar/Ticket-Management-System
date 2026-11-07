import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'
import type { Profile } from './api'

export interface AuthState {
  /** True until the initial session (and profile, if signed in) has been resolved. */
  isLoading: boolean
  session: Session | null
  profile: Profile | null
  isAdmin: boolean
  /** Holds the Employee role: assignable, logs own effort, appears in employee lists. */
  isEmployee: boolean
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export const authKeys = {
  profile: (userId: string | undefined) => ['auth', 'profile', userId] as const,
}
