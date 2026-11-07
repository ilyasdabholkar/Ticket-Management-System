import { Badge } from '@/components/ui/badge'
import type { Application } from '../api'
import { applicationStatus, type ApplicationStatus } from '../utils'

const META: Record<ApplicationStatus, { label: string; dot: string }> = {
  active: { label: 'Active', dot: 'bg-emerald-500' },
  inactive: { label: 'Inactive', dot: 'bg-amber-500' },
  archived: { label: 'Archived', dot: 'bg-zinc-400' },
}

export function ApplicationStatusBadge({ app }: { app: Pick<Application, 'is_active' | 'deleted_at'> }) {
  const meta = META[applicationStatus(app)]
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <span className={`size-2 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </Badge>
  )
}
