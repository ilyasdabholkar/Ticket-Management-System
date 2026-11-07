import { USER_ROLES } from '@tms/shared'
import { z } from 'zod'
import { passwordSchema } from '@/features/auth/schemas'

const base = {
  full_name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
  email: z.email('Enter a valid email address').trim().toLowerCase(),
  roles: z.array(z.enum(USER_ROLES)).min(1, 'Select at least one role'),
}

export const createUserSchema = z.object({ ...base, password: passwordSchema })
export type CreateUserValues = z.infer<typeof createUserSchema>

export const editUserSchema = z.object(base)
export type EditUserValues = z.infer<typeof editUserSchema>

export const resetPasswordSchema = z.object({ password: passwordSchema })
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
