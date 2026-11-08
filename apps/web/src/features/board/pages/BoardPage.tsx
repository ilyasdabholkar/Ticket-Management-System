import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_META,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  canTransition,
  formatBoardMonth,
  isFinalStatus,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '@tms/shared'
import { Columns3, Plus, Search, Table2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useApplications } from '@/features/applications/hooks'
import { useEffortTotals } from '@/features/effort-logs/hooks'
import { useAuth } from '@/features/auth/auth-context'
import { type BoardFilters, type TicketListItem } from '@/features/tickets/api'
import { BoardMonthPicker, currentBoardMonth } from '@/features/tickets/components/board-month'
import { CreateTicketSheet } from '@/features/tickets/components/create-ticket-sheet'
import { FinishTicketDialog, type FinalStatus } from '@/features/tickets/components/finish-ticket-dialog'
import { TicketList } from '@/features/tickets/components/ticket-list'
import { useBoardTickets, useTransitionStatus } from '@/features/tickets/hooks'
import { useUsers } from '@/features/users/hooks'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { BoardColumn } from '../components/board-column'
import { ColumnVisibilityMenu, useVisibleColumns } from '../components/column-visibility'
import { TicketCardBody } from '../components/ticket-card'

const ALL = '__all__'
type View = 'board' | 'table'

function useBoardParams() {
  const [params, setParams] = useSearchParams()
  const view: View = params.get('view') === 'table' ? 'table' : 'board'
  const filters: BoardFilters = {
    boardMonth: params.get('month') || currentBoardMonth(),
    search: params.get('q') ?? undefined,
    category: (params.get('category') as TicketCategory) || undefined,
    applicationId: params.get('app') || undefined,
    assignee: params.get('assignee') || undefined,
    priority: (params.get('priority') as TicketPriority) || undefined,
  }
  const set = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (!value || value === ALL) next.delete(key)
        else next.set(key, value)
        if (key !== 'page') next.delete('page')
        return next
      },
      { replace: true },
    )
  const clear = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams()
        for (const k of ['view', 'month']) if (prev.get(k)) next.set(k, prev.get(k)!)
        return next
      },
      { replace: true },
    )
  const hasFilters = ['q', 'category', 'app', 'assignee', 'priority'].some((k) => params.has(k))
  return { view, filters, set, clear, hasFilters }
}

export function Component() {
  const { profile, isEmployee } = useAuth()
  const { view, filters, set, clear, hasFilters } = useBoardParams()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Board"
        description="Each month has its own board. Unfinished tickets stay on their board until you move them."
        actions={
          <div className="flex items-center gap-2">
            <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && set('view', v === 'board' ? undefined : v)} aria-label="View">
              <ToggleGroupItem value="board" aria-label="Board view"><Columns3 /> Board</ToggleGroupItem>
              <ToggleGroupItem value="table" aria-label="Table view"><Table2 /> Table</ToggleGroupItem>
            </ToggleGroup>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Create ticket
            </Button>
          </div>
        }
      />

      {view === 'table' ? (
        <TicketList onCreate={() => setCreateOpen(true)} />
      ) : (
        <BoardView filters={filters} set={set} clear={clear} hasFilters={hasFilters} profileId={profile?.id} isEmployee={isEmployee} />
      )}

      <CreateTicketSheet open={createOpen} onOpenChange={setCreateOpen} defaultBoardMonth={view === 'board' ? filters.boardMonth : undefined} />
    </div>
  )
}

interface BoardViewProps {
  filters: BoardFilters
  set: (key: string, value: string | undefined) => void
  clear: () => void
  hasFilters: boolean
  profileId?: string
  isEmployee: boolean
}

