import {
  TICKET_CATEGORY_META,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  type Json,
  type TicketPriority,
} from '@tms/shared'
import type { JSONContent } from '@tiptap/react'
import { ArrowLeft, Check, Copy, Loader2, Lock, Pencil, RotateCcw, SearchX, ShieldAlert, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, ErrorState } from '@/components/common/states'
import { RichTextEditor } from '@/components/shared/rich-text/rich-text-editor'
import { RichTextViewer } from '@/components/shared/rich-text/rich-text-viewer'
import { CategoryBadge, PriorityBadge, StatusBadge } from '@/components/shared/ticket-badges'
import { UserAvatar } from '@/components/shared/user-avatar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { EmailDraftSheet } from '@/features/ai/components/email-draft-sheet'
import { TicketSummaryDialog } from '@/features/ai/components/ticket-summary-dialog'
import { useAuth } from '@/features/auth/auth-context'
import { CommentsSection } from '@/features/comments/components/comments-section'
import { EffortSection } from '@/features/effort-logs/components/effort-section'
import { useUsers } from '@/features/users/hooks'
import { formatDateTime } from '@/lib/dates'
import { ATTACHMENT_BUCKET, type Ticket } from '../api'
import { ActivityTimeline } from '../components/activity-timeline'
import { AdminCorrectionDialog } from '../components/admin-correction-dialog'
import { StatusControl } from '../components/status-control'
import { StatusHistoryCard } from '../components/status-history'
import { AttachmentsPanel } from '../components/attachments-panel'
import { ChangeCategoryDialog } from '../components/change-category-dialog'
import { ApplicationPicker, AssigneePicker } from '../components/pickers'
import { useRestoreTicket, useSoftDeleteTicket, useTicketAliases, useTicketByNumber, useUpdateTicket } from '../hooks'
import { titleSchema } from '../schemas'

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function TitleEditor({ ticket, readOnly }: { ticket: Ticket; readOnly: boolean }) {
  const update = useUpdateTicket()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(ticket.title)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setValue(ticket.title), [ticket.title])

  const save = async () => {
    const parsed = titleSchema.safeParse(value)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid title')
    if (parsed.data !== ticket.title) await update.mutateAsync({ id: ticket.id, patch: { title: parsed.data } })
    setEditing(false)
    setError(null)
  }

  if (!editing) {
    return (
      <div className="group flex items-start gap-2">
        <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">{ticket.title}</h1>
        {!readOnly && (
          <Button variant="ghost" size="icon-sm" className="shrink-0 opacity-60 group-hover:opacity-100" aria-label="Edit title" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        )}
      </div>
    )
  }
  return (
    <form
      className="space-y-1"
      onSubmit={(e) => {
        e.preventDefault()
        void save().catch(() => {})
      }}
    >
      <div className="flex gap-2">
        <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label="Title" aria-invalid={!!error} className="text-lg font-semibold" />
        <Button type="submit" size="icon" aria-label="Save title" disabled={update.isPending}>
          {update.isPending ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(false); setValue(ticket.title); setError(null) }}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </form>
  )
}

