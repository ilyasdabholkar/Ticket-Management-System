import {
  TICKET_CATEGORY_META,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  formatEffort,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '@tms/shared'
import type { ActivityLog } from './api'

/** Human-readable activity text, shared by the ticket timeline and the dashboard feed. */
type Meta = Record<string, unknown>

export function describeActivity(log: Pick<ActivityLog, 'action' | 'actor_id' | 'metadata'>, userName: (id: unknown) => string, appName: (id: unknown) => string): string {
  const m = (log.metadata ?? {}) as Meta
  switch (log.action) {
    case 'created':
      return `created the ticket as ${m.ticket_number ?? ''}`
    case 'title_changed':
      return `changed the title to “${String(m.to ?? '')}”`
    case 'description_updated':
      return 'updated the description'
    case 'priority_changed':
      return `changed priority from ${TICKET_PRIORITY_LABELS[m.from as TicketPriority] ?? m.from} to ${TICKET_PRIORITY_LABELS[m.to as TicketPriority] ?? m.to}`
    case 'assigned':
      return m.to ? `assigned the ticket to ${userName(m.to)}` : 'unassigned the ticket'
    case 'application_changed':
      return `moved the ticket to ${m.to ? appName(m.to) : 'no application'}`
    case 'category_changed':
      return `changed category from ${TICKET_CATEGORY_META[m.from as TicketCategory]?.label ?? m.from} to ${TICKET_CATEGORY_META[m.to as TicketCategory]?.label ?? m.to} (${m.from_number} → ${m.to_number})`
    case 'status_changed':
      return `moved the ticket from ${TICKET_STATUS_LABELS[m.from as TicketStatus] ?? m.from} to ${TICKET_STATUS_LABELS[m.to as TicketStatus] ?? m.to}`
    case 'attachment_added':
      return `attached ${m.file_name}`
    case 'attachment_removed':
      return `removed attachment ${m.file_name}`
    case 'admin_correction': {
      const fields = Object.keys((m.changes as Meta | undefined) ?? {}).map((k) => k.replace(/_/g, ' '))
      return `made an admin correction (${fields.join(', ')}): “${String(m.reason ?? '')}”`
    }
    case 'comment_added':
      return 'added a comment'
    case 'comment_edited':
      return 'edited a comment'
    case 'comment_deleted':
      return m.moderated ? 'removed a comment (moderation)' : 'deleted a comment'
    case 'comment_restored':
      return 'restored a comment'
    case 'effort_added':
      return `logged ${formatEffort(Number(m.minutes ?? 0))}${m.user_id && m.user_id !== log.actor_id ? ` for ${userName(m.user_id)}` : ''} (${m.effort_date})`
    case 'effort_updated': {
      const from = m.from as Meta | undefined
      const to = m.to as Meta | undefined
      return `changed effort from ${formatEffort(Number(from?.minutes ?? 0))} to ${formatEffort(Number(to?.minutes ?? 0))}`
    }
    case 'effort_deleted':
      return `deleted an effort entry of ${formatEffort(Number(m.minutes ?? 0))}`
    case 'effort_restored':
      return `restored an effort entry of ${formatEffort(Number(m.minutes ?? 0))}`
    case 'soft_deleted':
      return 'deleted the ticket'
    case 'restored':
      return 'restored the ticket'
    default:
      return log.action.replace(/_/g, ' ')
  }
}
