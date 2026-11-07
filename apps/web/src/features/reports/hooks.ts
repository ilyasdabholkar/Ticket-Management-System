import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import {
  getEffortReport,
  getHeaderImagePreviewUrl,
  getReportSettings,
  updateReportSettings,
  uploadHeaderImage,
  type ReportParams,
  type ReportSettings,
} from './api'

export const reportKeys = {
  settings: ['report-settings'] as const,
  headerPreview: (path: string | null) => ['report-settings', 'header', path] as const,
  report: (p: ReportParams) => ['reports', p] as const,
}

export const useReportSettings = () => useQuery({ queryKey: reportKeys.settings, queryFn: getReportSettings })

export const useHeaderPreview = (path: string | null | undefined) =>
  useQuery({
    queryKey: reportKeys.headerPreview(path ?? null),
    queryFn: () => getHeaderImagePreviewUrl(path ?? null),
    enabled: path !== undefined,
    staleTime: 50 * 60_000,
  })

/** Report data is fetched on demand (Generate), not on every filter change. */
export const useEffortReport = (params: ReportParams | null) =>
  useQuery({ queryKey: reportKeys.report(params ?? { userId: '', start: '', end: '' }), queryFn: () => getEffortReport(params!), enabled: !!params })

export function useUpdateReportSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Pick<ReportSettings, 'company_name' | 'report_title' | 'footer_text' | 'header_image_path'>>) =>
      updateReportSettings(patch),
    onSuccess: () => {
      toast.success('Report settings saved')
      void queryClient.invalidateQueries({ queryKey: reportKeys.settings })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useUploadHeaderImage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => uploadHeaderImage(file),
    onSuccess: () => {
      toast.success('Header image updated')
      void queryClient.invalidateQueries({ queryKey: reportKeys.settings })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}
