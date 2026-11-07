import { FunctionsHttpError } from '@supabase/supabase-js'
import type { UserRole } from '@tms/shared'
import type { Profile } from '@/features/auth/api'
import { supabase } from '@/lib/supabase'

export async function listUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('is_active', { ascending: false })
    .order('full_name')
  if (error) throw error
  return data
}

type AdminUsersAction =
  | { action: 'create'; email: string; full_name: string; roles: UserRole[]; password: string }
  | { action: 'update'; user_id: string; full_name?: string; email?: string; roles?: UserRole[] }
  | { action: 'set_active'; user_id: string; is_active: boolean }
  | { action: 'reset_password'; user_id: string; password: string }

/** Calls the admin-users Edge Function; surfaces its { error } message. */
async function invokeAdminUsers<T = unknown>(body: AdminUsersAction): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('admin-users', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error ?? error.message)
    }
    throw error
  }
  return data as T
}

export const createUser = (v: { email: string; full_name: string; roles: UserRole[]; password: string }) =>
  invokeAdminUsers<{ user_id: string }>({ action: 'create', ...v })

export const updateUser = (v: { user_id: string; full_name?: string; email?: string; roles?: UserRole[] }) =>
  invokeAdminUsers({ action: 'update', ...v })

export const setUserActive = (user_id: string, is_active: boolean) =>
  invokeAdminUsers({ action: 'set_active', user_id, is_active })

export const resetUserPassword = (user_id: string, password: string) =>
  invokeAdminUsers({ action: 'reset_password', user_id, password })
