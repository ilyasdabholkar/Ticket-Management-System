import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Accent per tile. Status tones match StatusBadge (in progress = blue, QA = violet, prod = emerald). */
export type TileTone = 'blue' | 'indigo' | 'teal' | 'amber' | 'violet' | 'emerald' | 'rose' | 'cyan' | 'sky'

const TONES: Record<TileTone, { chip: string; bar: string; glow: string }> = {
  blue: { chip: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300', bar: 'from-blue-500 to-blue-400', glow: 'from-blue-500/10' },
  indigo: { chip: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300', bar: 'from-indigo-500 to-indigo-400', glow: 'from-indigo-500/10' },
  teal: { chip: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300', bar: 'from-teal-500 to-teal-400', glow: 'from-teal-500/10' },
  amber: { chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300', bar: 'from-amber-500 to-amber-400', glow: 'from-amber-500/10' },
  violet: { chip: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300', bar: 'from-violet-500 to-violet-400', glow: 'from-violet-500/10' },
  emerald: { chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', bar: 'from-emerald-500 to-emerald-400', glow: 'from-emerald-500/10' },
  rose: { chip: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300', bar: 'from-rose-500 to-rose-400', glow: 'from-rose-500/10' },
  cyan: { chip: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300', bar: 'from-cyan-500 to-cyan-400', glow: 'from-cyan-500/10' },
  sky: { chip: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300', bar: 'from-sky-500 to-sky-400', glow: 'from-sky-500/10' },
}

interface StatTileProps {
  label: string
  value: ReactNode
  hint?: string
  icon?: LucideIcon
  /** Hero tiles get the large figure (dataviz: >= 48px is reserved for the lead metric). */
  hero?: boolean
  tone?: TileTone
  loading?: boolean
  className?: string
}

export function StatTile({ label, value, hint, icon: Icon, hero, tone = 'blue', loading, className }: StatTileProps) {
  const t = TONES[tone]
  if (hero) {
    return (
      <Card className={cn('relative gap-1 overflow-hidden border-0 bg-gradient-to-br from-blue-600 to-indigo-700 px-5 py-5 text-white shadow-md transition-shadow hover:shadow-lg', className)}>
        <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-white/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-12 -left-6 size-32 rounded-full bg-white/5" />
        <div className="relative flex items-center justify-between gap-2 text-sm font-medium text-white/90">
          <span>{label}</span>
          {Icon && <span className="rounded-lg bg-white/15 p-2"><Icon className="size-5" aria-hidden /></span>}
        </div>
        {loading ? <Skeleton className="relative h-12 w-24 bg-white/20" /> : <p className="relative text-5xl font-semibold tracking-tight tabular-nums">{value}</p>}
        {hint && <p className="relative text-xs text-white/80">{hint}</p>}
      </Card>
    )
  }
  return (
    <Card className={cn('group relative gap-1 overflow-hidden px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none', className)}>
      <div aria-hidden className={cn('absolute inset-x-0 top-0 h-1 bg-gradient-to-r', t.bar)} />
      <div aria-hidden className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent to-60% opacity-0 transition-opacity group-hover:opacity-100', t.glow)} />
      <div className="text-muted-foreground relative flex items-center justify-between gap-2 text-xs font-medium">
        <span>{label}</span>
        {Icon && (
          <span className={cn('rounded-md p-1.5 transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none', t.chip)}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      {loading ? <Skeleton className="h-7 w-16" /> : <p className="relative text-2xl font-semibold tracking-tight tabular-nums">{value}</p>}
      {hint && <p className="text-muted-foreground relative text-xs">{hint}</p>}
    </Card>
  )
}