function BoardView({ filters, set, clear, hasFilters, profileId, isEmployee }: BoardViewProps) {
  const { data: tickets, isPending, isError, error, refetch } = useBoardTickets(filters)
  const { data: apps } = useApplications()
  const { data: users } = useUsers()
  const transition = useTransitionStatus(filters)
  const ticketIds = useMemo(() => (tickets ?? []).map((t) => t.id), [tickets])
  const { data: effortTotals } = useEffortTotals(ticketIds)
  const [active, setActive] = useState<TicketListItem | null>(null)
  const [finishing, setFinishing] = useState<{ ticket: TicketListItem; status: FinalStatus } | null>(null)
  const { visible, toggle, showAll } = useVisibleColumns()

  const [searchInput, setSearchInput] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchInput)
  useEffect(() => {
    if ((filters.search ?? '') !== debounced) set('q', debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const columns = useMemo(() => {
    const by = Object.fromEntries(TICKET_STATUSES.map((s) => [s, [] as TicketListItem[]])) as Record<TicketStatus, TicketListItem[]>
    for (const t of tickets ?? []) by[t.status].push(t)
    for (const s of TICKET_STATUSES) by[s].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    return by
  }, [tickets])

  const move = (ticket: TicketListItem, to: TicketStatus, reason?: string) =>
    transition.mutate({ id: ticket.id, status: to, ticketNumber: ticket.ticket_number, reason })

  const onDragStart = (e: DragStartEvent) => setActive((e.active.data.current?.ticket as TicketListItem) ?? null)

  const onDragEnd = (e: DragEndEvent) => {
    const ticket = e.active.data.current?.ticket as TicketListItem | undefined
    setActive(null)
    const to = e.over?.id as TicketStatus | undefined
    if (!ticket || !to || to === ticket.status) return
    if (!canTransition(ticket.status, to)) {
      toast.error(
        isFinalStatus(ticket.status)
          ? 'Finished tickets are locked.'
          : to === 'prod_deployed'
            ? 'Tickets can only move to Prod Deployed from QA Deployed.'
            : to === 'completed'
              ? 'Tickets can only be completed from In Progress or QA Deployed.'
              : 'This move is not allowed.',
      )
      return
    }
    if (isFinalStatus(to)) setFinishing({ ticket, status: to as FinalStatus })
    else move(ticket, to)
  }

  const total = tickets?.length ?? 0

  return (
    <>
      <div className="flex flex-col gap-2 xl:flex-row xl:flex-wrap xl:items-center">
        <BoardMonthPicker value={filters.boardMonth} onChange={(m) => set('month', m === currentBoardMonth() ? undefined : m)} />
        <div className="relative xl:w-56">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input placeholder="Search ID or title" className="pl-8" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="Search tickets" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select value={filters.applicationId ?? ALL} onValueChange={(v) => set('app', v)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Application"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All applications</SelectItem>
              {(apps ?? []).filter((a) => !a.deleted_at).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.category ?? ALL} onValueChange={(v) => set('category', v)}>
            <SelectTrigger className="w-full sm:w-36" aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {TICKET_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{TICKET_CATEGORY_META[c].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.assignee ?? ALL} onValueChange={(v) => set('assignee', v)}>
            <SelectTrigger className="w-full sm:w-40" aria-label="Assignee"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Anyone</SelectItem>
              {profileId && isEmployee && <SelectItem value={profileId}>Assigned to me</SelectItem>}
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectSeparator />
              {(users ?? []).filter((u) => u.id !== profileId && u.roles.includes('employee')).map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.priority ?? ALL} onValueChange={(v) => set('priority', v)}>
            <SelectTrigger className="w-full sm:w-36" aria-label="Priority"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All priorities</SelectItem>
              {TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* Same row as the filters: it controls the board view, like they do */}
          <ColumnVisibilityMenu
            visible={visible}
            counts={Object.fromEntries(TICKET_STATUSES.map((s) => [s, columns[s].length])) as Record<TicketStatus, number>}
            onToggle={toggle}
            onShowAll={showAll}
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); clear() }}>
              <X /> Clear
            </Button>
          )}
        </div>
      </div>

      {!isPending && !isError && (
        <p className="text-muted-foreground text-sm">
          {formatBoardMonth(filters.boardMonth)} board · {total} {total === 1 ? 'ticket' : 'tickets'}
          {total === 0 && !hasFilters ? '. Create a ticket or move one here from another month.' : ''}
        </p>
      )}

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="flex gap-3 overflow-hidden">
          {visible.map((s) => <Skeleton key={s} className="h-96 w-64 shrink-0 rounded-xl" />)}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
          <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 md:-mx-6 md:scroll-px-6 md:px-6 lg:mx-0 lg:px-0">
            {visible.map((s) => (
              <div key={s} className="snap-start lg:flex lg:min-w-48 lg:flex-1">
                <BoardColumn
                  status={s}
                  tickets={columns[s]}
                  effortTotals={effortTotals}
                  dropAllowed={active ? (s === active.status ? null : canTransition(active.status, s)) : null}
                />
              </div>
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 150 }}>{active ? <TicketCardBody ticket={active} effortMinutes={effortTotals?.get(active.id)} overlay /> : null}</DragOverlay>
        </DndContext>
      )}

      <FinishTicketDialog
        ticketNumber={finishing?.ticket.ticket_number ?? null}
        status={finishing?.status ?? null}
        onCancel={() => setFinishing(null)}
        onConfirm={(reason) => {
          if (finishing) move(finishing.ticket, finishing.status, reason)
          setFinishing(null)
        }}
      />
    </>
  )
}
