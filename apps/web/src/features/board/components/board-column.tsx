import { useDroppable } from '@dnd-kit/core'
import { TICKET_STATUS_LABELS, type TicketStatus } from '@tms/shared'
import { Lock } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { TicketListItem } from '@/features/tickets/api'
import { cn } from '@/lib/utils'
import { DraggableTicketCard } from './ticket-card'

const ACCENT: Record<TicketStatus, string> = {
  development: 'bg-zinc-400',
  in_progress: 'bg-blue-500',
  qa_deployed: 'bg-violet-500',
  prod_deployed: 'bg-emerald-500',
}

interface BoardColumnProps {
  status: TicketStatus
  tickets: TicketListItem[]
  /** null = nothing being dragged; true/false = whether the dragged card may drop here. */
  dropAllowed: boolean | null
  footer?: string
  effortTotals?: Map<string, number>
}

export function BoardColumn({ status, tickets, dropAllowed, footer, effortTotals }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: dropAllowed === false })

  return (
    <section
      aria-label={`${TICKET_STATUS_LABELS[status]} column`}
      className={cn(
        'bg-muted/50 flex w-72 shrink-0 flex-col rounded-xl border transition-colors sm:w-80 lg:w-auto lg:min-w-0 lg:flex-1',
        dropAllowed === true && 'border-primary/40 border-dashed',
        dropAllowed === false && 'opacity-60',
        isOver && dropAllowed && 'bg-primary/5 border-primary',
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className={cn('size-2 rounded-full', ACCENT[status])} aria-hidden />
        <h2 className="text-xs font-semibold tracking-wide uppercase">{TICKET_STATUS_LABELS[status]}</h2>
        {status === 'prod_deployed' && <Lock className="text-muted-foreground size-3" aria-label="Locked column" />}
        <span className="text-muted-foreground bg-background ml-auto rounded-full px-2 py-0.5 text-xs tabular-nums">{tickets.length}</span>
      </header>
      <div ref={setNodeRef} className="flex min-h-32 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 lg:max-h-[calc(100svh-18rem)]">
        <AnimatePresence initial={false}>
          {tickets.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
            >
              <DraggableTicketCard ticket={t} effortMinutes={effortTotals?.get(t.id)} />
            </motion.div>
          ))}
        </AnimatePresence>
        {tickets.length === 0 && (
          <p className="text-muted-foreground flex flex-1 items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-xs">
            {dropAllowed ? 'Drop here' : 'No tickets'}
          </p>
        )}
      </div>
      {footer && <p className="text-muted-foreground px-3 pb-2 text-[0.7rem]">{footer}</p>}
    </section>
  )
}
