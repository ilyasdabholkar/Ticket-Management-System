import { AppWindow, Plus, Search } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { EmptyState, ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { AppIcon } from '@/components/shared/app-icon'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { ApplicationFormDialog } from '../components/application-form-dialog'
import { ApplicationStatusBadge } from '../components/application-status-badge'
import { useApplications } from '../hooks'
import { applicationStatus, type ApplicationStatus } from '../utils'

type Filter = 'current' | ApplicationStatus

export function Component() {
  const { isAdmin } = useAuth()
  const { data: apps, isPending, isError, error, refetch } = useApplications()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('current')
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (apps ?? []).filter((a) => {
      const status = applicationStatus(a)
      const statusOk = filter === 'current' ? status !== 'archived' : status === filter
      return statusOk && (!q || a.name.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q))
    })
  }, [apps, search, filter])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        description="Applications group Development and Support tickets, knowledge base documents and reports."
        actions={
          isAdmin && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New application
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search applications"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search applications"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Active &amp; inactive</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            {isAdmin && <SelectItem value="archived">Archived</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={AppWindow}
          title={apps.length === 0 ? 'No applications yet' : 'No matching applications'}
          description={
            apps.length === 0
              ? isAdmin
                ? 'Create the first application to start organising tickets.'
                : 'An administrator has not created any applications yet.'
              : 'Try a different search or filter.'
          }
          action={
            apps.length === 0 &&
            isAdmin && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus /> New application
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((app, i) => (
            <motion.div
              key={app.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.2) }}
            >
              <Link
                to={`/applications/${app.id}`}
                className="focus-visible:ring-ring block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
              >
                <Card className="hover:border-primary/40 h-full transition-colors hover:shadow-sm">
                  <CardHeader className="gap-3">
                    <div className="flex items-start gap-3">
                      <AppIcon iconKey={app.icon_key} seed={app.name} muted={!!app.deleted_at || !app.is_active} />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-medium">{app.name}</h3>
                        <ApplicationStatusBadge app={app} />
                      </div>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 min-h-10 text-sm">
                      {app.description || 'No description.'}
                    </p>
                  </CardHeader>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {isAdmin && <ApplicationFormDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  )
}
