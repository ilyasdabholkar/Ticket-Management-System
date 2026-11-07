import type { Json } from '@tms/shared'
import { supabase } from '@/lib/supabase'

export interface DashboardStats {
  effort_scope: 'team' | 'own'
  tickets: {
    total: number
    development: number
    support: number
    rnd: number
    unassigned: number
    by_status: { development: number; in_progress: number; qa_deployed: number; prod_deployed: number }
  }
  effort_this_month: number
  effort_in_range: number
  by_employee: { user_id: string; minutes: number }[]
  by_application: { application_id: string | null; count: number }[]
}

export async function getDashboardStats(from: string, to: string): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_dashboard_stats', { p_from: from, p_to: to })
  if (error) throw error
  return data as unknown as DashboardStats
}

/** Latest activity the caller may see (RLS hides others' effort events from employees). */
export async function listRecentActivity(limit = 12) {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('id, action, actor_id, metadata, created_at, entity_type, ticket_id, ticket:tickets(ticket_number, title)')
    .not('ticket_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as unknown as {
    id: string
    action: string
    actor_id: string | null
    metadata: Json
    created_at: string
    entity_type: string
    ticket_id: string
    ticket: { ticket_number: string; title: string } | null
  }[]
}

export async function listRecentTickets(order: 'created_at' | 'updated_at', limit = 6) {
  const { data, error } = await supabase
    .from('tickets')
    .select('id, ticket_number, title, status, priority, created_at, updated_at')
    .is('deleted_at', null)
    .order(order, { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}
