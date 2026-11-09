// Domain constants shared across the monorepo. Values mirror the PostgreSQL enums.

export const USER_ROLES = ['admin', 'employee'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const TICKET_CATEGORIES = ['development', 'support', 'rnd', 'analysis', 'issue', 'bug_fix'] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]

export const TICKET_CATEGORY_META: Record<
  TicketCategory,
  { label: string; prefix: string; requiresApplication: boolean }
> = {
  development: { label: 'Development', prefix: 'DEV', requiresApplication: true },
  support: { label: 'Support', prefix: 'SUP', requiresApplication: true },
  rnd: { label: 'R&D', prefix: 'RND', requiresApplication: false },
  analysis: { label: 'Analysis', prefix: 'ANL', requiresApplication: true },
  issue: { label: 'Issue', prefix: 'ISS', requiresApplication: true },
  bug_fix: { label: 'Bug Fix', prefix: 'BUG', requiresApplication: true },
}

export const TICKET_STATUSES = ['development', 'in_progress', 'qa_deployed', 'prod_deployed', 'completed', 'dropped'] as const

/** Final statuses lock the ticket (mirrors private.is_final_status). */
export const FINAL_TICKET_STATUSES = ['prod_deployed', 'completed', 'dropped'] as const
export const isFinalStatus = (s: TicketStatus) => (FINAL_TICKET_STATUSES as readonly string[]).includes(s)
export const DROP_REASON_MAX = 500
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  development: 'Development',
  in_progress: 'In Progress',
  qa_deployed: 'QA Deployed',
  prod_deployed: 'Prod Deployed',
  completed: 'Completed',
  dropped: 'Dropped',
}

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

export const EFFORT_UNITS = ['minutes', 'hours'] as const
export type EffortUnit = (typeof EFFORT_UNITS)[number]

export const KB_CATEGORIES = [
  'requirements',
  'technical_documentation',
  'database_queries',
  'api_documentation',
  'release_notes',
  'kt_documents',
  'sample_io',
  'troubleshooting',
  'general_notes',
] as const
export type KbCategory = (typeof KB_CATEGORIES)[number]

export const KB_CATEGORY_LABELS: Record<KbCategory, string> = {
  requirements: 'Requirements',
  technical_documentation: 'Technical Documentation',
  database_queries: 'Database Queries',
  api_documentation: 'API Documentation',
  release_notes: 'Release Notes',
  kt_documents: 'KT Documents',
  sample_io: 'Sample Inputs / Outputs',
  troubleshooting: 'Troubleshooting',
  general_notes: 'General Notes',
}

/** Organisation timezone for date-range boundaries (Q8). */
export const ORG_TIMEZONE = 'Asia/Kolkata'

/** Bundled application icon keys (decision Q16). DB check: ^[a-z0-9-]{1,40}$ */
export const APP_ICON_KEYS = [
  'app-window', 'globe', 'smartphone', 'monitor', 'server', 'database', 'cloud', 'code',
  'cpu', 'layers', 'package', 'boxes', 'shopping-cart', 'credit-card', 'landmark', 'wallet',
  'users', 'building', 'briefcase', 'file-text', 'mail', 'message-square', 'chart', 'shield',
  'wrench', 'truck', 'heart-pulse', 'graduation-cap', 'calendar', 'bell',
] as const
export type AppIconKey = (typeof APP_ICON_KEYS)[number]

/** Ticket attachment rules (spec §5.6). Mirrors private.allowed_attachment_ext and the bucket config. */
export const ATTACHMENT_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  sql: 'application/sql',
  json: 'application/json',
  zip: 'application/zip',
}
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const INLINE_IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const
export const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024

export function fileExtension(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name)
  return m?.[1]?.toLowerCase() ?? ''
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Workflow rules, mirrored by public.transition_ticket_status():
 * free movement among the open statuses; Prod Deployed only from QA Deployed; Completed from In Progress or
 * QA Deployed; Dropped from any open status. Final statuses (Prod Deployed, Completed, Dropped) are locked.
 */
/**
 * Who may change a ticket's status (mirrors private.can_change_status): an admin, the ticket's creator or its assignee.
 * The database enforces this; the UI uses it to disable dragging and the status menu.
 */
export function canChangeTicketStatus(
  ticket: { created_by: string; assigned_to: string | null },
  user: { id: string; isAdmin: boolean } | null | undefined,
): boolean {
  if (!user) return false
  return user.isAdmin || ticket.created_by === user.id || ticket.assigned_to === user.id
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false
  if (isFinalStatus(from)) return false
  if (to === 'prod_deployed') return from === 'qa_deployed'
  if (to === 'completed') return from === 'in_progress' || from === 'qa_deployed'
  return true
}

/** Board month helpers. A board is identified by the first day of its month (YYYY-MM-01). */
export const boardMonthOf = (isoDate: string) => `${isoDate.slice(0, 7)}-01`
export function shiftBoardMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}
export function formatBoardMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(' ', '-')
}

/** Today's date (YYYY-MM-DD) in the organisation timezone; mirrors private.org_today(). */
export function orgToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ORG_TIMEZONE }).format(new Date())
}

/** Max minutes in one effort entry (DB constraint effort_logs_minutes_range). */
export const MAX_EFFORT_MINUTES_PER_ENTRY = 1440

export const KB_DOCUMENT_TYPES = ['note', 'document'] as const
export type KbDocumentType = (typeof KB_DOCUMENT_TYPES)[number]
export const KB_DOCUMENT_TYPE_LABELS: Record<KbDocumentType, string> = { note: 'Note', document: 'Document' }

/** Knowledge base upload rules (spec §10.1); mirrors private.allowed_kb_ext and the bucket. */
export const KB_MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  sql: 'application/sql',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}
/** File types whose text is extracted for search. Only .txt (decision change, replaces Q10); all others are title-only. */
export const KB_EXTRACTABLE_EXTS = ['txt'] as const

/** Search snippet highlight markers emitted by public.search_knowledge_base (U+E000 / U+E001). */
export const SNIPPET_START = ''
export const SNIPPET_END = ''

/** Multi-role (user request 2026-11-07): a user holds one or both roles. */
export const USER_ROLE_META: Record<UserRole, { label: string; description: string }> = {
  admin: { label: 'Admin', description: 'Administration: users, applications, knowledge base, settings, corrections, all effort.' },
  employee: { label: 'Employee', description: 'Ticket work: can be assigned tickets, logs own effort, appears in employee lists and reports.' },
}

export const hasRole = (roles: readonly string[] | null | undefined, role: UserRole) => !!roles?.includes(role)
