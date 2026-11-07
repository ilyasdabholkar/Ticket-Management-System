import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Enter a valid email address').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')

export const changePasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>

export const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
})
export type ProfileValues = z.infer<typeof profileSchema>
