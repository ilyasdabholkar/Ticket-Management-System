import { TICKET_STATUSES, TICKET_STATUS_LABELS, canTransition, type TicketStatus } from '@tms/shared'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { StatusBadge } from '@/components/shared/ticket-badges'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Ticket } from '../api'
import { useTransitionStatus } from '../hooks'

/** Status dropdown that only offers allowed transitions; Prod Deployed asks for confirmation. */
export function StatusControl({ ticket, disabled }: { ticket: Ticket; disabled?: boolean }) {
  const transition = useTransitionStatus()
  const [confirm, setConfirm] = useState(false)
  const options = TICKET_STATUSES.filter((s) => canTransition(ticket.status, s))

  const go = (to: TicketStatus) => transition.mutate({ id: ticket.id, status: to, ticketNumber: ticket.ticket_number })

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
          {options.map((s) => (
            <DropdownMenuItem key={s} onSelect={() => (s === 'prod_deployed' ? setConfirm(true) : go(s))}>
              {TICKET_STATUS_LABELS[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {ticket.ticket_number} to Prod Deployed?</AlertDialogTitle>
            <AlertDialogDescription>
              The ticket will be <strong>locked</strong> and cannot be moved back. Only an administrator can make an audited correction.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => go('prod_deployed')}>Deploy and lock</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
