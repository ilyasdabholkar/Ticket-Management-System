import { TICKET_STATUSES, TICKET_STATUS_LABELS, canChangeTicketStatus, canTransition, isFinalStatus, type TicketStatus } from '@tms/shared'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { StatusBadge } from '@/components/shared/ticket-badges'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/auth-context'
import type { Ticket } from '../api'
import { useTransitionStatus } from '../hooks'
import { FinishTicketDialog, type FinalStatus } from './finish-ticket-dialog'

/** Status dropdown that only offers allowed transitions; final statuses ask for confirmation (Dropped: optional reason). */
export function StatusControl({ ticket, disabled }: { ticket: Ticket; disabled?: boolean }) {
  const { profile, isAdmin } = useAuth()
  const allowed = canChangeTicketStatus(ticket, profile ? { id: profile.id, isAdmin } : null)
  const transition = useTransitionStatus()
  const [finishing, setFinishing] = useState<FinalStatus | null>(null)
  const options = TICKET_STATUSES.filter((s) => canTransition(ticket.status, s))
  const open = options.filter((s) => !isFinalStatus(s))
  const final = options.filter((s) => isFinalStatus(s))

  const go = (to: TicketStatus, reason?: string) =>
    transition.mutate({ id: ticket.id, status: to, ticketNumber: ticket.ticket_number, reason })

  if (!disabled && !allowed && !isFinalStatus(ticket.status)) {
    return (
      <span className="inline-flex items-center gap-1.5" title="Only the creator, the assignee or an admin can change the status">
        <StatusBadge status={ticket.status} />
        <span className="text-muted-foreground text-xs">Creator, assignee or admin only</span>
      </span>
    )
  }
  if (disabled || options.length === 0) return <StatusBadge status={ticket.status} />

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1 px-2" disabled={transition.isPending} aria-label="Change status">
            {transition.isPending ? <Loader2 className="animate-spin" /> : <StatusBadge status={ticket.status} className="border-0 bg-transparent p-0" />}
            <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Move to</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {open.map((s) => (
            <DropdownMenuItem key={s} onSelect={() => go(s)}>
              {TICKET_STATUS_LABELS[s]}
            </DropdownMenuItem>
          ))}
          {final.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Finish (locks the ticket)</DropdownMenuLabel>
              {final.map((s) => (
                <DropdownMenuItem key={s} variant={s === 'dropped' ? 'destructive' : 'default'} onSelect={() => setFinishing(s as FinalStatus)}>
                  {TICKET_STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <FinishTicketDialog
        ticketNumber={finishing ? ticket.ticket_number : null}
        status={finishing}
        onCancel={() => setFinishing(null)}
        onConfirm={(reason) => {
          if (finishing) go(finishing, reason)
          setFinishing(null)
        }}
      />
    </>
  )
}
