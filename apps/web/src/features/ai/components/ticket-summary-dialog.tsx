import { Copy, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { summaryToText } from '../api'
import { copyText, useGenerateSummary } from '../hooks'

function Section({ title, items, text }: { title: string; items?: string[]; text?: string }) {
  if (!text && !items?.length) return null
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {text ? (
        <p className="text-sm leading-relaxed">{text}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">{items?.map((i, n) => <li key={n}>{i}</li>)}</ul>
      )}
    </section>
  )
}

export function TicketSummaryDialog({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(false)
  const gen = useGenerateSummary()
  const s = gen.data
  const run = () => gen.mutate(ticketId)

  return (
    <>
      <Button
        size="sm"
        className="btn-action btn-ai-summary"
        onClick={() => {
          setOpen(true)
          if (!gen.data && !gen.isPending) run() // first open generates; later opens reuse until Regenerate
        }}
      >
        <Sparkles /> Generate Summary
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="size-4" /> Ticket summary</DialogTitle>
            <DialogDescription>AI-generated from the description, comments, history and effort. Check it against the ticket. It is not saved.</DialogDescription>
          </DialogHeader>
          {gen.isPending ? (
            <div className="space-y-3" aria-busy>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : gen.isError ? (
            <ErrorState title="Could not generate the summary" error={gen.error} onRetry={run} className="py-6" />
          ) : s ? (
            <div className="space-y-4">
              <Section title="Task Overview" text={s.overview} />
              <Section title="Work Completed" items={s.completed_work.length ? s.completed_work : ['No completed work is recorded yet.']} />
              <Section title="Technical Details" items={s.technical_details} />
              <Section title="Current Status" text={s.current_status} />
              <Section title="Pending Activities" items={s.pending_activities} />
              <Section title="Important Notes" items={s.important_notes} />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={run} disabled={gen.isPending}>
              {gen.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate
            </Button>
            <Button disabled={!s || gen.isPending} onClick={() => s && void copyText(summaryToText(s), 'Summary')}>
              <Copy /> Copy Summary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
