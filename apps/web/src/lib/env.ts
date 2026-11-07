import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  VITE_BASE_PATH: z.string().default('/'),
})

const parsed = envSchema.safeParse(import.meta.env)

if (!parsed.success) {
  // Fail loudly at startup instead of producing confusing network errors later.
  throw new Error(
    `Invalid environment configuration. Copy .env.example to .env at the repo root and fill it in.\n${z.prettifyError(parsed.error)}`,
  )
}

export const env = parsed.data
