import { KB_EXTRACTABLE_EXTS, KB_MIME_BY_EXT, MAX_ATTACHMENT_BYTES, fileExtension, formatBytes } from '@tms/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Eye, FileText, Loader2, Paperclip, RefreshCw, Trash2, Upload } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { kbAttachmentUrl, requestExtraction, uploadKbAttachment, type KbAttachment, type KbRecord } from '../api'
import { kbKeys, useKbAttachments, useRemoveKbAttachment, useRetryExtraction } from '../hooks'

const ACCEPT = Object.keys(KB_MIME_BY_EXT).map((e) => `.${e}`).join(',')
const PREVIEWABLE = ['pdf', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp']

function ExtractionBadge({ att }: { att: KbAttachment }) {
  const meta = {
    pending: { label: 'Indexing…', className: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300', tip: 'Extracting text for search' },
    completed: { label: 'Searchable', className: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300', tip: 'Document text is included in search' },
    failed: { label: 'Not indexed', className: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300', tip: 'Text extraction failed; title and description are still searchable' },
    not_supported: { label: 'Title only', className: '', tip: 'Only .txt file contents are searchable. This document is found by the record title, description and notes.' },
  }[att.extraction_status]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={cn('gap-1 font-normal', meta.className)}>
          {att.extraction_status === 'pending' && <Loader2 className="size-3 animate-spin" />}
          {meta.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{meta.tip}</TooltipContent>
    </Tooltip>
  )
}

export function KbAttachments({ record, canManage }: { record: KbRecord; canManage: boolean }) {
  const queryClient = useQueryClient()
  const { data: attachments, isPending, isError, error, refetch } = useKbAttachments(record.id)
  const remove = useRemoveKbAttachment()
  const retry = useRetryExtraction()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploads, setUploads] = useState<{ id: string; name: string; progress: number }[]>([])
  const [dragging, setDragging] = useState(false)
  const [removing, setRemoving] = useState<KbAttachment | null>(null)
  const canWrite = canManage && !record.deleted_at

  async function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const ext = fileExtension(file.name)
      if (!KB_MIME_BY_EXT[ext]) { toast.error(`${file.name}: file type not allowed`); continue }
      if (file.size > MAX_ATTACHMENT_BYTES) { toast.error(`${file.name}: larger than ${formatBytes(MAX_ATTACHMENT_BYTES)}`); continue }
      if (file.size === 0) { toast.error(`${file.name}: file is empty`); continue }
      const id = crypto.randomUUID()
      setUploads((u) => [...u, { id, name: file.name, progress: 0 }])
      try {
        const attId = await uploadKbAttachment(record, file, (p) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress: p } : x))))
        toast.success(`${file.name} uploaded`)
        void queryClient.invalidateQueries({ queryKey: kbKeys.attachments(record.id) })
        if ((KB_EXTRACTABLE_EXTS as readonly string[]).includes(ext)) {
          // Fire and forget: status is polled; failures are recorded on the row.
          requestExtraction(attId)
            .catch((e) => toast.error(`${file.name}: ${errorMessage(e)}`))
            .finally(() => void queryClient.invalidateQueries({ queryKey: kbKeys.all }))
        }
      } catch (e) {
        toast.error(`${file.name}: ${errorMessage(e)}`)
      } finally {
        setUploads((u) => u.filter((x) => x.id !== id))
      }
    }
  }

  async function open(att: KbAttachment, download: boolean) {
    try {
      window.open(await kbAttachmentUrl(att, download), '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (canWrite && e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files)
  }

  return (
    <section aria-labelledby="kb-docs-heading" className="space-y-3">
      <h2 id="kb-docs-heading" className="flex items-center gap-2 text-sm font-semibold">
        <Paperclip className="size-4" /> Documents
        {attachments && attachments.length > 0 && <span className="text-muted-foreground font-normal">({attachments.length})</span>}
      </h2>

      {canWrite && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn('flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-5 text-center text-sm', dragging ? 'border-primary bg-primary/5' : '')}
        >
          <Upload className="text-muted-foreground size-5" aria-hidden />
          <p className="text-muted-foreground">
            Drag documents here or{' '}
            <button type="button" className="text-primary font-medium hover:underline" onClick={() => inputRef.current?.click()}>browse</button>
          </p>
          <p className="text-muted-foreground text-xs">PDF, Word, Excel, TXT, SQL, JSON, images · up to {formatBytes(MAX_ATTACHMENT_BYTES)}. Text inside .txt files is searchable; other documents are found by the record's title, description and notes.</p>
          <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); e.target.value = '' }} />
        </div>
      )}

      {uploads.map((u) => (
        <div key={u.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
          <Upload className="text-muted-foreground size-4" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-sm">{u.name}</p>
            <Progress value={u.progress} aria-label={`Uploading ${u.name}`} />
          </div>
          <span className="text-muted-foreground w-10 text-right text-xs">{u.progress}%</span>
        </div>
      ))}

      {isPending ? (
        <Skeleton className="h-14 w-full" />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} className="py-6" />
      ) : attachments.length === 0 ? (
        <p className="text-muted-foreground text-sm">No documents.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {attachments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <FileText className="text-muted-foreground size-5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={a.original_name}>{a.original_name}</p>
                <p className="text-muted-foreground text-xs">{formatBytes(a.size_bytes)} · {formatDateTime(a.created_at)}</p>
              </div>
              <ExtractionBadge att={a} />
              {canWrite && a.extraction_status === 'failed' && (
                <Button variant="ghost" size="icon-sm" aria-label={`Retry text extraction for ${a.original_name}`} disabled={retry.isPending} onClick={() => retry.mutate(a.id)}>
                  <RefreshCw />
                </Button>
              )}
              {PREVIEWABLE.includes(a.file_ext) && (
                <Button variant="ghost" size="icon-sm" aria-label={`Preview ${a.original_name}`} onClick={() => void open(a, false)}><Eye /></Button>
              )}
              <Button variant="ghost" size="icon-sm" aria-label={`Download ${a.original_name}`} onClick={() => void open(a, true)}><Download /></Button>
              {canWrite && (
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${a.original_name}`} onClick={() => setRemoving(a)}><Trash2 /></Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.original_name}?</AlertDialogTitle>
            <AlertDialogDescription>The document is hidden and excluded from search. The file is retained for audit.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => removing && remove.mutate(removing.id)}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
