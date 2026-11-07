import { Archive, ArchiveRestore, ArrowLeft, Pencil, Plus, Power, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { EmptyState, ErrorState } from '@/components/common/states'
import { AppIcon } from '@/components/shared/app-icon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/features/auth/auth-context'
import { KbFormSheet } from '@/features/knowledge-base/components/kb-form-sheet'
import { KbList } from '@/features/knowledge-base/components/kb-list'
import { ReportPanel } from '@/features/reports/components/report-panel'
import { CreateTicketSheet } from '@/features/tickets/components/create-ticket-sheet'
import { TicketList } from '@/features/tickets/components/ticket-list'
import { useUsers } from '@/features/users/hooks'
import { ApplicationFormDialog } from '../components/application-form-dialog'
import { ApplicationStatusBadge } from '../components/application-status-badge'
import { ArchiveApplicationDialog } from '../components/archive-application-dialog'
import { useApplication, useUpdateApplication } from '../hooks'

const TABS = ['overview', 'tickets', 'knowledge-base', 'reports'] as const
type Tab = (typeof TABS)[number]

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}

export function Component() {
  const { applicationId, tab: tabParam } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const { data: app, isPending, isError, error, refetch } = useApplication(applicationId)
  const { data: users } = useUsers()
  const toggleActive = useUpdateApplication()
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)

  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'overview'
  const nameOf = (id: string | null) => (id && users?.find((u) => u.id === id)?.full_name) || '—'

  if (isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-32" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!app) {
    return (
      <EmptyState
        icon={SearchX}
        title="Application not found"
        description="It may not exist or you may not have access."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/applications">Back to applications</Link>
          </Button>
        }
      />
    )
  }

  const archived = !!app.deleted_at

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/applications">
          <ArrowLeft /> Applications
        </Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <AppIcon iconKey={app.icon_key} seed={app.name} muted={archived || !app.is_active} className="size-14" />
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{app.name}</h1>
            <ApplicationStatusBadge app={app} />
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            {!archived && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={toggleActive.isPending}
                  onClick={() => toggleActive.mutate({ id: app.id, input: { is_active: !app.is_active } })}
                >
                  <Power /> {app.is_active ? 'Deactivate' : 'Activate'}
                </Button>
              </>
            )}
            <Button variant={archived ? 'default' : 'outline'} size="sm" onClick={() => setArchiveOpen(true)}>
              {archived ? <ArchiveRestore /> : <Archive />}
              {archived ? 'Restore' : 'Archive'}
            </Button>
          </div>
        )}
      </div>

      {archived && (
        <Alert>
          <Archive />
          <AlertTitle>This application is archived</AlertTitle>
          <AlertDescription>
            It is read-only and hidden from lists. Its history stays available for tickets and reports.
          </AlertDescription>
        </Alert>
      )}
      {!archived && !app.is_active && (
        <Alert>
          <Power />
          <AlertTitle>This application is inactive</AlertTitle>
          <AlertDescription>New Development and Support tickets cannot be created for it.</AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => navigate(`/applications/${app.id}${v === 'overview' ? '' : `/${v}`}`)}>
        <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4 md:mx-0 md:px-0">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="knowledge-base">Knowledge Base</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm whitespace-pre-wrap">
                {app.description || <span className="text-muted-foreground">No description.</span>}
              </p>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="Created" value={dateTime.format(new Date(app.created_at))} />
                <Detail label="Created by" value={nameOf(app.created_by)} />
                <Detail label="Last updated" value={dateTime.format(new Date(app.updated_at))} />
                {archived && <Detail label="Archived" value={`${dateTime.format(new Date(app.deleted_at!))} by ${nameOf(app.deleted_by)}`} />}
              </dl>
              <p className="text-muted-foreground text-xs">Ticket and effort statistics are added with the dashboard (Phase 9).</p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="tickets" className="mt-4 space-y-4">
          {!archived && app.is_active && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus /> Create ticket
              </Button>
            </div>
          )}
          <TicketList applicationId={app.id} onCreate={!archived && app.is_active ? () => setCreateOpen(true) : undefined} />
        </TabsContent>
        <TabsContent value="knowledge-base" className="mt-4 space-y-4">
          {isAdmin && !archived && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setKbOpen(true)}>
                <Plus /> New record
              </Button>
            </div>
          )}
          <KbList applicationId={app.id} onCreate={isAdmin && !archived ? () => setKbOpen(true) : undefined} />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <ReportPanel applicationId={app.id} />
        </TabsContent>
      </Tabs>

      <CreateTicketSheet open={createOpen} onOpenChange={setCreateOpen} defaultApplicationId={app.id} />
      {isAdmin && <KbFormSheet open={kbOpen} onOpenChange={setKbOpen} defaultApplicationId={app.id} />}
      {isAdmin && (
        <>
          <ApplicationFormDialog open={editOpen} onOpenChange={setEditOpen} application={app} />
          <ArchiveApplicationDialog application={archiveOpen ? app : null} onOpenChange={(o) => !o && setArchiveOpen(false)} />
        </>
      )}
    </div>
  )
}
