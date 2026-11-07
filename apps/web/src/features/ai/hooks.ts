import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { generateEmail, generateSummary, type EmailOptions } from './api'

/** Manual, user-triggered generation only. Results live in component state and are never stored. */
export const useGenerateEmail = () =>
  useMutation({ mutationFn: ({ ticketId, options }: { ticketId: string; options: EmailOptions }) => generateEmail(ticketId, options) })

export const useGenerateSummary = () => useMutation({ mutationFn: (ticketId: string) => generateSummary(ticketId) })

export async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch {
    toast.error('Could not copy to the clipboard')
  }
}
