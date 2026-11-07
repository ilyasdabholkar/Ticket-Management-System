import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** Initials avatar (decision Q16: no profile-image uploads). Colour is stable per name. */
export function UserAvatar({ name, className }: { name: string; className?: string }) {
  const palette = [
    'bg-blue-100 text-blue-800',
    'bg-emerald-100 text-emerald-800',
    'bg-amber-100 text-amber-800',
    'bg-violet-100 text-violet-800',
    'bg-rose-100 text-rose-800',
    'bg-cyan-100 text-cyan-800',
  ]
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <Avatar className={cn('size-8', className)}>
      <AvatarFallback className={cn('text-xs font-medium', palette[hash % palette.length])}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
