import type { AppIconKey } from '@tms/shared'
import { AppWindow } from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_ICONS } from './app-icons'

const TONES = [
  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
]

interface AppIconProps {
  iconKey: string
  /** Used to pick a stable colour. */
  seed?: string
  muted?: boolean
  className?: string
}

/** Square application icon. Unknown keys fall back to the default icon. */
export function AppIcon({ iconKey, seed = iconKey, muted, className }: AppIconProps) {
  const Icon = APP_ICONS[iconKey as AppIconKey] ?? AppWindow
  let hash = 0
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <div
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-lg',
        muted ? 'bg-muted text-muted-foreground' : TONES[hash % TONES.length],
        className,
      )}
      aria-hidden
    >
      <Icon className="size-1/2" />
    </div>
  )
}
