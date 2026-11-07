import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Json, KbCategory, KbDocumentType, Tables } from '@tms/shared'
import { fileExtension } from '@tms/shared'
import { supabase } from '@/lib/supabase'
import { createSignedUrl, uploadWithProgress } from '@/services/storage'

export const KB_BUCKET = 'knowledge-base'

export type KbRecord = Omit<Tables<'knowledge_base'>, 'search_content'>
export type KbAttachment = Tables<'knowledge_attachments'>

export interface KbFilters {
  search?: string
  applicationId?: string
  category?: KbCategory
  documentType?: KbDocumentType
}

export interface KbListItem {
  id: string
  application_id: string
  title: string
  description: string | null
  document_type: KbDocumentType
  category: KbCategory
  updated_at: string
  /** Present for search results: highlighted with SNIPPET_START/END markers. */
  snippet?: string
}

const LIST_COLUMNS = 'id, application_id, title, description, document_type, category, updated_at'

/** Uses PostgreSQL full-text search when there is a query; otherwise lists by last update. */
export async function listKb(f: KbFilters): Promise<KbListItem[]> {
  const q = f.search?.trim()
  if (q) {
    const { data, error } = await supabase.rpc('search_knowledge_base', {
      p_query: q.slice(0, 200),
      ...(f.applicationId ? { p_application_id: f.applicationId } : {}),
      ...(f.category ? { p_category: f.category } : {}),
      ...(f.documentType ? { p_document_type: f.documentType } : {}),
      p_limit: 100,
    })
    if (error) throw error
    return data ?? []
  }
  let query = supabase.from('knowledge_base').select(LIST_COLUMNS).is('deleted_at', null)
  if (f.applicationId) query = query.eq('application_id', f.applicationId)
  if (f.category) query = query.eq('category', f.category)
  if (f.documentType) query = query.eq('document_type', f.documentType)
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(200)
  if (error) throw error
  return data
}

export async function getKb(id: string): Promise<KbRecord | null> {
  const { data, error } = await supabase
    .from('knowledge_base')
    .select('id, application_id, title, description, content, content_text, document_type, category, created_by, created_at, updated_at, deleted_at, deleted_by')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export interface KbInput {
  application_id: string
  title: string
  description: string | null
  content: Json | null
  document_type: KbDocumentType
  category: KbCategory
}

export async function createKb(input: KbInput): Promise<{ id: string }> {
  const { data, error } = await supabase.from('knowledge_base').insert(input).select('id').single()
  if (error) throw error
  return data
}

export async function updateKb(id: string, input: Partial<KbInput>) {
  const { data, error } = await supabase.from('knowledge_base').update(input).eq('id', id).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('The record could not be updated.')
}

export async function deleteKb(id: string) {
  const { error } = await supabase.rpc('soft_delete_knowledge_base', { p_id: id })
  if (error) throw error
}

export async function restoreKb(id: string) {
  const { error } = await supabase.rpc('restore_knowledge_base', { p_id: id })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export async function listKbAttachments(kbId: string): Promise<KbAttachment[]> {
  const { data, error } = await supabase
    .from('knowledge_attachments')
    .select('*')
    .eq('knowledge_base_id', kbId)
    .is('deleted_at', null)
    .order('created_at')
  if (error) throw error
  return data
}

/** Asks the Edge Function to extract searchable text. Failures are recorded on the row, not thrown. */
export async function requestExtraction(attachmentId: string) {
  const { error } = await supabase.functions.invoke('extract-document-text', { body: { attachment_id: attachmentId } })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error ?? error.message)
    }
    throw error
  }
}

/** Upload → register (server validates object/type) → request text extraction. */
export async function uploadKbAttachment(record: KbRecord, file: File, onProgress?: (p: number) => void, signal?: AbortSignal) {
  const path = `${record.application_id}/${record.id}/${crypto.randomUUID()}.${fileExtension(file.name)}`
  await uploadWithProgress({ bucket: KB_BUCKET, path, file, onProgress, signal })
  const { data: id, error } = await supabase.rpc('register_kb_attachment', {
    p_kb_id: record.id,
    p_storage_path: path,
    p_original_name: file.name,
  })
  if (error) throw error
  return id
}

export async function removeKbAttachment(id: string) {
  const { error } = await supabase.rpc('remove_kb_attachment', { p_attachment_id: id })
  if (error) throw error
}

export function kbAttachmentUrl(att: KbAttachment, download: boolean) {
  return createSignedUrl(KB_BUCKET, att.storage_path, 300, download ? att.original_name : undefined)
}
