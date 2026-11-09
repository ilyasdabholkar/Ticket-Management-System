import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ticketKeys } from '@/features/tickets/hooks'
import { listAttachments, type AttachmentFilters } from './api'

// Nested under the tickets key so uploads/removals on a ticket (which invalidate ticketKeys.all) refresh this list too.
export const attachmentListKey = (f: AttachmentFilters) => [...ticketKeys.all, 'all-attachments', f] as const

export function useAllAttachments(filters: AttachmentFilters) {
  return useQuery({ queryKey: attachmentListKey(filters), queryFn: () => listAttachments(filters), placeholderData: keepPreviousData })
}
