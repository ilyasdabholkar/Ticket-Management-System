import type { EffortUnit, Tables } from '@tms/shared'
import { supabase } from '@/lib/supabase'

export type EffortLog = Tables<'effort_logs'>

/** RLS returns only the caller's own entries for employees, all entries for admins. */
export async function listTicketEffort(ticketId: string): Promise<EffortLog[]> {
  const { data, error } = await supabase
    .from('effort_logs')
    .select('*')
    .eq('ticket_id', ticketId)
    .is('deleted_at', null)
    .order('effort_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/** Total minutes per ticket across all users (aggregate RPC, no individual entries). */
export async function getEffortTotals(ticketIds: string[]): Promise<Map<string, number>> {
  if (ticketIds.length === 0) return new Map()
  const { data, error } = await supabase.rpc('get_ticket_effort_totals', { p_ticket_ids: ticketIds })
  if (error) throw error
  return new Map((data ?? []).map((r) => [r.ticket_id, Number(r.total_minutes)]))
}

export interface EffortInput {
  effort_date: string
  effort_value: number
  effort_unit: EffortUnit
  description: string | null
}

export async function createEffort(ticketId: string, input: EffortInput, userId?: string) {
  const { error } = await supabase
    .from('effort_logs')
    .insert({ ticket_id: ticketId, ...input, ...(userId ? { user_id: userId } : {}) })
  if (error) throw friendly(error)
}

export async function updateEffort(id: string, input: EffortInput) {
  const { data, error } = await supabase.from('effort_logs').update(input).eq('id', id).select('id')
  if (error) throw friendly(error)
  if (!data?.length) throw new Error('The effort entry could not be updated.')
}

export async function deleteEffort(id: string) {
  const { error } = await supabase.rpc('soft_delete_effort_log', { p_effort_id: id })
  if (error) throw error
}

export interface EffortSummary {
  scope: 'all' | 'user'
  user_id: string | null
  total_minutes: number
  daily: { date: string; minutes: number }[]
  weekly: { week_start: string; minutes: number }[]
  monthly: { month: string; minutes: number }[]
  by_application: { application_id: string | null; minutes: number }[]
  by_employee: { user_id: string; minutes: number }[]
  by_ticket: { ticket_id: string; ticket_number: string; title: string; minutes: number }[]
}

export async function getEffortSummary(from: string, to: string, userId?: string | null): Promise<EffortSummary> {
  const { data, error } = await supabase.rpc('get_effort_summary', {
    p_from: from,
    p_to: to,
    ...(userId ? { p_user_id: userId } : {}),
  })
  if (error) throw error
  return data as unknown as EffortSummary
}

function friendly(error: { code?: string; message: string }) {
  if (/effort_logs_minutes_range/.test(error.message)) return new Error('A single entry must be between 1 minute and 24 hours.')
  if (/effort_logs_minutes_whole/.test(error.message)) return new Error('Minutes must be a whole number.')
  return error
}
