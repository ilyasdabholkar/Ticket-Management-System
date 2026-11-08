import { boardMonthOf, formatBoardMonth, isFinalStatus, orgToday, shiftBoardMonth, type TicketStatus } from '@tms/shared'
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMoveTicketBoard } from '../hooks'

export const currentBoardMonth = () => boardMonthOf(orgToday())

/** Months offered in pickers: 12 back and 6 ahead of today, plus the given month if it falls outside. */
export function boardMonthOptions(include?: string): string[] {
  const now = currentBoardMonth()
  const list = Array.from({ length: 19 }, (_, i) => shiftBoardMonth(now, 6 - i))
  if (include && !list.includes(include)) list.push(include)
  return list.sort().reverse()
}

/** ‹ Nov-2026 › picker for the monthly board. */
export function BoardMonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  const current = currentBoardMonth()
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Board month">
      <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => onChange(shiftBoardMonth(value, -1))}>
        <ChevronLeft />
      </Button>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-36 font-medium" aria-label="Select board month">
          <CalendarDays className="size-4" />
          <SelectValue>{formatBoardMonth(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {boardMonthOptions(value).map((m) => (
            <SelectItem key={m} value={m}>
              {formatBoardMonth(m)}
              {m === current ? ' (current)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="icon" aria-label="Next month" onClick={() => onChange(shiftBoardMonth(value, 1))}>
        <ChevronRight />
      </Button>
      {value !== current && (
        <Button variant="ghost" size="sm" onClick={() => onChange(current)}>
          This month
        </Button>
      )}
    </div>
  )
}

interface MoveBoardDialogProps {
  ticket: { id: string; ticket_number: string; board_month: string; status: TicketStatus } | null
  onOpenChange: (open: boolean) => void
}

/** Moves a ticket to another monthly board. Finished (locked) tickets cannot move. */
export function MoveBoardDialog({ ticket, onOpenChange }: MoveBoardDialogProps) {
  const move = useMoveTicketBoard()
  const [target, setTarget] = useState<string | null>(null)
  const value = target ?? ticket?.board_month ?? currentBoardMonth()
  const locked = ticket ? isFinalStatus(ticket.status) : false

  const close = (o: boolean) => {
    if (!o) setTarget(null)
    onOpenChange(o)
  }

  return (
    <Dialog open={!!ticket} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move {ticket?.ticket_number} to another board</DialogTitle>
          <DialogDescription>
            {locked
              ? 'This ticket is finished and locked, so it stays on its board. An administrator can correct it if needed.'
              : `Currently on the ${ticket ? formatBoardMonth(ticket.board_month) : ''} board. Its status, comments and effort stay the same.`}
          </DialogDescription>
        </DialogHeader>
        {!locked && (
          <div className="space-y-1.5">
            <Label htmlFor="move-board">Board</Label>
            <Select value={value} onValueChange={setTarget}>
              <SelectTrigger id="move-board" className="w-full">
                <SelectValue>{formatBoardMonth(value)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {boardMonthOptions(ticket?.board_month).map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatBoardMonth(m)}
                    {m === ticket?.board_month ? ' (current board)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {locked ? 'Close' : 'Cancel'}
          </Button>
          {!locked && (
            <Button
              disabled={!ticket || value === ticket.board_month || move.isPending}
              onClick={() =>
                ticket && move.mutate({ id: ticket.id, boardMonth: value, ticketNumber: ticket.ticket_number }, { onSuccess: () => close(false) })
              }
            >
              {move.isPending && <Loader2 className="animate-spin" />} Move ticket
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
