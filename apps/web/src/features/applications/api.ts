import type { Tables } from '@tms/shared'
import { supabase } from '@/lib/supabase'

export type Application = Tables<'applications'>

export interface ApplicationInput {
  name: string
  description: string | null
  icon_key: string
  is_active: boolean
}

/** Every application the caller may see, archived ones included (filtered in the UI). */
export async function listApplications(): Promise<Application[]> {
  const { data, error } = await supabase.from('applications').select('*').order('name')
  if (error) throw error
  return data
}

export async function getApplication(id: string): Promise<Application | null> {
  const { data, error } = await supabase.from('applications').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createApplication(input: ApplicationInput): Promise<Application> {
  const { data, error } = await supabase.from('applications').insert(input).select().single()
  if (error) throw friendly(error)
  return data
}

export async function updateApplication(id: string, input: Partial<ApplicationInput>): Promise<void> {
  const { data, error } = await supabase.from('applications').update(input).eq('id', id).select('id')
  if (error) throw friendly(error)
  if (!data?.length) throw new Error('Application could not be updated. It may be archived or you may lack permission.')
}

export async function archiveApplication(id: string): Promise<void> {
  const { error } = await supabase.rpc('archive_application', { p_application_id: id })
  if (error) throw error
}

export async function restoreApplication(id: string): Promise<void> {
  const { error } = await supabase.rpc('restore_application', { p_application_id: id })
  if (error) throw error
}

function friendly(error: { code?: string; message: string }) {
  if (error.code === '23505') return new Error('An application with this name already exists.')
  return error
}
