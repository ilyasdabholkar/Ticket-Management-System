import { APP_ICON_KEYS } from '@tms/shared'
import { z } from 'zod'

export const applicationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  description: z
    .string()
    .trim()
    .max(2000, 'Description must be at most 2000 characters')
    .transform((v) => (v === '' ? null : v)),
  icon_key: z.enum(APP_ICON_KEYS),
  is_active: z.boolean(),
})

export type ApplicationFormInput = z.input<typeof applicationSchema>
export type ApplicationFormValues = z.output<typeof applicationSchema>
