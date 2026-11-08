import { DROP_REASON_MAX, TICKET_STATUS_LABELS, type TicketStatus } from '@tms/shared'
import { useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export type FinalStatus = Extract<TicketStatus, 'prod_deployed' | 'completed' | 'dropped'>

const COPY: Record<FinalStatus, { action: string; text: string }> = {
  prod_deployed: { action: 'Deploy and lock', text: 'Use this for work that has been released to production.' },
  completed: { action: 'Complete and lock', text: 'Use this for work that is finished without a production release, such as documents or analysis.' },
  dropped: { action: 'Drop and lock', text: 'Use this for work that has been cancelled and will not be done.' },
}

interface FinishTicketDialogProps {
  /** The ticket number being finished, or null to close the dialog. */
  ticketNumber: string | null
  status: FinalStatus | null
  onCancel: () => void
  onConfirm: (reason?: string) => void
}

/** Confirmation before a ticket moves to a final (locked) status. Dropped accepts an optional reason. */
export function FinishTicketDialog({ ticketNumber, status, onCancel, onConfirm }: FinishTicketDialogProps) {
  const [reason, setReason] = useState('')
  const open = !!ticketNumber && !!status
  const close = () => {
    setReason('')
    onCancel()
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent>
        {status && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Move {ticketNumber} to {TICKET_STATUS_LABELS[status]}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {COPY[status].text} The ticket will be <strong>locked</strong>: its status, details, attachments, comments, effort and board can no longer
                be changed. Only an administrator can make an audited correction or reopen it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {status === 'dropped' && (
              <div className="space-y-1.5">
                <Label htmlFor="drop-reason">Reason (optional)</Label>
                <Textarea
                  id="drop-reason"
                  rows={3}
                  maxLength={DROP_REASON_MAX}
                  placeholder="e.g. Requirement withdrawn by the client"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <p className="text-muted-foreground text-right text-xs tabular-nums">
                  {reason.length}/{DROP_REASON_MAX}
                </p>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={status === 'dropped' ? 'bg-destructive text-white hover:bg-destructive/90' : undefined}
                onClick={() => {
                  onConfirm(status === 'dropped' ? reason.trim() || undefined : undefined)
                  setReason('')
                }}
              >
                {COPY[status].action}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
