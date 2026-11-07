import { TICKET_STATUS_LABELS } from '@tms/shared'
import { ArrowRight, ShieldAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useUsers } from '@/features/users/hooks'
import { formatDateTime } from '@/lib/dates'
import { useStatusHistory } from '../hooks'

export function StatusHistoryCard({ ticketId }: { ticketId: string }) {
  const { data: history, isPending } = useStatusHistory(ticketId)
  const { data: users } = useUsers()
  const nameOf = (id: string | null) => users?.find((u) => u.id === id)?.full_name ?? 'Unknown'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Status history</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : !history?.length ? (
          <p className="text-muted-foreground text-sm">No history.</p>
        ) : (
          <ol className="space-y-3">
            {history.map((h) => (
              <li key={h.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-1">
                  {h.from_status ? (
                    <>
                      <span className="text-muted-foreground">{TICKET_STATUS_LABELS[h.from_status]}</span>
                      <ArrowRight className="text-muted-foreground size-3" aria-label="to" />
                    </>
                  ) : (
                    <span className="text-muted-foreground">Created as</span>
                  )}
                  <span className="font-medium">{TICKET_STATUS_LABELS[h.to_status]}</span>
                  {h.is_correction && (
                    <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 text-[0.7rem] text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      <ShieldAlert className="size-3" /> Correction
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  {nameOf(h.changed_by)} · {formatDateTime(h.changed_at)}
                </p>
                {h.correction_reason && <p className="text-muted-foreground mt-0.5 text-xs italic">“{h.correction_reason}”</p>}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
