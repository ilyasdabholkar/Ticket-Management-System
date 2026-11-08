import type { Json, Tables, TablesInsert, TicketCategory, TicketPriority, TicketStatus } from '@tms/shared'
import { fileExtension } from '@tms/shared'
import { supabase } from '@/lib/supabase'
import { createSignedUrl, uploadWithProgress } from '@/services/storage'

export const ATTACHMENT_BUCKET = 'ticket-attachments'
export const PAGE_SIZE = 25

export type Ticket = Tables<'tickets'>
export type TicketAttachment = Tables<'ticket_attachments'>
export type ActivityLog = Tables<'activity_logs'>

const LIST_COLUMNS =
  'id, ticket_number, title, category, priority, status, board_month, application_id, assigned_to, created_by, created_at, updated_at, deleted_at, ' +
  'application:applications(id, name, icon_key), assignee:profiles!tickets_assigned_to_fkey(id, full_name)'

export interface TicketListItem
  extends Pick<
    Ticket,
    | 'id'
    | 'ticket_number'
    | 'title'
    | 'category'
    | 'priority'
    | 'status'
    | 'board_month'
    | 'application_id'
    | 'assigned_to'
    | 'created_by'
    | 'created_at'
    | 'updated_at'
    | 'deleted_at'
  > {
  application: { id: string; name: string; icon_key: string } | null
  assignee: { id: string; full_name: string } | null
}

export type TicketSort = 'updated' | 'created' | 'number'

export interface TicketFilters {
  search?: string
  category?: TicketCategory
  applicationId?: string
  /** A profile id, or 'unassigned'. */
  assignee?: string
  priority?: TicketPriority
  status?: TicketStatus
  /** Board month (YYYY-MM-01). Omit for all months. */
  boardMonth?: string
  /** Admin only: show soft-deleted tickets instead of live ones. */
  deleted?: boolean
  sort?: TicketSort
  page?: number
}

