import { TICKET_CATEGORIES, TICKET_CATEGORY_META, TICKET_PRIORITIES } from '@tms/shared'
import type { JSONContent } from '@tiptap/react'
import { z } from 'zod'

export const ticketFormSchema = z
  .object({
    category: z.enum(TICKET_CATEGORIES),
    application_id: z.string().uuid().nullable(),
    title: z.string().trim().min(1, 'Title is required').max(255, 'Title must be at most 255 characters'),
    description: z.custom<JSONContent | null>().nullable(),
    priority: z.enum(TICKET_PRIORITIES),
    assigned_to: z.string().uuid().nullable(),
  })
  .refine((v) => !TICKET_CATEGORY_META[v.category].requiresApplication || !!v.application_id, {
    path: ['application_id'],
    message: 'Development and Support tickets require an application',
  })

export type TicketFormValues = z.infer<typeof ticketFormSchema>

export const titleSchema = ticketFormSchema.shape.title
