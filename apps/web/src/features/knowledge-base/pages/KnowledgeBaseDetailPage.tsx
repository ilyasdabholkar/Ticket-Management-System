import { KB_CATEGORY_LABELS, KB_DOCUMENT_TYPE_LABELS } from '@tms/shared'
import type { JSONContent } from '@tiptap/react'
import { ArrowLeft, Pencil, RotateCcw, SearchX, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { EmptyState, ErrorState } from '@/components/common/states'
import { AppIcon } from '@/components/shared/app-icon'
import { RichTextViewer } from '@/components/shared/rich-text/rich-text-viewer'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useApplications } from '@/features/applications/hooks'
import { useAuth } from '@/features/auth/auth-context'
import { useUsers } from '@/features/users/hooks'
import { formatDateTime } from '@/lib/dates'
import { KB_BUCKET } from '../api'
import { KbAttachments } from '../components/kb-attachments'
import { KbFormSheet } from '../components/kb-form-sheet'
import { useDeleteKb, useKb, useRestoreKb } from '../hooks'

export function Component() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const { data: record, isPending, isError, error, refetch } = useKb(id)
  const { data: apps } = useApplications()
  const { data: users } = useUsers()
  const remove = useDeleteKb()
  const restore = useRestoreKb()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!record) {
    return (
      <EmptyState
        icon={SearchX}
        title="Record not found"
        description="It may have been deleted."
        action={<Button asChild variant="outline" size="sm"><Link to="/knowledge-base">Back to knowledge base</Link></Button>}
      />
    )
  }

  const app = apps?.find((a) => a.id === record.application_id)
  const nameOf = (uid: string | null) => users?.find((u) => u.id === uid)?.full_name ?? 'Unknown'
  const deleted = !!record.deleted_at

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/knowledge-base"><ArrowLeft /> Knowledge Base</Link>
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-normal">{KB_CATEGORY_LABELS[record.category]}</Badge>
            <Badge variant="outline" className="font-normal">{KB_DOCUMENT_TYPE_LABELS[record.document_type]}</Badge>
            {app && (
              <Link to={`/applications/${app.id}/knowledge-base`} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm">
                <AppIcon iconKey={app.icon_key} seed={app.name} className="size-5 rounded" /> {app.name}
              </Link>
            )}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight break-words">{record.title}</h1>
          {record.description && <p className="text-muted-foreground">{record.description}</p>}
          <p className="text-muted-foreground text-xs">
            Created by {nameOf(record.created_by)} · {formatDateTime(record.created_at)} · Updated {formatDateTime(record.updated_at)}
          </p>
        </div>
        {isAdmin && !deleted && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil /> Edit</Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteOpen(true)}><Trash2 /> Delete</Button>
          </div>
        )}
      </div>

      {deleted && (
        <Alert variant="destructive">
          <Trash2 />
          <AlertTitle>This record is deleted</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Deleted {formatDateTime(record.deleted_at)} by {nameOf(record.deleted_by)}.
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => restore.mutate(record.id)} disabled={restore.isPending}>
                <RotateCcw /> Restore
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {(record.document_type === 'note' || record.content) && (
        <section aria-label="Content" className="rounded-xl border p-4">
          <RichTextViewer value={record.content as JSONContent | null} bucket={KB_BUCKET} emptyText="No content." />
        </section>
      )}

      <Separator />
      <KbAttachments record={record} canManage={isAdmin} />

      {isAdmin && <KbFormSheet open={editOpen} onOpenChange={setEditOpen} record={record} />}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{record.title}”?</AlertDialogTitle>
            <AlertDialogDescription>The record and its documents are hidden from the knowledge base and search. An administrator can restore it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate(record.id, { onSuccess: () => navigate('/knowledge-base') })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
