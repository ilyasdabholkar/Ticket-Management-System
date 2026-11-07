import { ATTACHMENT_MIME_BY_EXT, MAX_ATTACHMENT_BYTES, fileExtension, formatBytes } from '@tms/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Eye, File as FileIcon, FileImage, FileSpreadsheet, FileText, Paperclip, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/common/states'
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
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/features/auth/auth-context'
import { useUsers } from '@/features/users/hooks'
import { formatDateTime } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { attachmentUrl, uploadAttachment, type TicketAttachment } from '../api'
import { ticketKeys, useRemoveAttachment, useTicketAttachments } from '../hooks'

const ACCEPT = Object.keys(ATTACHMENT_MIME_BY_EXT).map((e) => `.${e}`).join(',')
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']

function iconFor(ext: string) {
  if (IMAGE_EXTS.includes(ext)) return FileImage
  if (['xls', 'xlsx'].includes(ext)) return FileSpreadsheet
  if (['pdf', 'doc', 'docx', 'txt', 'sql', 'json'].includes(ext)) return FileText
  return FileIcon
}

interface Upload {
  id: string
  name: string
  progress: number
  controller: AbortController
}

interface AttachmentsPanelProps {
  ticketId: string
  locked: boolean
}

export function AttachmentsPanel({ ticketId, locked }: AttachmentsPanelProps) {
  const { profile, isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const { data: attachments, isPending, isError, error, refetch } = useTicketAttachments(ticketId)
  const { data: users } = useUsers()
  const remove = useRemoveAttachment()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [dragging, setDragging] = useState(false)
  const [removing, setRemoving] = useState<TicketAttachment | null>(null)

  const nameOf = (id: string) => users?.find((u) => u.id === id)?.full_name ?? 'Unknown'

  async function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const ext = fileExtension(file.name)
      if (!ATTACHMENT_MIME_BY_EXT[ext]) {
        toast.error(`${file.name}: file type not allowed`)
        continue
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name}: larger than ${formatBytes(MAX_ATTACHMENT_BYTES)}`)
        continue
      }
      if (file.size === 0) {
        toast.error(`${file.name}: file is empty`)
        continue
      }
      const id = crypto.randomUUID()
      const controller = new AbortController()
      setUploads((u) => [...u, { id, name: file.name, progress: 0, controller }])
      try {
        await uploadAttachment(
          ticketId,
          file,
          (p) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))),
          controller.signal,
        )
        toast.success(`${file.name} uploaded`)
        void queryClient.invalidateQueries({ queryKey: ticketKeys.attachments(ticketId) })
        void queryClient.invalidateQueries({ queryKey: ticketKeys.activity(ticketId) })
      } catch (e) {
        if ((e as Error).name !== 'AbortError') toast.error(`${file.name}: ${errorMessage(e)}`)
      } finally {
        setUploads((u) => u.filter((x) => x.id !== id))
      }
    }
  }

  async function open(att: TicketAttachment, download: boolean) {
    try {
      const url = await attachmentUrl(att, download)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!locked && e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files)
  }

  return (
    <section aria-labelledby="attachments-heading" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="attachments-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="size-4" /> Attachments
          {attachments && attachments.length > 0 && <span className="text-muted-foreground font-normal">({attachments.length})</span>}
        </h2>
      </div>

      {!locked && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center text-sm transition-colors',
            dragging ? 'border-primary bg-primary/5' : 'border-border',
          )}
        >
          <Upload className="text-muted-foreground size-5" aria-hidden />
          <p className="text-muted-foreground">
            Drag files here or{' '}
            <button type="button" className="text-primary font-medium hover:underline" onClick={() => inputRef.current?.click()}>
              browse
            </button>
          </p>
          <p className="text-muted-foreground text-xs">
            Images, PDF, Word, Excel, TXT, SQL, JSON, ZIP · up to {formatBytes(MAX_ATTACHMENT_BYTES)}
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}

      {uploads.map((u) => (
        <div key={u.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
          <Upload className="text-muted-foreground size-4 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-sm">{u.name}</p>
            <Progress value={u.progress} aria-label={`Uploading ${u.name}`} />
          </div>
          <span className="text-muted-foreground w-10 text-right text-xs">{u.progress}%</span>
          <Button variant="ghost" size="icon-sm" aria-label={`Cancel ${u.name}`} onClick={() => u.controller.abort()}>
            <X />
          </Button>
        </div>
      ))}

      {isPending ? (
        <Skeleton className="h-14 w-full" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} className="py-6" />
      ) : attachments.length === 0 ? (
        <p className="text-muted-foreground text-sm">No attachments.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {attachments.map((a) => {
            const Icon = iconFor(a.file_ext)
            const canRemove = !locked && (a.uploaded_by === profile?.id || isAdmin)
            return (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={a.original_name}>{a.original_name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {formatBytes(a.size_bytes)} · {nameOf(a.uploaded_by)} · {formatDateTime(a.created_at)}
                  </p>
                </div>
                {(IMAGE_EXTS.includes(a.file_ext) || a.file_ext === 'pdf' || a.file_ext === 'txt') && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Preview ${a.original_name}`} onClick={() => void open(a, false)}>
                    <Eye />
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" aria-label={`Download ${a.original_name}`} onClick={() => void open(a, true)}>
                  <Download />
                </Button>
                {canRemove && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${a.original_name}`} onClick={() => setRemoving(a)}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.original_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The attachment is hidden from the ticket. The file is kept for audit purposes and the removal is recorded in the activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => removing && remove.mutate(removing.id)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
