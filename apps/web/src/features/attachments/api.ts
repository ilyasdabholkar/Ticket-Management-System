import { supabase } from '@/lib/supabase'
import { createSignedUrl } from '@/services/storage'
import { ATTACHMENT_BUCKET } from '@/features/tickets/api'

export const ATTACHMENTS_PAGE_SIZE = 25

/** File-type groups offered in the filter (extensions match ATTACHMENT_MIME_BY_EXT). */
export const ATTACHMENT_TYPE_GROUPS = {
  image: { label: 'Images', exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
  pdf: { label: 'PDF', exts: ['pdf'] },
  office: { label: 'Word / Excel', exts: ['doc', 'docx', 'xls', 'xlsx'] },
  text: { label: 'Text / SQL / JSON', exts: ['txt', 'sql', 'json'] },
  zip: { label: 'ZIP', exts: ['zip'] },
} as const
export type AttachmentTypeGroup = keyof typeof ATTACHMENT_TYPE_GROUPS

export interface AttachmentRow {
  id: string
  original_name: string
  storage_path: string
  file_ext: string
  size_bytes: number
  created_at: string
  uploaded_by: string
  ticket: { id: string; ticket_number: string; title: string; status: string }
  uploader: { id: string; full_name: string } | null
}

export interface AttachmentFilters {
  search?: string
  type?: AttachmentTypeGroup
  uploader?: string
  page?: number
}

const sanitize = (q: string) => q.replace(/[%,()*\\:"']/g, ' ').trim().slice(0, 100)

/**
 * Lists attachments of live tickets (removed files and files on deleted tickets are excluded).
 * RLS limits this to active users, exactly like the ticket page.
 */
export async function listAttachments(f: AttachmentFilters): Promise<{ rows: AttachmentRow[]; total: number }> {
  const page = Math.max(1, f.page ?? 1)
  let q = supabase
    .from('ticket_attachments')
    .select(
      'id, original_name, storage_path, file_ext, size_bytes, created_at, uploaded_by, ' +
        'ticket:tickets!inner(id, ticket_number, title, status, deleted_at), ' +
        'uploader:profiles!ticket_attachments_uploaded_by_fkey(id, full_name)',
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .is('ticket.deleted_at', null)

  const term = f.search ? sanitize(f.search) : ''
  if (term) q = q.ilike('original_name', `%${term}%`)
  if (f.type) q = q.in('file_ext', [...ATTACHMENT_TYPE_GROUPS[f.type].exts])
  if (f.uploader) q = q.eq('uploaded_by', f.uploader)

  const from = (page - 1) * ATTACHMENTS_PAGE_SIZE
  const { data, error, count } = await q.order('created_at', { ascending: false }).range(from, from + ATTACHMENTS_PAGE_SIZE - 1)
  if (error) throw error
  return { rows: (data ?? []) as unknown as AttachmentRow[], total: count ?? 0 }
}

/** Short-lived (5 min) signed URL; `download` sets Content-Disposition with the original file name. */
export function attachmentLink(row: Pick<AttachmentRow, 'storage_path' | 'original_name'>, download: boolean) {
  return createSignedUrl(ATTACHMENT_BUCKET, row.storage_path, 300, download ? row.original_name : undefined)
}