function DescriptionSection({ ticket, readOnly }: { ticket: Ticket; readOnly: boolean }) {
  const { profile } = useAuth()
  const update = useUpdateTicket()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<JSONContent | null>(null)

  const save = async () => {
    await update.mutateAsync({ id: ticket.id, patch: { description: draft as Json | null } })
    setEditing(false)
  }

  return (
    <section aria-labelledby="desc-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="desc-heading" className="text-sm font-semibold">Description</h2>
        {!readOnly && !editing && (
          <Button variant="ghost" size="sm" onClick={() => { setDraft(ticket.description as JSONContent | null); setEditing(true) }}>
            <Pencil /> Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <RichTextEditor
            value={ticket.description as JSONContent | null}
            onChange={setDraft}
            aria-label="Description"
            images={profile ? { bucket: ATTACHMENT_BUCKET, folder: `inline/${profile.id}` } : undefined}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={update.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save().catch(() => {})} disabled={update.isPending}>
              {update.isPending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <RichTextViewer value={ticket.description as JSONContent | null} bucket={ATTACHMENT_BUCKET} />
      )}
    </section>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-8 w-2/3" />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  )
}

export function Component() {
  const { ticketNumber } = useParams()
  const navigate = useNavigate()
  const { profile, isAdmin } = useAuth()
  const { data: lookup, isPending, isError, error, refetch } = useTicketByNumber(ticketNumber)
  const ticket = lookup && 'ticket' in lookup ? lookup.ticket : null
  const { data: aliases } = useTicketAliases(ticket?.id)
  const { data: users } = useUsers()
  const update = useUpdateTicket()
  const softDelete = useSoftDeleteTicket()
  const restore = useRestoreTicket()
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [correctionOpen, setCorrectionOpen] = useState(false)

  if (isPending) return <DetailSkeleton />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (lookup && 'redirectTo' in lookup) return <Navigate to={`/tickets/${lookup.redirectTo}`} replace />
  if (!ticket) {
    return (
      <EmptyState
        icon={SearchX}
        title={`Ticket ${ticketNumber?.toUpperCase()} not found`}
        description="It may not exist or may have been deleted."
        action={<Button asChild variant="outline" size="sm"><Link to="/tickets">Back to tickets</Link></Button>}
      />
    )
  }

  const locked = ticket.status === 'prod_deployed'
  const deleted = !!ticket.deleted_at
  const readOnly = locked || deleted
  const canDelete = !readOnly && (ticket.created_by === profile?.id || isAdmin)
  const nameOf = (id: string | null) => users?.find((u) => u.id === id)?.full_name
  const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: ticket.id, patch: p, silent: true })

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/tickets"><ArrowLeft /> Tickets</Link>
      </Button>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono text-sm"
            onClick={() => void navigator.clipboard.writeText(ticket.ticket_number).then(() => toast.success('Ticket ID copied'))}
            aria-label={`Copy ticket ID ${ticket.ticket_number}`}
          >
            {ticket.ticket_number} <Copy className="size-3" />
          </button>
          <StatusBadge status={ticket.status} />
          <CategoryBadge category={ticket.category} />
          <PriorityBadge priority={ticket.priority} />
        </div>
        <TitleEditor ticket={ticket} readOnly={readOnly} />
        {!deleted && (
          <div className="flex flex-wrap gap-2 pt-1">
            <TicketSummaryDialog key={`s-${ticket.id}`} ticketId={ticket.id} />
            <EmailDraftSheet key={`e-${ticket.id}`} ticketId={ticket.id} />
          </div>
        )}
      </div>

      {locked && (
        <Alert>
          <Lock />
          <AlertTitle>This ticket is locked</AlertTitle>
          <AlertDescription>
            It reached Prod Deployed on {formatDateTime(ticket.prod_deployed_on)}. Details, attachments, comments and effort can no longer be changed.{isAdmin && ' Use Admin correction to fix mistakes.'}
          </AlertDescription>
        </Alert>
      )}
      {deleted && (
        <Alert variant="destructive">
          <Trash2 />
          <AlertTitle>This ticket is deleted</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Deleted {formatDateTime(ticket.deleted_at)} by {nameOf(ticket.deleted_by) ?? 'unknown'}.
            {isAdmin && (
              <Button size="sm" variant="outline" disabled={restore.isPending} onClick={() => restore.mutate(ticket.id)}>
                <RotateCcw /> Restore
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-8">
          <DescriptionSection ticket={ticket} readOnly={readOnly} />
          <Separator />
          <AttachmentsPanel ticketId={ticket.id} locked={readOnly} />
          <Separator />
          <EffortSection ticketId={ticket.id} ticketNumber={ticket.ticket_number} readOnly={readOnly} />
          <Separator />
          <CommentsSection ticketId={ticket.id} readOnly={readOnly} />
          <Separator />
          <ActivityTimeline ticketId={ticket.id} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Property label="Status">
                <StatusControl ticket={ticket} disabled={readOnly} />
              </Property>
              <Property label="Category">
                <div className="flex items-center gap-2">
                  <CategoryBadge category={ticket.category} />
                  {!readOnly && (
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setCategoryOpen(true)}>Change</Button>
                  )}
                </div>
              </Property>
              <Property label="Application">
                <ApplicationPicker
                  value={ticket.application_id}
                  onChange={(v) => patch({ application_id: v })}
                  allowNone={!TICKET_CATEGORY_META[ticket.category].requiresApplication}
                  disabled={readOnly || update.isPending}
                  className="h-8"
                />
              </Property>
              <Property label="Assignee">
                <AssigneePicker value={ticket.assigned_to} onChange={(v) => patch({ assigned_to: v })} disabled={readOnly || update.isPending} className="h-8" />
              </Property>
              <Property label="Priority">
                <Select value={ticket.priority} onValueChange={(v) => patch({ priority: v as TicketPriority })} disabled={readOnly || update.isPending}>
                  <SelectTrigger className="h-8 w-full" aria-label="Priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Property>
              <Separator />
              <Property label="Reporter">
                <span className="flex items-center gap-2">
                  <UserAvatar name={nameOf(ticket.created_by) ?? '?'} className="size-5 text-[0.6rem]" />
                  <span className="truncate">{nameOf(ticket.created_by) ?? 'Unknown'}</span>
                </span>
              </Property>
              <Property label="Created">{formatDateTime(ticket.created_at)}</Property>
              <Property label="Updated">{formatDateTime(ticket.updated_at)}</Property>
              <Separator />
              <Property label="Started">{formatDateTime(ticket.started_on)}</Property>
              <Property label="QA deployed">{formatDateTime(ticket.qa_deployed_on)}</Property>
              <Property label="Prod deployed">{formatDateTime(ticket.prod_deployed_on)}</Property>
              {aliases && aliases.length > 0 && (
                <>
                  <Separator />
                  <Property label="Previous IDs">
                    <span className="font-mono text-xs">{aliases.map((a) => a.ticket_number).join(', ')}</span>
                  </Property>
                </>
              )}
            </CardContent>
          </Card>

          <StatusHistoryCard ticketId={ticket.id} />

          {isAdmin && !deleted && (
            <Button variant="outline" className="w-full" onClick={() => setCorrectionOpen(true)}>
              <ShieldAlert /> Admin correction
            </Button>
          )}

          {canDelete && (
            <Button variant="outline" className="text-destructive w-full" onClick={() => setDeleteOpen(true)}>
              <Trash2 /> Delete ticket
            </Button>
          )}
        </aside>
      </div>

      {!readOnly && <ChangeCategoryDialog ticket={ticket} open={categoryOpen} onOpenChange={setCategoryOpen} />}
      {isAdmin && !deleted && <AdminCorrectionDialog ticket={ticket} open={correctionOpen} onOpenChange={setCorrectionOpen} />}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {ticket.ticket_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The ticket is hidden from lists and the board. Its history is kept and an administrator can restore it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => softDelete.mutate(ticket.id, { onSuccess: () => navigate('/tickets') })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
