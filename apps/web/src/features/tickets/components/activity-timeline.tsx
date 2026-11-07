import { History } from 'lucide-react'
import { ErrorState } from '@/components/common/states'
import { UserAvatar } from '@/components/shared/user-avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { useApplications } from '@/features/applications/hooks'
import { useUsers } from '@/features/users/hooks'
import { formatDateTime, timeAgo } from '@/lib/dates'
import { describeActivity } from '../activity-describe'
import { useTicketActivity } from '../hooks'

export function ActivityTimeline({ ticketId }: { ticketId: string }) {
  const { data: logs, isPending, isError, error, refetch } = useTicketActivity(ticketId)
  const { data: users } = useUsers()
  const { data: apps } = useApplications()
  const userName = (id: unknown) => users?.find((u) => u.id === id)?.full_name ?? 'someone'
  const appName = (id: unknown) => apps?.find((a) => a.id === id)?.name ?? 'an application'

  return (
    <section aria-labelledby="activity-heading" className="space-y-3">
      <h2 id="activity-heading" className="flex items-center gap-2 text-sm font-semibold">
        <History className="size-4" /> Activity
      </h2>
      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} className="py-6" />
      ) : logs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No activity yet.</p>
      ) : (
        <ol className="relative space-y-4 border-l pl-6">
          {logs.map((log) => {
            const actor = log.actor_id ? userName(log.actor_id) : 'System'
            return (
              <li key={log.id} className="relative">
                <span className="absolute top-0.5 -left-[2.15rem]">
                  <UserAvatar name={actor} className="ring-background size-6 text-[0.6rem] ring-4" />
                </span>
                <p className="text-sm">
                  <span className="font-medium">{actor}</span> {describeActivity(log, userName, appName)}
                </p>
                <time className="text-muted-foreground text-xs" dateTime={log.created_at} title={formatDateTime(log.created_at)}>
                  {timeAgo(log.created_at)}
                </time>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
