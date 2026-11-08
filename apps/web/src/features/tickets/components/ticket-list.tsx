import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_META,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  formatBoardMonth,
  formatEffort,
  isFinalStatus,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '@tms/shared'
import { ArrowRightLeft, ChevronLeft, ChevronRight, ListTodo, RotateCcw, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/common/states'
import { AppIcon } from '@/components/shared/app-icon'
import { CategoryBadge, PriorityBadge, StatusBadge } from '@/components/shared/ticket-badges'
import { UserAvatar } from '@/components/shared/user-avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { useApplications } from '@/features/applications/hooks'
import { useAuth } from '@/features/auth/auth-context'
import { useEffortTotals } from '@/features/effort-logs/hooks'
import { useUsers } from '@/features/users/hooks'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { timeAgo } from '@/lib/dates'
import { PAGE_SIZE, type TicketFilters, type TicketListItem, type TicketSort } from '../api'
import { boardMonthOptions, MoveBoardDialog } from './board-month'
import { useRestoreTicket, useTickets } from '../hooks'

const ALL = '__all__'
/** Reads/writes ticket filters in the URL so views are shareable and survive refresh. */
function useFilterParams(fixedApplicationId?: string) {
  const [params, setParams] = useSearchParams()
  const filters: TicketFilters = {
    search: params.get('q') ?? undefined,
    category: (params.get('category') as TicketCategory) || undefined,
    applicationId: fixedApplicationId ?? (params.get('app') || undefined),
    assignee: params.get('assignee') || undefined,
    priority: (params.get('priority') as TicketPriority) || undefined,
    status: (params.get('status') as TicketStatus) || undefined,
    boardMonth: params.get('month') || undefined,
    deleted: params.get('deleted') === '1' || undefined,
    sort: (params.get('sort') as TicketSort) || 'updated',
    page: Number(params.get('page') ?? '1') || 1,
  }
  const set = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === undefined || value === '' || value === ALL) next.delete(key)
        else next.set(key, value)
        if (key !== 'page') next.delete('page')
        return next
      },
      { replace: true },
    )
  const clear = () =>
    setParams((prev) => {
      const next = new URLSearchParams()
      if (prev.get('tab')) next.set('tab', prev.get('tab')!)
      return next
    }, { replace: true })
  return { filters, set, clear, hasFilters: ['q', 'category', 'app', 'assignee', 'priority', 'status', 'month', 'deleted'].some((k) => params.has(k)) }
}

interface TicketListProps {
  /** Locks the list to one application (application detail tab). */
  applicationId?: string
  onCreate?: () => void
}

