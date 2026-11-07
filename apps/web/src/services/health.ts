import { useQuery } from '@tanstack/react-query'
import { env } from '@/lib/env'

/** Pings the Supabase Auth health endpoint to verify connectivity. */
async function fetchSupabaseHealth(): Promise<boolean> {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY },
  })
  return res.ok
}

export function useSupabaseHealth() {
  return useQuery({
    queryKey: ['system', 'supabase-health'],
    queryFn: fetchSupabaseHealth,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
}
