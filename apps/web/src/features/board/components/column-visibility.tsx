import { TICKET_STATUSES, TICKET_STATUS_LABELS, type TicketStatus } from '@tms/shared'
import { Columns3 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const STORAGE_KEY = 'tms.board.visibleColumns'

function readStored(): TicketStatus[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...TICKET_STATUSES]
    const parsed = (JSON.parse(raw) as unknown[]).filter((s): s is TicketStatus => (TICKET_STATUSES as readonly unknown[]).includes(s))
    return parsed.length ? parsed : [...TICKET_STATUSES]
  } catch {
    return [...TICKET_STATUSES]
  }
}

/** Which board columns are shown. A per-browser convenience (localStorage); at least one column always stays visible. */
export function useVisibleColumns() {
  const [visible, setVisible] = useState<TicketStatus[]>(readStored)
  const save = (next: TicketStatus[]) => {
    const ordered = TICKET_STATUSES.filter((s) => next.includes(s))
    setVisible(ordered)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ordered))
    } catch {
      // Storage unavailable (private mode): the choice lasts for this visit only.
    }
  }
  const toggle = (status: TicketStatus, on: boolean) => {
    if (!on && visible.length === 1 && visible[0] === status) return
    save(on ? [...visible, status] : visible.filter((s) => s !== status))
  }
  return { visible, toggle, showAll: () => save([...TICKET_STATUSES]) }
}

interface ColumnVisibilityMenuProps {
  visible: TicketStatus[]
  counts: Record<TicketStatus, number>
  onToggle: (status: TicketStatus, on: boolean) => void
  onShowAll: () => void
}

export function ColumnVisibilityMenu({ visible, counts, onToggle, onShowAll }: ColumnVisibilityMenuProps) {
  const hidden = TICKET_STATUSES.length - visible.length
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto" aria-label="Choose visible columns">
          <Columns3 /> Columns
          {hidden > 0 && <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[0.7rem] tabular-nums">{visible.length}/{TICKET_STATUSES.length}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">Show columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TICKET_STATUSES.map((s) => {
          const checked = visible.includes(s)
          const isLast = checked && visible.length === 1
          return (
            <DropdownMenuCheckboxItem
              key={s}
              checked={checked}
              disabled={isLast}
              onCheckedChange={(on) => onToggle(s, on === true)}
              onSelect={(e) => e.preventDefault()} // keep the menu open while ticking several
            >
              <span className="flex-1">{TICKET_STATUS_LABELS[s]}</span>
              <span className="text-muted-foreground text-xs tabular-nums">{counts[s]}</span>
            </DropdownMenuCheckboxItem>
          )
        })}
        {hidden > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onShowAll}>Show all columns</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
