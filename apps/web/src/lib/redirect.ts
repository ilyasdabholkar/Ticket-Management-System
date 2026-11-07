/** Only allow same-app relative redirects (prevents open redirects). */
export function safeRedirect(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}
