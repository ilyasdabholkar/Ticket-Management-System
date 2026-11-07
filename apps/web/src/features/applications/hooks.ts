import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import {
  archiveApplication,
  createApplication,
  getApplication,
  listApplications,
  restoreApplication,
  updateApplication,
  type ApplicationInput,
} from './api'

export const applicationKeys = {
  all: ['applications'] as const,
  list: () => [...applicationKeys.all, 'list'] as const,
  detail: (id: string) => [...applicationKeys.all, 'detail', id] as const,
}

export function useApplications() {
  return useQuery({ queryKey: applicationKeys.list(), queryFn: listApplications })
}

export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: applicationKeys.detail(id ?? ''),
    queryFn: () => getApplication(id!),
    enabled: !!id,
  })
}

function useApplicationMutation<TVars, TResult>(fn: (v: TVars) => Promise<TResult>, success: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(success)
      void queryClient.invalidateQueries({ queryKey: applicationKeys.all })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export const useCreateApplication = () => useApplicationMutation(createApplication, 'Application created')
export const useUpdateApplication = () =>
  useApplicationMutation((v: { id: string; input: Partial<ApplicationInput> }) => updateApplication(v.id, v.input), 'Application updated')
export const useArchiveApplication = () => useApplicationMutation(archiveApplication, 'Application archived')
export const useRestoreApplication = () => useApplicationMutation(restoreApplication, 'Application restored')
