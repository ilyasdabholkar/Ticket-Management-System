import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export const EMAIL_PURPOSES = {
  development_update: 'Development update',
  completion_update: 'Task completion update',
  qa_deployment: 'QA deployment update',
  prod_deployment: 'Production deployment update',
  issue_update: 'Issue / bug update',
  support_response: 'Support response',
  technical_explanation: 'Technical explanation',
  general_update: 'General update',
} as const
export const EMAIL_TONES = { professional: 'Professional', formal: 'Formal', friendly: 'Friendly', concise: 'Concise', technical: 'Technical' } as const
export const EMAIL_TECHNICALITY = { non_technical: 'Non-technical', semi_technical: 'Semi-technical', highly_technical: 'Highly technical' } as const
export const EMAIL_LENGTHS = { short: 'Short', medium: 'Medium', detailed: 'Detailed' } as const

export interface EmailOptions {
  purpose: keyof typeof EMAIL_PURPOSES
  tone: keyof typeof EMAIL_TONES
  technicality: keyof typeof EMAIL_TECHNICALITY
  length: keyof typeof EMAIL_LENGTHS
  instructions: string
}
export interface EmailDraft {
  subject: string
  body: string
  used_context: string[]
}
export interface TicketSummary {
  overview: string
  completed_work: string[]
  technical_details: string[]
  current_status: string
  pending_activities: string[]
  important_notes: string[]
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('ai-assistant', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(payload?.error ?? 'The AI request failed.')
    }
    throw new Error('Could not reach the AI service.')
  }
  return data as T
}

export const generateEmail = (ticketId: string, options: EmailOptions) =>
  invoke<{ email: EmailDraft }>({ action: 'email', ticket_id: ticketId, options }).then((r) => r.email)

export const generateSummary = (ticketId: string) =>
  invoke<{ summary: TicketSummary }>({ action: 'summary', ticket_id: ticketId }).then((r) => r.summary)

export function summaryToText(s: TicketSummary) {
  const list = (title: string, items: string[]) => (items.length ? `${title}\n${items.map((i) => `- ${i}`).join('\n')}\n` : '')
  return [
    `Task Overview\n${s.overview}\n`,
    list('Work Completed', s.completed_work),
    list('Technical Details', s.technical_details),
    `Current Status\n${s.current_status}\n`,
    list('Pending Activities', s.pending_activities),
    list('Important Notes', s.important_notes),
  ]
    .filter(Boolean)
    .join('\n')
    .trim()
}
