import type { Json } from '@tms/shared'
import type { JSONContent } from '@tiptap/react'
import { Loader2, MessageSquare, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ErrorState } from '@/components/common/states'
import { RichTextEditor } from '@/components/shared/rich-text/rich-text-editor'
import { RichTextViewer } from '@/components/shared/rich-text/rich-text-viewer'
import { UserAvatar } from '@/components/shared/user-avatar'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/features/auth/auth-context'
import { ATTACHMENT_BUCKET } from '@/features/tickets/api'
import { useUsers } from '@/features/users/hooks'
import { formatDateTime, timeAgo } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { TicketComment } from '../api'
import { useAddComment, useComments, useDeleteComment, useEditComment, useRestoreComment } from '../hooks'

function CommentItem({ comment, readOnly }: { comment: TicketComment; readOnly: boolean }) {
  const { profile, isAdmin } = useAuth()
  const { data: users } = useUsers()
  const edit = useEditComment()
  const remove = useDeleteComment()
  const restore = useRestoreComment()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<JSONContent | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const author = users?.find((u) => u.id === comment.user_id)?.full_name ?? 'Unknown user'
  const isOwn = comment.user_id === profile?.id
  const deleted = !!comment.deleted_at
  const edited = !deleted && new Date(comment.updated_at).getTime() - new Date(comment.created_at).getTime() > 1000
  const canEdit = !readOnly && !deleted && isOwn
  const canDelete = !readOnly && !deleted && (isOwn || isAdmin)

  return (
    <li className={cn('flex gap-3', deleted && 'opacity-60')}>
      <UserAvatar name={author} className="mt-0.5 size-8 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-medium">{author}</span>
          <time className="text-muted-foreground text-xs" dateTime={comment.created_at} title={formatDateTime(comment.created_at)}>
            {timeAgo(comment.created_at)}
          </time>
          {edited && <span className="text-muted-foreground text-xs" title={formatDateTime(comment.updated_at)}>(edited)</span>}
          {deleted && <span className="text-destructive text-xs">Deleted {formatDateTime(comment.deleted_at)}</span>}
          {(canEdit || canDelete || (deleted && isAdmin && !readOnly)) && !editing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="ml-auto size-7" aria-label="Comment actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onSelect={() => { setDraft(comment.content as JSONContent); setEditing(true) }}>
                    <Pencil /> Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                    <Trash2 /> {isOwn ? 'Delete' : 'Delete (moderate)'}
                  </DropdownMenuItem>
                )}
                {deleted && isAdmin && !readOnly && (
                  <DropdownMenuItem onSelect={() => restore.mutate(comment.id)}>
                    <RotateCcw /> Restore
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <RichTextEditor
              value={comment.content as JSONContent}
              onChange={setDraft}
              aria-label="Edit comment"
              images={profile ? { bucket: ATTACHMENT_BUCKET, folder: `inline/${profile.id}` } : undefined}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={edit.isPending}>Cancel</Button>
              <Button
                size="sm"
                disabled={!draft || edit.isPending}
                onClick={() =>
                  draft && edit.mutate({ id: comment.id, content: draft as Json }, { onSuccess: () => setEditing(false) })
                }
              >
                {edit.isPending && <Loader2 className="animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-muted/40 rounded-lg px-3 py-2">
            <RichTextViewer value={comment.content as JSONContent} emptyText="" />
          </div>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              {isOwn ? 'Your comment' : `${author}'s comment`} will be hidden. The deletion is recorded in the activity log and an administrator can restore it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => remove.mutate(comment.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

export function CommentsSection({ ticketId, readOnly }: { ticketId: string; readOnly: boolean }) {
  const { profile, isAdmin } = useAuth()
  const [showDeleted, setShowDeleted] = useState(false)
  const { data: comments, isPending, isError, error, refetch } = useComments(ticketId, isAdmin && showDeleted)
  const add = useAddComment()
  const [draft, setDraft] = useState<JSONContent | null>(null)
  const [editorKey, setEditorKey] = useState(0)

  const submit = () => {
    if (!draft) return
    add.mutate(
      { ticketId, content: draft as Json },
      {
        onSuccess: () => {
          setDraft(null)
          setEditorKey((k) => k + 1)
        },
      },
    )
  }

  return (
    <section aria-labelledby="comments-heading" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 id="comments-heading" className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="size-4" /> Comments
          {comments && comments.length > 0 && <span className="text-muted-foreground font-normal">({comments.filter((c) => !c.deleted_at).length})</span>}
        </h2>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Switch id="show-deleted-comments" checked={showDeleted} onCheckedChange={setShowDeleted} />
            <Label htmlFor="show-deleted-comments" className="text-xs">Show deleted</Label>
          </div>
        )}
      </div>

      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} className="py-6" />
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">No comments yet.</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => <CommentItem key={c.id} comment={c} readOnly={readOnly} />)}
        </ul>
      )}

      {readOnly ? (
        <p className="text-muted-foreground text-xs">Comments are read-only for this ticket.</p>
      ) : (
        <div className="flex gap-3">
          {profile && <UserAvatar name={profile.full_name} className="mt-0.5 size-8 shrink-0" />}
          <div className="min-w-0 flex-1 space-y-2">
            <RichTextEditor
              key={editorKey}
              value={null}
              onChange={setDraft}
              placeholder="Add a comment…"
              aria-label="New comment"
              className="[&_.rich-text]:min-h-20"
              images={profile ? { bucket: ATTACHMENT_BUCKET, folder: `inline/${profile.id}` } : undefined}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={submit} disabled={!draft || add.isPending}>
                {add.isPending && <Loader2 className="animate-spin" />}
                Comment
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
