import { TICKET_CATEGORY_META, TICKET_STATUS_LABELS, formatEffort } from '@tms/shared'
import { Ban, Bug, ChartNoAxesColumn, CircleAlert, CircleCheckBig, Clock, Code2, FlaskConical, Hourglass, LifeBuoy, ListTodo, Rocket, TestTube, UserX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { PriorityBadge, StatusBadge } from '@/components/shared/ticket-badges'
import { UserAvatar } from '@/components/shared/user-avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useApplications } from '@/features/applications/hooks'
import { useAuth } from '@/features/auth/auth-context'
import { describeActivity } from '@/features/tickets/activity-describe'
import { useUsers } from '@/features/users/hooks'
import { formatDateTime, timeAgo } from '@/lib/dates'
import { formatDay, presetRange, type RangePreset } from '@/lib/date-range'
import { RankedBarChart } from '../components/ranked-bar-chart'
import { StatTile } from '../components/stat-tile'
import { useDashboardStats, useRecentActivity, useRecentTickets } from '../hooks'

function RecentTickets({ title, order }: { title: string; order: 'created_at' | 'updated_at' }) {
  const { data, isPending, isError, error, refetch } = useRecentTickets(order)
  return (
    <Card className="gap-3">
      <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><span aria-hidden className={order === 'created_at' ? 'size-2 rounded-full bg-emerald-500' : 'size-2 rounded-full bg-amber-500'} />{title}</CardTitle></CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} className="py-6" />
        ) : data.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tickets yet.</p>
        ) : (
          <ul className="divide-y">
            {data.map((t) => (
              <li key={t.id}>
                <Link to={`/tickets/${t.ticket_number}`} className="hover:bg-muted/50 -mx-2 block space-y-1 rounded-md px-2 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-mono text-xs">{t.ticket_number}</span>
                    <StatusBadge status={t.status} />
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs" title={formatDateTime(t[order])}>{timeAgo(t[order])}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    <PriorityBadge priority={t.priority} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RecentActivity() {
  const { data, isPending, isError, error, refetch } = useRecentActivity()
  const { data: users } = useUsers()
  const { data: apps } = useApplications()
  const userName = (id: unknown) => users?.find((u) => u.id === id)?.full_name ?? 'someone'
  const appName = (id: unknown) => apps?.find((a) => a.id === id)?.name ?? 'an application'
  return (
    <Card className="gap-3">
      <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><span aria-hidden className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75 motion-reduce:hidden" /><span className="relative inline-flex size-2 rounded-full bg-blue-500" /></span>Recent activity</CardTitle></CardHeader>
      <CardContent>
        {isPending ? (
          <div className="space-y-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} className="py-6" />
        ) : data.length === 0 ? (
          <p className="text-muted-foreground text-sm">No activity yet.</p>
        ) : (
          <ol className="space-y-3">
            {data.map((a) => {
              const actor = a.actor_id ? userName(a.actor_id) : 'System'
              return (
                <li key={a.id} className="flex gap-3">
                  <UserAvatar name={actor} className="size-7 shrink-0 text-[0.6rem]" />
                  <div className="min-w-0 text-sm">
                    <p className="break-words">
                      <span className="font-medium">{actor}</span> {describeActivity(a, userName, appName)}
                      {a.ticket && (
                        <>
                          {' on '}
                          <Link to={`/tickets/${a.ticket.ticket_number}`} className="font-mono text-xs hover:underline">{a.ticket.ticket_number}</Link>
                        </>
                      )}
                    </p>
                    <time className="text-muted-foreground text-xs" dateTime={a.created_at} title={formatDateTime(a.created_at)}>{timeAgo(a.created_at)}</time>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

export function Component() {
  const { isAdmin, profile } = useAuth()
  const { data: users } = useUsers()
  const { data: apps } = useApplications()
  const [preset, setPreset] = useState<RangePreset>('month')
  const [custom, setCustom] = useState<[string, string]>(() => presetRange('month'))
  const [from, to] = preset === 'custom' ? custom : presetRange(preset)
  const valid = from <= to
  const { data: stats, isPending, isError, error, refetch, isFetching } = useDashboardStats(from, to, valid)

  const employeeData = useMemo(
    () => (stats?.by_employee ?? []).map((e) => ({ key: e.user_id, label: users?.find((u) => u.id === e.user_id)?.full_name ?? 'Unknown', value: e.minutes })),
    [stats, users],
  )
  const appData = useMemo(
    () =>
      (stats?.by_application ?? []).map((a) => ({
        key: a.application_id ?? 'none',
        label: a.application_id ? (apps?.find((x) => x.id === a.application_id)?.name ?? 'Unknown') : 'No application (R&D)',
        value: a.count,
      })),
    [stats, apps],
  )
  const loading = isPending && valid
  const t = stats?.tickets
  const rangeLabel = from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`
  const own = stats?.effort_scope === 'own'

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={`Welcome back${profile ? `, ${profile.full_name.split(' ')[0]}` : ''}. Tickets created and effort logged in the selected period.`} />

      {/* Filters: one row above the charts (dataviz interaction guidance) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <ToggleGroup type="single" variant="outline" value={preset} onValueChange={(v) => v && setPreset(v as RangePreset)} aria-label="Period">
          <ToggleGroupItem value="today">Today</ToggleGroupItem>
          <ToggleGroupItem value="week">This week</ToggleGroupItem>
          <ToggleGroupItem value="month">This month</ToggleGroupItem>
          <ToggleGroupItem value="custom">Custom</ToggleGroupItem>
        </ToggleGroup>
        {preset === 'custom' && (
          <div className="flex gap-2">
            <div className="space-y-1">
              <Label htmlFor="db-from" className="text-xs">From</Label>
              <Input id="db-from" type="date" value={custom[0]} max={custom[1]} onChange={(e) => setCustom([e.target.value, custom[1]])} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="db-to" className="text-xs">To</Label>
              <Input id="db-to" type="date" value={custom[1]} min={custom[0]} onChange={(e) => setCustom([custom[0], e.target.value])} />
            </div>
          </div>
        )}
        <span className="text-muted-foreground text-sm sm:ml-auto">{rangeLabel}{isFetching && !loading ? ' · updating…' : ''}</span>
      </div>

      {!valid ? (
        <ErrorState title="Invalid date range" error="The start date must be on or before the end date." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          {/* Status: hero total + current status of tickets created in the period */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile hero label="Total tickets" value={t?.total ?? 0} hint="Created in this period" icon={ListTodo} loading={loading} className="sm:col-span-2 xl:col-span-1 xl:row-span-2 xl:justify-center" />
            <StatTile label={TICKET_STATUS_LABELS.in_progress} value={t?.by_status.in_progress ?? 0} icon={Hourglass} tone="blue" loading={loading} />
            <StatTile label={TICKET_STATUS_LABELS.qa_deployed} value={t?.by_status.qa_deployed ?? 0} icon={TestTube} tone="violet" loading={loading} />
            <StatTile label={TICKET_STATUS_LABELS.prod_deployed} value={t?.by_status.prod_deployed ?? 0} icon={Rocket} tone="emerald" loading={loading} />
            <StatTile label={TICKET_STATUS_LABELS.completed} value={t?.by_status.completed ?? 0} hint="Finished without a release" icon={CircleCheckBig} tone="teal" loading={loading} />
            <StatTile label={TICKET_STATUS_LABELS.dropped} value={t?.by_status.dropped ?? 0} hint="Cancelled" icon={Ban} tone="slate" loading={loading} />
            <StatTile label="Unassigned" value={t?.unassigned ?? 0} hint="Created in this period, no assignee" icon={UserX} tone="rose" loading={loading} />
          </div>

          {/* Category */}
          <section aria-labelledby="by-category" className="space-y-2">
            <h2 id="by-category" className="text-muted-foreground text-xs font-medium tracking-wide uppercase">By category</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
              <StatTile label={TICKET_CATEGORY_META.development.label} value={t?.development ?? 0} icon={Code2} tone="indigo" loading={loading} />
              <StatTile label={TICKET_CATEGORY_META.support.label} value={t?.support ?? 0} icon={LifeBuoy} tone="fuchsia" loading={loading} />
              <StatTile label={TICKET_CATEGORY_META.rnd.label} value={t?.rnd ?? 0} icon={FlaskConical} tone="amber" loading={loading} />
              <StatTile label={TICKET_CATEGORY_META.analysis.label} value={t?.analysis ?? 0} icon={ChartNoAxesColumn} tone="cyan" loading={loading} />
              <StatTile label={TICKET_CATEGORY_META.issue.label} value={t?.issue ?? 0} icon={CircleAlert} tone="rose" loading={loading} />
              <StatTile label={TICKET_CATEGORY_META.bug_fix.label} value={t?.bug_fix ?? 0} icon={Bug} tone="violet" loading={loading} />
            </div>
          </section>

          {/* Effort */}
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile label={own ? 'My effort this month' : 'Total effort this month'} value={formatEffort(stats?.effort_this_month ?? 0)} hint="Calendar month to date" icon={Clock} tone="sky" loading={loading} />
            <StatTile label={own ? 'My effort in period' : 'Team effort in period'} value={formatEffort(stats?.effort_in_range ?? 0)} hint={rangeLabel} icon={Clock} tone="blue" loading={loading} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {isAdmin ? (
              <RankedBarChart
                title="Effort by employee"
                description="Effort logged in the period"
                data={employeeData}
                valueLabel="Effort"
                format={formatEffort}
                emptyText="No effort logged in this period."
              />
            ) : null}
            <RankedBarChart
              title="Tickets by application"
              description="Tickets created in the period"
              data={appData}
              valueLabel="Tickets"
              format={(v) => String(v)}
              emptyText="No tickets created in this period."
            />
          </div>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <RecentActivity />
        <RecentTickets title="Recently created" order="created_at" />
        <RecentTickets title="Recently updated" order="updated_at" />
      </div>
    </div>
  )
}
