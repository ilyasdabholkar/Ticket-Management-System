import type { Json, Tables } from '@tms/shared'
import { supabase } from '@/lib/supabase'

export type TicketComment = Tables<'ticket_comments'>

/** Non-deleted comments, oldest first. Admins also receive deleted ones when `includeDeleted` is set. */
export async function listComments(ticketId: string, includeDeleted = false): Promise<TicketComment[]> {
  let q = supabase.from('ticket_comments').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true })
  if (!includeDeleted) q = q.is('deleted_at', null)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function addComment(ticketId: string, content: Json) {
  const { data, error } = await supabase
    .from('ticket_comments')
    .insert({ ticket_id: ticketId, content })
    .select('id')
    .single()
  if (error) throw error
  return data
}

export async function editComment(id: string, content: Json) {
  const { data, error } = await supabase.from('ticket_comments').update({ content }).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('The comment could not be updated.')
}

export async function deleteComment(id: string) {
  const { error } = await supabase.rpc('soft_delete_comment', { p_comment_id: id })
  if (error) throw error
}

export async function restoreComment(id: string) {
  const { error } = await supabase.rpc('restore_comment', { p_comment_id: id })
  if (error) throw error
}
