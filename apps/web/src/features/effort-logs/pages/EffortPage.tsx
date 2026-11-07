import { formatEffort, orgToday } from '@tms/shared'
import { Clock } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useApplications } from '@/features/applications/hooks'
import { useAuth } from '@/features/auth/auth-context'
import { useUsers } from '@/features/users/hooks'
import { useEffortSummary } from '../hooks'

type Preset = 'week' | 'month' | 'last30' | 'custom'

/** Date-only arithmetic on YYYY-MM-DD strings (UTC-based, no timezone drift). */
const toDate = (s: string) => new Date(`${s}T00:00:00Z`)
const toStr = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (s: string, n: number) => {
  const d = toDate(s)
  d.setUTCDate(d.getUTCDate() + n)
  return toStr(d)
}

function presetRange(p: Exclude<Preset, 'custom'>): [string, string] {
  const today = orgToday()
  if (p === 'week') {
    const dow = (toDate(today).getUTCDay() + 6) % 7 // Monday = 0 (decision Q8)
    return [addDays(today, -dow), today]
  }
  if (p === 'month') return [`${today.slice(0, 8)}01`, today]
  return [addDays(today, -29), today]
}

const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtMonth = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })

function BarList({ rows, empty }: { rows: { key: string; label: ReactNode; minutes: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.minutes))
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
          <span className="truncate">{r.label}</span>
          <span className="text-right font-medium tabular-nums">{formatEffort(r.minutes)}</span>
          <div className="bg-muted col-span-2 h-1.5 overflow-hidden rounded-full">
            <div className="bg-primary h-full rounded-full" style={{ width: `${(r.minutes / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function Component() {
  const { profile, isAdmin } = useAuth()
  const { data: users } = useUsers()
  const { data: apps } = useApplications()
  const [preset, setPreset] = useState<Preset>('week')
  const [custom, setCustom] = useState<[string, string]>(() => presetRange('month'))
  const [userFilter, setUserFilter] = useState<string>(isAdmin ? 'all' : (profile?.id ?? 'all'))

  const [from, to] = preset === 'custom' ? custom : presetRange(preset)
  const validRange = from <= to
  const selectedUser = isAdmin ? (userFilter === 'all' ? null : userFilter) : null
  const { data, isPending, isError, error, refetch, isFetching } = useEffortSummary(from, to, selectedUser)

  const nameOf = (id: string) => users?.find((u) => u.id === id)?.full_name ?? 'Unknown'
  const appName = (id: string | null) => (id ? (apps?.find((a) => a.id === id)?.name ?? 'Unknown application') : 'No application (R&D)')

  const daysInRange = useMemo(() => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000) + 1, [from, to])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Effort"
        description={isAdmin ? 'Effort summaries across employees, applications and time.' : 'Your logged effort by day, week, month and application.'}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="ef-preset" className="text-xs">Period</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger id="ef-preset" className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="last30">Last 30 days</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {preset === 'custom' && (
          <>
            <div className="space-y-1">
              <Label htmlFor="ef-from" className="text-xs">From</Label>
              <Input id="ef-from" type="date" value={custom[0]} max={custom[1]} onChange={(e) => setCustom([e.target.value, custom[1]])} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ef-to" className="text-xs">To</Label>
              <Input id="ef-to" type="date" value={custom[1]} min={custom[0]} onChange={(e) => setCustom([custom[0], e.target.value])} />
            </div>
          </>
        )}
        {isAdmin && (
          <div className="space-y-1">
            <Label htmlFor="ef-user" className="text-xs">Employee</Label>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger id="ef-user" className="w-full sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                <SelectSeparator />
                {(users ?? []).filter((u) => u.roles.includes('employee')).map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}{u.is_active ? '' : ' (inactive)'}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!validRange ? (
        <ErrorState title="Invalid date range" error="The start date must be on or before the end date." />
      ) : isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <div className={`space-y-4 transition-opacity ${isFetching ? 'opacity-70' : ''}`}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-0"><CardTitle className="text-muted-foreground text-xs font-normal">Total effort</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold tabular-nums">{formatEffort(data.total_minutes)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-0"><CardTitle className="text-muted-foreground text-xs font-normal">Daily average ({daysInRange} days)</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold tabular-nums">{formatEffort(data.total_minutes / daysInRange)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-0"><CardTitle className="text-muted-foreground text-xs font-normal">Tickets worked on</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-semibold tabular-nums">{data.by_ticket.length}{data.by_ticket.length === 50 ? '+' : ''}</p></CardContent>
            </Card>
          </div>

          {data.total_minutes === 0 ? (
            <EmptyState icon={Clock} title="No effort in this period" description="Effort logged on tickets appears here." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-sm">Daily</CardTitle></CardHeader>
                <CardContent>
                  <BarList empty="No effort." rows={data.daily.map((d) => ({ key: d.date, label: fmtDay.format(toDate(d.date)), minutes: d.minutes }))} />
                </CardContent>
              </Card>
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle className="text-sm">Weekly (weeks start Monday)</CardTitle></CardHeader>
                  <CardContent>
                    <BarList empty="No effort." rows={data.weekly.map((w) => ({ key: w.week_start, label: `Week of ${fmtDay.format(toDate(w.week_start))}`, minutes: w.minutes }))} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-sm">Monthly</CardTitle></CardHeader>
                  <CardContent>
                    <BarList empty="No effort." rows={data.monthly.map((m) => ({ key: m.month, label: fmtMonth.format(toDate(m.month)), minutes: m.minutes }))} />
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader><CardTitle className="text-sm">By application</CardTitle></CardHeader>
                <CardContent>
                  <BarList empty="No effort." rows={data.by_application.map((a) => ({ key: a.application_id ?? 'none', label: appName(a.application_id), minutes: a.minutes }))} />
                </CardContent>
              </Card>
              {isAdmin && data.scope === 'all' ? (
                <Card>
                  <CardHeader><CardTitle className="text-sm">By employee</CardTitle></CardHeader>
                  <CardContent>
                    <BarList empty="No effort." rows={data.by_employee.map((e) => ({ key: e.user_id, label: nameOf(e.user_id), minutes: e.minutes }))} />
                  </CardContent>
                </Card>
              ) : null}
              <Card className={isAdmin && data.scope === 'all' ? 'md:col-span-2' : ''}>
                <CardHeader><CardTitle className="text-sm">Top tickets</CardTitle></CardHeader>
                <CardContent>
                  <BarList
                    empty="No effort."
                    rows={data.by_ticket.slice(0, 15).map((t) => ({
                      key: t.ticket_id,
                      label: (
                        <Link to={`/tickets/${t.ticket_number}`} className="hover:underline">
                          <span className="font-mono text-xs">{t.ticket_number}</span> {t.title}
                        </Link>
                      ),
                      minutes: t.minutes,
                    }))}
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