/** Removes characters that have meaning in PostgREST filter syntax. */
function sanitizeSearch(q: string) {
  return q.replace(/[%,()*\\:"']/g, ' ').trim().slice(0, 100)
}

export async function listTickets(f: TicketFilters): Promise<{ rows: TicketListItem[]; total: number }> {
  const page = Math.max(1, f.page ?? 1)
  let q = supabase.from('tickets').select(LIST_COLUMNS, { count: 'exact' })

  q = f.deleted ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null)
  if (f.category) q = q.eq('category', f.category)
  if (f.applicationId) q = q.eq('application_id', f.applicationId)
  if (f.priority) q = q.eq('priority', f.priority)
  if (f.status) q = q.eq('status', f.status)
  if (f.boardMonth) q = q.eq('board_month', f.boardMonth)
  if (f.assignee === 'unassigned') q = q.is('assigned_to', null)
  else if (f.assignee) q = q.eq('assigned_to', f.assignee)
  const term = f.search ? sanitizeSearch(f.search) : ''
  if (term) q = q.or(`ticket_number.ilike.%${term}%,title.ilike.%${term}%`)

  if (f.sort === 'created') q = q.order('created_at', { ascending: false })
  else if (f.sort === 'number') q = q.order('ticket_number', { ascending: true })
  else q = q.order('updated_at', { ascending: false })

  const from = (page - 1) * PAGE_SIZE
  const { data, error, count } = await q.range(from, from + PAGE_SIZE - 1)
  if (error) throw error
  return { rows: (data ?? []) as unknown as TicketListItem[], total: count ?? 0 }
}

export type TicketLookup = { ticket: Ticket } | { redirectTo: string } | null

/** Finds a ticket by its current number, or by a previous number (alias) after a category change. */
export async function getTicketByNumber(ticketNumber: string): Promise<TicketLookup> {
  const number = ticketNumber.toUpperCase()
  const { data, error } = await supabase.from('tickets').select('*').eq('ticket_number', number).maybeSingle()
  if (error) throw error
  if (data) return { ticket: data }

  const { data: alias, error: aliasErr } = await supabase
    .from('ticket_number_aliases')
    .select('ticket_id')
    .eq('ticket_number', number)
    .maybeSingle()
  if (aliasErr) throw aliasErr
  if (!alias) return null
  const { data: current, error: curErr } = await supabase
    .from('tickets')
    .select('ticket_number')
    .eq('id', alias.ticket_id)
    .maybeSingle()
  if (curErr) throw curErr
  return current ? { redirectTo: current.ticket_number } : null
}

export async function listTicketAliases(ticketId: string) {
  const { data, error } = await supabase
    .from('ticket_number_aliases')
    .select('ticket_number, replaced_at')
    .eq('ticket_id', ticketId)
    .order('replaced_at')
  if (error) throw error
  return data
}

export interface TicketInput {
  category: TicketCategory
  application_id: string | null
  title: string
  description: Json | null
  priority: TicketPriority
  assigned_to: string | null
  /** Board month (YYYY-MM-01); defaults to the current month on the server. */
  board_month?: string
}

export async function createTicket(input: TicketInput): Promise<Pick<Ticket, 'id' | 'ticket_number'>> {
  // ticket_number is assigned by the tickets_before_write trigger (and is not insertable by clients),
  // but the generated Insert type marks it required.
  const { data, error } = await supabase
    .from('tickets')
    .insert(input as unknown as TablesInsert<'tickets'>)
    .select('id, ticket_number')
    .single()
  if (error) throw error
  return data
}

export type TicketPatch = Partial<Pick<TicketInput, 'application_id' | 'title' | 'description' | 'priority' | 'assigned_to'>>

export async function updateTicket(id: string, patch: TicketPatch): Promise<void> {
  const { data, error } = await supabase.from('tickets').update(patch).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('The ticket could not be updated. It may be locked or deleted.')
}

/** Moves a ticket to another monthly board (unlocked tickets only; audited as 'board_changed'). */
export async function moveTicketBoard(id: string, boardMonth: string): Promise<void> {
  const { data, error } = await supabase.from('tickets').update({ board_month: boardMonth }).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('The ticket could not be moved. Finished (locked) tickets cannot change board.')
}

export async function changeTicketCategory(id: string, category: TicketCategory, applicationId: string | null) {
  const { data, error } = await supabase.rpc('change_ticket_category', {
    p_ticket_id: id,
    p_category: category,
    ...(applicationId ? { p_application_id: applicationId } : {}),
  })
  if (error) throw error
  return data
}

export async function softDeleteTicket(id: string) {
  const { error } = await supabase.rpc('soft_delete_ticket', { p_ticket_id: id })
  if (error) throw error
}

export async function restoreTicket(id: string) {
  const { error } = await supabase.rpc('restore_ticket', { p_ticket_id: id })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------
export async function listAttachments(ticketId: string): Promise<TicketAttachment[]> {
  const { data, error } = await supabase
    .from('ticket_attachments')
    .select('*')
    .eq('ticket_id', ticketId)
    .is('deleted_at', null)
    .order('created_at')
  if (error) throw error
  return data
}

/** Uploads to `{ticketId}/{uuid}.{ext}` then registers metadata (server validates object, size, type). */
export async function uploadAttachment(ticketId: string, file: File, onProgress?: (p: number) => void, signal?: AbortSignal) {
  const path = `${ticketId}/${crypto.randomUUID()}.${fileExtension(file.name)}`
  await uploadWithProgress({ bucket: ATTACHMENT_BUCKET, path, file, onProgress, signal })
  const { data, error } = await supabase.rpc('register_ticket_attachment', {
    p_ticket_id: ticketId,
    p_storage_path: path,
    p_original_name: file.name,
  })
  if (error) throw error
  return data
}

export async function removeAttachment(id: string) {
  const { error } = await supabase.rpc('remove_ticket_attachment', { p_attachment_id: id })
  if (error) throw error
}

export function attachmentUrl(att: TicketAttachment, download: boolean) {
  return createSignedUrl(ATTACHMENT_BUCKET, att.storage_path, 300, download ? att.original_name : undefined)
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------
export async function listTicketActivity(ticketId: string): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Workflow (Phase 5)
// ---------------------------------------------------------------------------
export type StatusHistoryEntry = Tables<'ticket_status_history'>

export async function transitionTicketStatus(id: string, status: TicketStatus, reason?: string): Promise<Ticket> {
  const { data, error } = await supabase.rpc('transition_ticket_status', {
    p_ticket_id: id,
    p_status: status,
    ...(reason?.trim() ? { p_reason: reason.trim() } : {}),
  })
  if (error) throw error
  return data
}

export interface CorrectionChanges {
  title?: string
  priority?: TicketPriority
  assigned_to?: string | null
  application_id?: string | null
  status?: TicketStatus
  started_on?: string | null
  qa_deployed_on?: string | null
  prod_deployed_on?: string | null
  completed_on?: string | null
  dropped_on?: string | null
  drop_reason?: string | null
  board_month?: string
}

export async function adminCorrectTicket(id: string, changes: CorrectionChanges, reason: string): Promise<Ticket> {
  const { data, error } = await supabase.rpc('admin_correct_ticket', {
    p_ticket_id: id,
    p_changes: changes as Json,
    p_reason: reason,
  })
  if (error) throw error
  return data
}

export async function listStatusHistory(ticketId: string): Promise<StatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from('ticket_status_history')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('changed_at', { ascending: true })
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Board (Phase 5)
// ---------------------------------------------------------------------------
export interface BoardFilters {
  /** The monthly board to show (YYYY-MM-01). */
  boardMonth: string
  search?: string
  category?: TicketCategory
  applicationId?: string
  assignee?: string
  priority?: TicketPriority
}

/** Safety cap for one monthly board. */
export const BOARD_LIMIT = 1000

export async function listBoardTickets(f: BoardFilters): Promise<TicketListItem[]> {
  let q = supabase.from('tickets').select(LIST_COLUMNS).is('deleted_at', null).eq('board_month', f.boardMonth)
  if (f.category) q = q.eq('category', f.category)
  if (f.applicationId) q = q.eq('application_id', f.applicationId)
  if (f.priority) q = q.eq('priority', f.priority)
  if (f.assignee === 'unassigned') q = q.is('assigned_to', null)
  else if (f.assignee) q = q.eq('assigned_to', f.assignee)
  const term = f.search ? sanitizeSearch(f.search) : ''
  if (term) q = q.or(`ticket_number.ilike.%${term}%,title.ilike.%${term}%`)
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(BOARD_LIMIT)
  if (error) throw error
  return (data ?? []) as unknown as TicketListItem[]
}
