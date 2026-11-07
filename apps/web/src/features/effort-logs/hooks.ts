import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ticketKeys } from '@/features/tickets/hooks'
import { errorMessage } from '@/lib/errors'
import { createEffort, deleteEffort, getEffortSummary, getEffortTotals, listTicketEffort, updateEffort, type EffortInput } from './api'

export const effortKeys = {
  all: ['effort'] as const,
  ticket: (ticketId: string) => [...effortKeys.all, 'ticket', ticketId] as const,
  totals: (ids: string[]) => [...effortKeys.all, 'totals', [...ids].sort()] as const,
  summary: (from: string, to: string, userId: string | null) => [...effortKeys.all, 'summary', from, to, userId] as const,
}

export const useTicketEffort = (ticketId: string) =>
  useQuery({ queryKey: effortKeys.ticket(ticketId), queryFn: () => listTicketEffort(ticketId) })

export const useEffortTotals = (ticketIds: string[]) =>
  useQuery({
    queryKey: effortKeys.totals(ticketIds),
    queryFn: () => getEffortTotals(ticketIds),
    enabled: ticketIds.length > 0,
    placeholderData: keepPreviousData,
  })

export const useEffortSummary = (from: string, to: string, userId: string | null) =>
  useQuery({
    queryKey: effortKeys.summary(from, to, userId),
    queryFn: () => getEffortSummary(from, to, userId),
    placeholderData: keepPreviousData,
  })

function useEffortMutation<T>(fn: (v: T) => Promise<unknown>, success: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(success)
      void queryClient.invalidateQueries({ queryKey: effortKeys.all })
      void queryClient.invalidateQueries({ queryKey: ticketKeys.all }) // activity timeline
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export const useCreateEffort = () =>
  useEffortMutation((v: { ticketId: string; input: EffortInput; userId?: string }) => createEffort(v.ticketId, v.input, v.userId), 'Effort logged')
export const useUpdateEffort = () =>
  useEffortMutation((v: { id: string; input: EffortInput }) => updateEffort(v.id, v.input), 'Effort updated')
export const useDeleteEffort = () => useEffortMutation(deleteEffort, 'Effort entry deleted')
