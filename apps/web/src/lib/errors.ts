/** Extracts a readable message from Error, PostgrestError, AuthError or unknown values. */
export function errorMessage(error: unknown): string {
  if (!error) return 'Something went wrong.'
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
  return String(error)
}
