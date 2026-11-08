import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { TICKET_STATUS_LABELS, formatBoardMonth, type TicketCategory, type TicketStatus } from '@tms/shared'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import {
  adminCorrectTicket,
  listBoardTickets,
  listStatusHistory,
  transitionTicketStatus,
  type BoardFilters,
  type CorrectionChanges,
  type TicketListItem,
  changeTicketCategory,
  createTicket,
  getTicketByNumber,
  listAttachments,
  listTicketActivity,
  listTicketAliases,
  listTickets,
  moveTicketBoard,
  removeAttachment,
  restoreTicket,
  softDeleteTicket,
  updateTicket,
  type TicketFilters,
  type TicketPatch,
} from './api'

export const ticketKeys = {
  all: ['tickets'] as const,
  lists: () => [...ticketKeys.all, 'list'] as const,
  list: (f: TicketFilters) => [...ticketKeys.lists(), f] as const,
  byNumber: (n: string) => [...ticketKeys.all, 'number', n.toUpperCase()] as const,
  aliases: (id: string) => [...ticketKeys.all, 'aliases', id] as const,
  attachments: (id: string) => [...ticketKeys.all, 'attachments', id] as const,
  activity: (id: string) => [...ticketKeys.all, 'activity', id] as const,
}

export function useTickets(filters: TicketFilters) {
  return useQuery({
    queryKey: ticketKeys.list(filters),
    queryFn: () => listTickets(filters),
    placeholderData: keepPreviousData,
  })
}

export function useTicketByNumber(number: string | undefined) {
  return useQuery({
    queryKey: ticketKeys.byNumber(number ?? ''),
    queryFn: () => getTicketByNumber(number!),
    enabled: !!number,
  })
}

export const useTicketAliases = (id: string | undefined) =>
  useQuery({ queryKey: ticketKeys.aliases(id ?? ''), queryFn: () => listTicketAliases(id!), enabled: !!id })

export const useTicketAttachments = (id: string | undefined) =>
  useQuery({ queryKey: ticketKeys.attachments(id ?? ''), queryFn: () => listAttachments(id!), enabled: !!id })

export const useTicketActivity = (id: string | undefined) =>
  useQuery({ queryKey: ticketKeys.activity(id ?? ''), queryFn: () => listTicketActivity(id!), enabled: !!id })

/** Invalidates everything ticket-related; cheap enough and keeps list, detail and activity consistent. */
function useInvalidateTickets() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ticketKeys.all })
}

export function useCreateTicket() {
  const invalidate = useInvalidateTickets()
  return useMutation({
    mutationFn: createTicket,
    onSuccess: (t) => {
      toast.success(`Ticket ${t.ticket_number} created`)
      void invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useUpdateTicket() {
  const invalidate = useInvalidateTickets()
  return useMutation({
    mutationFn: (v: { id: string; patch: TicketPatch; silent?: boolean }) => updateTicket(v.id, v.patch),
    onSuccess: (_d, v) => {
      if (!v.silent) toast.success('Ticket updated')
      void invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useChangeTicketCategory() {
  const invalidate = useInvalidateTickets()
  return useMutation({
    mutationFn: (v: { id: string; category: TicketCategory; applicationId: string | null }) =>
      changeTicketCategory(v.id, v.category, v.applicationId),
    onSuccess: (number) => {
      toast.success(`Category changed. New number: ${number}`)
      void invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useSoftDeleteTicket() {
  const invalidate = useInvalidateTickets()
  return useMutation({
    mutationFn: softDeleteTicket,
    onSuccess: () => {
      toast.success('Ticket deleted')
      void invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useRestoreTicket() {
  const invalidate = useInvalidateTickets()
  return useMutation({
    mutationFn: restoreTicket,
    onSuccess: () => {
      toast.success('Ticket restored')
      void invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useRemoveAttachment() {
  const invalidate = useInvalidateTickets()
  return useMutation({
    mutationFn: removeAttachment,
    onSuccess: () => {
      toast.success('Attachment removed')
      void invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

// ---------------------------------------------------------------------------
// Workflow (Phase 5)
// ---------------------------------------------------------------------------
export const boardKey = (f: BoardFilters) => [...ticketKeys.all, 'board', f] as const
export const statusHistoryKey = (id: string) => [...ticketKeys.all, 'status-history', id] as const

export function useBoardTickets(filters: BoardFilters) {
  return useQuery({ queryKey: boardKey(filters), queryFn: () => listBoardTickets(filters), placeholderData: keepPreviousData })
}

export const useStatusHistory = (id: string | undefined) =>
  useQuery({ queryKey: statusHistoryKey(id ?? ''), queryFn: () => listStatusHistory(id!), enabled: !!id })

/**
 * Moves a ticket to a new status. When `boardFilters` is given the board cache is updated
 * optimistically and rolled back if the database rejects the transition.
 */
export function useTransitionStatus(boardFilters?: BoardFilters) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; status: TicketStatus; ticketNumber: string; reason?: string }) => transitionTicketStatus(v.id, v.status, v.reason),
    onMutate: async (v) => {
      if (!boardFilters) return undefined
      const key = boardKey(boardFilters)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<TicketListItem[]>(key)
      queryClient.setQueryData<TicketListItem[]>(key, (rows) =>
        rows?.map((r) => (r.id === v.id ? { ...r, status: v.status, updated_at: new Date().toISOString() } : r)),
      )
      return { previous, key }
    },
    onError: (e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous)
      toast.error(errorMessage(e))
    },
    onSuccess: (_t, v) => toast.success(`${v.ticketNumber} moved to ${TICKET_STATUS_LABELS[v.status]}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ticketKeys.all }),
  })
}

/** Moves a ticket to another monthly board (unlocked tickets only). */
export function useMoveTicketBoard() {
  const invalidate = useInvalidateTickets()
  return useMutation({
    mutationFn: (v: { id: string; boardMonth: string; ticketNumber: string }) => moveTicketBoard(v.id, v.boardMonth),
    onSuccess: (_d, v) => {
      toast.success(`${v.ticketNumber} moved to the ${formatBoardMonth(v.boardMonth)} board`)
      void invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useAdminCorrectTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; changes: CorrectionChanges; reason: string }) => adminCorrectTicket(v.id, v.changes, v.reason),
    onSuccess: () => {
      toast.success('Correction applied and recorded in the audit log')
      void queryClient.invalidateQueries({ queryKey: ticketKeys.all })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}
