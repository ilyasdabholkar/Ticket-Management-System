import { EFFORT_UNITS, MAX_EFFORT_MINUTES_PER_ENTRY, orgToday, toEffortMinutes } from '@tms/shared'
import { z } from 'zod'

export const effortFormSchema = z
  .object({
    effort_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a date')
      .refine((d) => d <= orgToday(), 'The date cannot be in the future'),
    effort_value: z.coerce
      .number<number>({ error: 'Enter a number' })
      .positive('Effort must be greater than zero')
      .multipleOf(0.01, 'Use at most two decimals'),
    effort_unit: z.enum(EFFORT_UNITS),
    description: z
      .string()
      .trim()
      .max(2000, 'At most 2000 characters')
      .transform((v) => (v === '' ? null : v)),
    user_id: z.string().uuid().optional(),
  })
  .refine((v) => v.effort_unit !== 'minutes' || Number.isInteger(v.effort_value), {
    path: ['effort_value'],
    message: 'Minutes must be a whole number',
  })
  .refine((v) => {
    const m = toEffortMinutes(v.effort_value, v.effort_unit)
    return m >= 1 && m <= MAX_EFFORT_MINUTES_PER_ENTRY
  }, { path: ['effort_value'], message: 'A single entry must be between 1 minute and 24 hours' })

export type EffortFormInput = z.input<typeof effortFormSchema>
export type EffortFormValues = z.output<typeof effortFormSchema>
