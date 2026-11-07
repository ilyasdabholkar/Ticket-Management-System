import { KB_CATEGORIES, KB_DOCUMENT_TYPES } from '@tms/shared'
import type { JSONContent } from '@tiptap/react'
import { z } from 'zod'

export const kbFormSchema = z.object({
  application_id: z.string().uuid('Select an application'),
  title: z.string().trim().min(1, 'Title is required').max(255, 'At most 255 characters'),
  description: z
    .string()
    .trim()
    .max(2000, 'At most 2000 characters')
    .transform((v) => (v === '' ? null : v)),
  document_type: z.enum(KB_DOCUMENT_TYPES),
  category: z.enum(KB_CATEGORIES),
  content: z.custom<JSONContent | null>().nullable(),
})

export type KbFormInput = z.input<typeof kbFormSchema>
export type KbFormValues = z.output<typeof kbFormSchema>
