import { USER_ROLES, USER_ROLE_META, type UserRole } from '@tms/shared'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** One badge per role, in a stable order (Admin, Employee). */
export function RoleBadges({ roles, className }: { roles: readonly UserRole[]; className?: string }) {
  const ordered = USER_ROLES.filter((r) => roles.includes(r))
  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {ordered.map((r) => (
        <Badge key={r} variant={r === 'admin' ? 'default' : 'secondary'}>
          {USER_ROLE_META[r].label}
        </Badge>
      ))}
    </span>
  )
}
