import type { TicketCategory, TicketStatus } from '@tms/shared'
import type { Tables } from '@tms/shared'
import { fileExtension } from '@tms/shared'
import { supabase } from '@/lib/supabase'
import { createSignedUrl, uploadWithProgress } from '@/services/storage'

export const REPORT_ASSETS_BUCKET = 'report-assets'
export const MAX_HEADER_IMAGE_BYTES = 2 * 1024 * 1024

export type ReportSettings = Tables<'report_settings'>

export interface ReportRow {
  ticket_id: string
  ticket_number: string
  title: string
  application_name: string | null
  category: TicketCategory
  status: TicketStatus
  effort_minutes: number
  started_on: string | null
  qa_deployed_on: string | null
  prod_deployed_on: string | null
  created_in_range: boolean
  effort_in_range: boolean
}

export async function getReportSettings(): Promise<ReportSettings> {
  const { data, error } = await supabase.from('report_settings').select('*').eq('id', true).single()
  if (error) throw error
  return data
}

export async function updateReportSettings(patch: Partial<Pick<ReportSettings, 'company_name' | 'report_title' | 'footer_text' | 'header_image_path'>>) {
  const { data, error } = await supabase.from('report_settings').update(patch).eq('id', true).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('Report settings could not be updated.')
}

/** Uploads a PNG/JPEG header image and points the settings at it. The previous object is retained. */
export async function uploadHeaderImage(file: File, onProgress?: (p: number) => void) {
  const ext = fileExtension(file.name)
  if (!['png', 'jpg', 'jpeg'].includes(ext)) throw new Error('The header image must be a PNG or JPEG file.')
  if (file.size > MAX_HEADER_IMAGE_BYTES) throw new Error('The header image must be 2 MB or smaller.')
  const path = `header/${crypto.randomUUID()}.${ext}`
  await uploadWithProgress({ bucket: REPORT_ASSETS_BUCKET, path, file, onProgress })
  await updateReportSettings({ header_image_path: path })
}

/**
 * Header image as a data URL so @react-pdf can embed it without a cross-origin fetch at render time.
 * Returns null when no image is configured or it cannot be loaded (the PDF is still generated).
 */
export async function getHeaderImageDataUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  try {
    const url = await createSignedUrl(REPORT_ASSETS_BUCKET, path, 120)
    const blob = await (await fetch(url)).blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function getHeaderImagePreviewUrl(path: string | null) {
  return path ? createSignedUrl(REPORT_ASSETS_BUCKET, path, 3600) : null
}

export interface ReportParams {
  userId: string
  start: string
  end: string
  applicationId?: string | null
}

export async function getEffortReport(p: ReportParams): Promise<ReportRow[]> {
  const { data, error } = await supabase.rpc('get_effort_report', {
    p_user_id: p.userId,
    p_start: p.start,
    p_end: p.end,
    ...(p.applicationId ? { p_application_id: p.applicationId } : {}),
  })
  if (error) throw error
  return (data ?? []).map((r) => ({ ...r, effort_minutes: Number(r.effort_minutes) }))
}
