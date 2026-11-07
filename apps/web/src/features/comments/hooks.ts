import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Json } from '@tms/shared'
import { toast } from 'sonner'
import { ticketKeys } from '@/features/tickets/hooks'
import { errorMessage } from '@/lib/errors'
import { addComment, deleteComment, editComment, listComments, restoreComment } from './api'

export const commentKeys = {
  list: (ticketId: string, includeDeleted: boolean) => [...ticketKeys.all, 'comments', ticketId, includeDeleted] as const,
}

export function useComments(ticketId: string, includeDeleted: boolean) {
  return useQuery({ queryKey: commentKeys.list(ticketId, includeDeleted), queryFn: () => listComments(ticketId, includeDeleted) })
}

function useCommentMutation<T>(fn: (v: T) => Promise<unknown>, success?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (success) toast.success(success)
      // Comments live under ticketKeys.all, so activity refreshes too.
      void queryClient.invalidateQueries({ queryKey: ticketKeys.all })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export const useAddComment = () => useCommentMutation((v: { ticketId: string; content: Json }) => addComment(v.ticketId, v.content))
export const useEditComment = () => useCommentMutation((v: { id: string; content: Json }) => editComment(v.id, v.content), 'Comment updated')
export const useDeleteComment = () => useCommentMutation(deleteComment, 'Comment deleted')
export const useRestoreComment = () => useCommentMutation(restoreComment, 'Comment restored')
