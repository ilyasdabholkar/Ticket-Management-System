import { useDraggable } from '@dnd-kit/core'
import { TICKET_CATEGORY_META, canChangeTicketStatus, formatEffort, isFinalStatus } from '@tms/shared'
import { Clock, Lock } from 'lucide-react'
import { forwardRef, type HTMLAttributes, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { PriorityBadge } from '@/components/shared/ticket-badges'
import { UserAvatar } from '@/components/shared/user-avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/features/auth/auth-context'
import type { TicketListItem } from '@/features/tickets/api'
import { timeAgo } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  ticket: TicketListItem
  effortMinutes?: number
  dragging?: boolean
  overlay?: boolean
}

/** Visual card, shared by the draggable card and the drag overlay. */
export const TicketCardBody = forwardRef<HTMLDivElement, CardBodyProps>(function TicketCardBody(
  { ticket, effortMinutes, dragging, overlay, className, ...rest },
  ref,
) {
  const locked = isFinalStatus(ticket.status)
  return (
    <div
      ref={ref}
      className={cn(
        'bg-card group rounded-lg border p-3 text-left shadow-xs transition-shadow',
        'hover:shadow-md',
        dragging && 'opacity-40',
        overlay && 'rotate-1 shadow-lg ring-primary/30 ring-2',
        className,
      )}
      {...rest}
    >
      <div className="flex items-center justify-between gap-2">
        <Link
          to={`/tickets/${ticket.ticket_number}`}
          className="text-muted-foreground hover:text-foreground font-mono text-xs font-medium hover:underline"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {ticket.ticket_number}
        </Link>
        <span className="text-muted-foreground flex items-center gap-1 text-[0.7rem]">
          {locked && <Lock className="size-3" aria-label="Locked" />}
          {TICKET_CATEGORY_META[ticket.category].prefix}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-medium">{ticket.title}</p>
      {ticket.application && <p className="text-muted-foreground mt-1 truncate text-xs">{ticket.application.name}</p>}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <PriorityBadge priority={ticket.priority} />
          {!!effortMinutes && (
            <span className="text-muted-foreground flex items-center gap-0.5 text-[0.7rem] tabular-nums" title="Total logged effort">
              <Clock className="size-3" aria-hidden />
              {formatEffort(effortMinutes)}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground text-[0.7rem] whitespace-nowrap" title={new Date(ticket.updated_at).toLocaleString()}>
            {timeAgo(ticket.updated_at)}
          </span>
          {ticket.assignee ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <UserAvatar name={ticket.assignee.full_name} className="size-6 text-[0.6rem]" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{ticket.assignee.full_name}</TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-muted-foreground border-muted-foreground/40 flex size-6 items-center justify-center rounded-full border border-dashed text-[0.6rem]" title="Unassigned">
              ?
            </span>
          )}
        </div>
      </div>
    </div>
  )
})

export function DraggableTicketCard({ ticket, effortMinutes }: { ticket: TicketListItem; effortMinutes?: number }) {
  const navigate = useNavigate()
  const { profile, isAdmin } = useAuth()
  const locked = isFinalStatus(ticket.status)
  // Only an admin, the creator or the assignee may move it (also enforced by transition_ticket_status).
  const allowed = canChangeTicketStatus(ticket, profile ? { id: profile.id, isAdmin } : null)
  const draggable = !locked && allowed
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: ticket.id,
    data: { ticket },
    disabled: !draggable,
  })
  // A click opens the ticket. Dragging only starts after the pointer moves 6px (PointerSensor
  // activation distance), so a drag never triggers this; links inside the card handle themselves.
  const open = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) return
    if (e.ctrlKey || e.metaKey) window.open(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/tickets/${ticket.ticket_number}`, '_blank')
    else navigate(`/tickets/${ticket.ticket_number}`)
  }
  return (
    <TicketCardBody
      ref={setNodeRef}
      ticket={ticket}
      effortMinutes={effortMinutes}
      dragging={isDragging}
      className="cursor-pointer"
      onClick={open}
      title={
        locked
          ? 'Click to open'
          : allowed
            ? 'Click to open · drag to change status'
            : 'Click to open · only the creator, the assignee or an admin can change its status'
      }
      aria-label={`${ticket.ticket_number}: ${ticket.title}`}
      {...attributes}
      {...listeners}
      aria-roledescription={locked ? 'Locked ticket' : draggable ? 'Draggable ticket' : 'Read-only ticket'}
    />
  )
}
