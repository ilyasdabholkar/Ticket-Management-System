import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { authKeys } from '@/features/auth/auth-context'
import { errorMessage } from '@/lib/errors'
import { createUser, listUsers, resetUserPassword, setUserActive, updateUser } from './api'

export const userKeys = {
  all: ['users'] as const,
  list: () => [...userKeys.all, 'list'] as const,
}

export function useUsers() {
  return useQuery({ queryKey: userKeys.list(), queryFn: listUsers })
}

function useUserMutation<TVars>(fn: (v: TVars) => Promise<unknown>, successMessage: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(successMessage)
      void queryClient.invalidateQueries({ queryKey: userKeys.all })
      void queryClient.invalidateQueries({ queryKey: authKeys.profile(undefined).slice(0, 2) })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export const useCreateUser = () => useUserMutation(createUser, 'User created')
export const useUpdateUser = () => useUserMutation(updateUser, 'User updated')
export const useSetUserActive = () =>
  useUserMutation((v: { user_id: string; is_active: boolean }) => setUserActive(v.user_id, v.is_active), 'User status updated')
export const useResetUserPassword = () =>
  useUserMutation((v: { user_id: string; password: string }) => resetUserPassword(v.user_id, v.password), 'Password reset')
