import { formatEffort } from '@tms/shared'
import { Clock, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ErrorState } from '@/components/common/states'
import { UserAvatar } from '@/components/shared/user-avatar'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useUsers } from '@/features/users/hooks'
import { formatDate } from '@/lib/dates'
import type { EffortLog } from '../api'
import { useDeleteEffort, useEffortTotals, useTicketEffort } from '../hooks'
import { EffortDialog } from './effort-dialog'

interface EffortSectionProps {
  ticketId: string
  ticketNumber: string
  readOnly: boolean
}

export function EffortSection({ ticketId, ticketNumber, readOnly }: EffortSectionProps) {
  const { profile, isAdmin, isEmployee } = useAuth()
  const { data: users } = useUsers()
  const { data: entries, isPending, isError, error, refetch } = useTicketEffort(ticketId)
  const { data: totals } = useEffortTotals([ticketId])
  const remove = useDeleteEffort()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EffortLog | null>(null)
  const [deleting, setDeleting] = useState<EffortLog | null>(null)

  const ticketTotal = totals?.get(ticketId) ?? 0
  const myTotal = (entries ?? []).filter((e) => e.user_id === profile?.id).reduce((s, e) => s + (e.effort_minutes ?? 0), 0)
  const nameOf = (id: string) => users?.find((u) => u.id === id)?.full_name ?? 'Unknown'

  return (
    <section aria-labelledby="effort-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="effort-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="size-4" /> Effort
        </h2>
        {!readOnly && (isEmployee || isAdmin) && (
          <Button size="sm" className="btn-action btn-effort" onClick={() => { setEditing(null); setDialogOpen(true) }}>
            <Plus /> Log effort
          </Button>
        )}
      </div>

      <div className={isEmployee ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1 gap-3'}>
        <div className="rounded-lg border px-3 py-2">
          <p className="text-muted-foreground text-xs">Total on ticket</p>
          <p className="text-lg font-semibold tabular-nums">{formatEffort(ticketTotal)}</p>
        </div>
        {isEmployee && (
          <div className="rounded-lg border px-3 py-2">
            <p className="text-muted-foreground text-xs">My effort</p>
            <p className="text-lg font-semibold tabular-nums">{formatEffort(myTotal)}</p>
          </div>
        )}
      </div>

      {isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} className="py-6" />
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {isAdmin ? 'No effort logged yet.' : 'You have not logged effort on this ticket.'}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {entries.map((e) => {
            const canManage = !readOnly && (e.user_id === profile?.id || isAdmin)
            return (
              <li key={e.id} className="flex items-start gap-3 px-3 py-2">
                {isAdmin && <UserAvatar name={nameOf(e.user_id)} className="mt-0.5 size-6 text-[0.6rem]" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium tabular-nums">{formatEffort(e.effort_minutes ?? 0)}</span>
                    <span className="text-muted-foreground"> · {formatDate(e.effort_date)}</span>
                    {isAdmin && <span className="text-muted-foreground"> · {nameOf(e.user_id)}</span>}
                  </p>
                  {e.description && <p className="text-muted-foreground text-xs break-words whitespace-pre-wrap">{e.description}</p>}
                </div>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Effort entry actions">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => { setEditing(e); setDialogOpen(true) }}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(e)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {!isAdmin && <p className="text-muted-foreground text-xs">Only your own entries are listed. The total includes everyone's effort.</p>}

      {!readOnly && (
        <EffortDialog ticketId={ticketId} ticketNumber={ticketNumber} open={dialogOpen} onOpenChange={setDialogOpen} entry={editing} />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this effort entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && `${formatEffort(deleting.effort_minutes ?? 0)} on ${formatDate(deleting.effort_date)}`} will no longer count in totals or reports.
              The deletion is recorded in the activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleting && remove.mutate(deleting.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
