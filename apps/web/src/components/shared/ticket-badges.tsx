import {
  TICKET_CATEGORY_META,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
} from '@tms/shared'
import { ChevronDown, ChevronsUp, ChevronUp, Code2, FlaskConical, Equal, LifeBuoy, Lock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const PRIORITY_STYLE: Record<TicketPriority, { icon: typeof ChevronUp; className: string }> = {
  low: { icon: ChevronDown, className: 'text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900' },
  medium: { icon: Equal, className: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900' },
  high: { icon: ChevronUp, className: 'text-orange-700 bg-orange-50 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900' },
  critical: { icon: ChevronsUp, className: 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900' },
}

export function PriorityBadge({ priority, className }: { priority: TicketPriority; className?: string }) {
  const { icon: Icon, className: style } = PRIORITY_STYLE[priority]
  return (
    <Badge variant="outline" className={cn('gap-1 font-normal', style, className)}>
      <Icon className="size-3" aria-hidden />
      {TICKET_PRIORITY_LABELS[priority]}
    </Badge>
  )
}

const CATEGORY_ICON: Record<TicketCategory, typeof Code2> = { development: Code2, support: LifeBuoy, rnd: FlaskConical }

export function CategoryBadge({ category, className }: { category: TicketCategory; className?: string }) {
  const Icon = CATEGORY_ICON[category]
  return (
    <Badge variant="secondary" className={cn('gap-1 font-normal', className)}>
      <Icon className="size-3" aria-hidden />
      {TICKET_CATEGORY_META[category].label}
    </Badge>
  )
}

const STATUS_STYLE: Record<TicketStatus, string> = {
  development: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
  qa_deployed: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900',
  prod_deployed: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
}

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('gap-1 font-medium uppercase tracking-wide text-[0.7rem]', STATUS_STYLE[status], className)}>
      {status === 'prod_deployed' && <Lock className="size-3" aria-label="Locked" />}
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  )
}
