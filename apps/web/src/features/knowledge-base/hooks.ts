import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import {
  createKb,
  deleteKb,
  getKb,
  listKb,
  listKbAttachments,
  removeKbAttachment,
  requestExtraction,
  restoreKb,
  updateKb,
  type KbFilters,
  type KbInput,
} from './api'

export const kbKeys = {
  all: ['knowledge-base'] as const,
  list: (f: KbFilters) => [...kbKeys.all, 'list', f] as const,
  detail: (id: string) => [...kbKeys.all, 'detail', id] as const,
  attachments: (id: string) => [...kbKeys.all, 'attachments', id] as const,
}

export const useKbList = (f: KbFilters) =>
  useQuery({ queryKey: kbKeys.list(f), queryFn: () => listKb(f), placeholderData: keepPreviousData })

export const useKb = (id: string | undefined) =>
  useQuery({ queryKey: kbKeys.detail(id ?? ''), queryFn: () => getKb(id!), enabled: !!id })

/** Polls while any document is still being processed. */
export const useKbAttachments = (id: string | undefined) =>
  useQuery({
    queryKey: kbKeys.attachments(id ?? ''),
    queryFn: () => listKbAttachments(id!),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.some((a) => a.extraction_status === 'pending') ? 3000 : false),
  })

function useKbMutation<T, R>(fn: (v: T) => Promise<R>, success?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (success) toast.success(success)
      void queryClient.invalidateQueries({ queryKey: kbKeys.all })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export const useCreateKb = () => useKbMutation((v: KbInput) => createKb(v), 'Knowledge base record created')
export const useUpdateKb = () => useKbMutation((v: { id: string; input: Partial<KbInput> }) => updateKb(v.id, v.input), 'Record updated')
export const useDeleteKb = () => useKbMutation(deleteKb, 'Record deleted')
export const useRestoreKb = () => useKbMutation(restoreKb, 'Record restored')
export const useRemoveKbAttachment = () => useKbMutation(removeKbAttachment, 'Document removed')
export const useRetryExtraction = () => useKbMutation(requestExtraction, 'Text extraction requested')
