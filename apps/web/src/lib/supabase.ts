import { createClient } from '@supabase/supabase-js'
import type { Database } from '@tms/shared'
import { env } from './env'

/**
 * The single Supabase client for the app. Uses the publishable key only;
 * all authorization is enforced by RLS and database functions.
 */
export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
