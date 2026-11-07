import type { Tables } from '@tms/shared'
import { supabase } from '@/lib/supabase'

export type Profile = Tables<'profiles'>

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/**
 * Loads the caller's profile. Returns null when RLS hides it, which happens
 * when the account is deactivated (every policy requires an active profile).
 */
export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data
}

export async function updateMyFullName(userId: string, fullName: string) {
  const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', userId)
  if (error) throw error
}

export async function changeMyPassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}