export function TicketList({ applicationId, onCreate }: TicketListProps) {
  const navigate = useNavigate()
  const { profile, isAdmin, isEmployee } = useAuth()
  const { filters, set, clear, hasFilters } = useFilterParams(applicationId)
  const { data: apps } = useApplications()
  const { data: users } = useUsers()
  const restore = useRestoreTicket()
  const [moving, setMoving] = useState<TicketListItem | null>(null)

  const [searchInput, setSearchInput] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchInput)
  useEffect(() => {
    if ((filters.search ?? '') !== debounced) set('q', debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const { data, isPending, isError, error, refetch, isFetching } = useTickets(filters)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const ticketIds = useMemo(() => (data?.rows ?? []).map((t) => t.id), [data])
  const { data: effortTotals } = useEffortTotals(ticketIds)
  const page = filters.page ?? 1

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search by ticket ID or title"
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search tickets"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
          <Select value={filters.category ?? ALL} onValueChange={(v) => set('category', v)}>
            <SelectTrigger className="w-full md:w-40" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {TICKET_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{TICKET_CATEGORY_META[c].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!applicationId && (
            <Select value={filters.applicationId ?? ALL} onValueChange={(v) => set('app', v)}>
              <SelectTrigger className="w-full md:w-48" aria-label="Application">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All applications</SelectItem>
                {(apps ?? []).filter((a) => !a.deleted_at).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={filters.assignee ?? ALL} onValueChange={(v) => set('assignee', v)}>
            <SelectTrigger className="w-full md:w-44" aria-label="Assignee">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Anyone</SelectItem>
              {profile && isEmployee && <SelectItem value={profile.id}>Assigned to me</SelectItem>}
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectSeparator />
              {(users ?? []).filter((u) => u.id !== profile?.id && u.roles.includes('employee')).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.full_name}{u.is_active ? '' : ' (inactive)'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.priority ?? ALL} onValueChange={(v) => set('priority', v)}>
            <SelectTrigger className="w-full md:w-36" aria-label="Priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All priorities</SelectItem>
              {TICKET_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.status ?? ALL} onValueChange={(v) => set('status', v)}>
            <SelectTrigger className="w-full md:w-40" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {TICKET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{TICKET_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.boardMonth ?? ALL} onValueChange={(v) => set('month', v)}>
            <SelectTrigger className="w-full md:w-40" aria-label="Board">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All boards</SelectItem>
              {boardMonthOptions(filters.boardMonth).map((m) => (
                <SelectItem key={m} value={m}>{formatBoardMonth(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.sort ?? 'updated'} onValueChange={(v) => set('sort', v === 'updated' ? undefined : v)}>
            <SelectTrigger className="w-full md:w-44" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Recently updated</SelectItem>
              <SelectItem value="created">Recently created</SelectItem>
              <SelectItem value="number">Ticket number</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <div className="flex items-center gap-2 px-1">
              <Switch id="show-deleted" checked={!!filters.deleted} onCheckedChange={(c) => set('deleted', c ? '1' : undefined)} />
              <Label htmlFor="show-deleted" className="text-sm">Deleted</Label>
            </div>
          )}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput('')
                clear()
              }}
            >
              <X /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      {isPending ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.rows.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={hasFilters ? 'No matching tickets' : filters.deleted ? 'No deleted tickets' : 'No tickets yet'}
          description={hasFilters ? 'Try different filters or search terms.' : 'Create the first ticket to get started.'}
          action={!hasFilters && onCreate ? <Button size="sm" onClick={onCreate}>Create ticket</Button> : undefined}
        />
      ) : (
        <Card className={`gap-0 py-0 transition-opacity ${isFetching ? 'opacity-70' : ''}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Ticket</TableHead>
                <TableHead>Title</TableHead>
                {!applicationId && <TableHead className="hidden lg:table-cell">Application</TableHead>}
                <TableHead className="hidden md:table-cell">Priority</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Board</TableHead>
                <TableHead className="hidden md:table-cell">Assignee</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Effort</TableHead>
                <TableHead className="hidden xl:table-cell">Updated</TableHead>
                <TableHead className="w-12"><span className="sr-only">{filters.deleted ? 'Restore' : 'Actions'}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer"
                  onClick={() => !filters.deleted && navigate(`/tickets/${t.ticket_number}`)}
                >
                  <TableCell className="font-mono text-xs font-medium">
                    {filters.deleted ? (
                      t.ticket_number
                    ) : (
                      <Link to={`/tickets/${t.ticket_number}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                        {t.ticket_number}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="max-w-0 w-full">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="truncate font-medium">{t.title}</span>
                      <div className="flex flex-wrap items-center gap-1">
                        <CategoryBadge category={t.category} />
                        <StatusBadge status={t.status} className="sm:hidden" />
                        <PriorityBadge priority={t.priority} className="md:hidden" />
                      </div>
                    </div>
                  </TableCell>
                  {!applicationId && (
                    <TableCell className="hidden lg:table-cell">
                      {t.application ? (
                        <span className="flex items-center gap-2">
                          <AppIcon iconKey={t.application.icon_key} seed={t.application.name} className="size-5 rounded" />
                          <span className="max-w-40 truncate">{t.application.name}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="hidden md:table-cell"><PriorityBadge priority={t.priority} /></TableCell>
                  <TableCell className="hidden sm:table-cell"><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="hidden whitespace-nowrap text-sm md:table-cell">{formatBoardMonth(t.board_month)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {t.assignee ? (
                      <span className="flex items-center gap-2">
                        <UserAvatar name={t.assignee.full_name} className="size-6 text-[0.6rem]" />
                        <span className="max-w-32 truncate">{t.assignee.full_name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums lg:table-cell">
                    {effortTotals?.get(t.id) ? formatEffort(effortTotals.get(t.id)!) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs xl:table-cell" title={new Date(t.updated_at).toLocaleString()}>
                    {timeAgo(t.updated_at)}
                  </TableCell>
                  {filters.deleted ? (
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={restore.isPending}
                        onClick={(e) => {
                          e.stopPropagation()
                          restore.mutate(t.id)
                        }}
                      >
                        <RotateCcw /> Restore
                      </Button>
                    </TableCell>
                  ) : (
                    <TableCell className="text-right">
                      {!isFinalStatus(t.status) && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Move ${t.ticket_number} to another board`}
                          title="Move to another board"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMoving(t)
                          }}
                        >
                          <ArrowRightLeft />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <MoveBoardDialog ticket={moving} onOpenChange={(o) => !o && setMoving(null)} />

      {data && data.total > 0 && (
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={page >= totalPages} onClick={() => set('page', String(page + 1))}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
