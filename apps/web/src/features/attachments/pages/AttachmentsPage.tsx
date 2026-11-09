import { formatBytes, type TicketStatus } from '@tms/shared'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  File,
  FileArchive,
  FileBraces,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  Loader2,
  type LucideIcon,
  NotepadText,
  Paperclip,
  Search,
  Sheet,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { StatusBadge } from '@/components/shared/ticket-badges'
import { UserAvatar } from '@/components/shared/user-avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useUsers } from '@/features/users/hooks'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatDateTime, timeAgo } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import {
  ATTACHMENTS_PAGE_SIZE,
  ATTACHMENT_TYPE_GROUPS,
  attachmentLink,
  type AttachmentFilters,
  type AttachmentRow,
  type AttachmentTypeGroup,
} from '../api'
import { useAllAttachments } from '../hooks'

const ALL = '__all__'

interface FileKind {
  label: string
  icon: LucideIcon
  /** Tile colours (light + dark). */
  tile: string
}

const KIND = {
  pdf: { label: 'PDF', icon: FileText, tile: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  word: { label: 'Word', icon: FileType, tile: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  excel: { label: 'Excel', icon: FileSpreadsheet, tile: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' },
  csv: { label: 'CSV', icon: Sheet, tile: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300' },
  txt: { label: 'Text', icon: NotepadText, tile: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  sql: { label: 'SQL', icon: FileCode, tile: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  json: { label: 'JSON', icon: FileBraces, tile: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  image: { label: 'Image', icon: FileImage, tile: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300' },
  zip: { label: 'ZIP', icon: FileArchive, tile: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  other: { label: 'File', icon: File, tile: 'bg-muted text-muted-foreground' },
} satisfies Record<string, FileKind>

/** Icon + colour per file type; anything unrecognised gets the generic file icon. */
function fileKind(ext: string): FileKind {
  const e = ext.toLowerCase()
  if (e === 'pdf') return KIND.pdf
  if (e === 'doc' || e === 'docx') return KIND.word
  if (e === 'xls' || e === 'xlsx') return KIND.excel
  if (e === 'csv') return KIND.csv
  if (e === 'txt') return KIND.txt
  if (e === 'sql') return KIND.sql
  if (e === 'json') return KIND.json
  if ((ATTACHMENT_TYPE_GROUPS.image.exts as readonly string[]).includes(e)) return KIND.image
  if (e === 'zip') return KIND.zip
  return KIND.other
}

function useAttachmentParams() {
  const [params, setParams] = useSearchParams()
  const filters: AttachmentFilters = {
    search: params.get('q') ?? undefined,
    type: (params.get('type') as AttachmentTypeGroup) || undefined,
    uploader: params.get('uploader') || undefined,
    page: Number(params.get('page') ?? '1') || 1,
  }
  const set = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (!value || value === ALL) next.delete(key)
        else next.set(key, value)
        if (key !== 'page') next.delete('page')
        return next
      },
      { replace: true },
    )
  const hasFilters = ['q', 'type', 'uploader'].some((k) => params.has(k))
  return { filters, set, clear: () => setParams(new URLSearchParams(), { replace: true }), hasFilters }
}

function FileActions({ row }: { row: AttachmentRow }) {
  const [busy, setBusy] = useState<'open' | 'download' | null>(null)
  const go = async (download: boolean) => {
    setBusy(download ? 'download' : 'open')
    try {
      const url = await attachmentLink(row, download)
      if (download) {
        const a = document.createElement('a')
        a.href = url
        a.rel = 'noopener'
        a.click()
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon-sm" aria-label={`Open ${row.original_name}`} title="Open in a new tab" disabled={!!busy} onClick={() => void go(false)}>
        {busy === 'open' ? <Loader2 className="animate-spin" /> : <ExternalLink />}
      </Button>
      <Button variant="outline" size="sm" aria-label={`Download ${row.original_name}`} disabled={!!busy} onClick={() => void go(true)}>
        {busy === 'download' ? <Loader2 className="animate-spin" /> : <Download />}
        <span className="hidden sm:inline">Download</span>
      </Button>
    </div>
  )
}

export function Component() {
  const { filters, set, clear, hasFilters } = useAttachmentParams()
  const { data: users } = useUsers()
  const { data, isPending, isError, error, refetch, isFetching } = useAllAttachments(filters)
  const page = filters.page ?? 1
  const totalPages = data ? Math.max(1, Math.ceil(data.total / ATTACHMENTS_PAGE_SIZE)) : 1

  const [searchInput, setSearchInput] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchInput)
  useEffect(() => {
    if ((filters.search ?? '') !== debounced) set('q', debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  return (
    <div className="space-y-4">
      <PageHeader title="Attachments" description="Every file attached to a ticket. Open or download them here, or jump to the ticket." />

      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <div className="relative md:w-72">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input placeholder="Search by file name" className="pl-8" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label="Search attachments" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select value={filters.type ?? ALL} onValueChange={(v) => set('type', v)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="File type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All file types</SelectItem>
              {(Object.keys(ATTACHMENT_TYPE_GROUPS) as AttachmentTypeGroup[]).map((k) => (
                <SelectItem key={k} value={k}>{ATTACHMENT_TYPE_GROUPS[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.uploader ?? ALL} onValueChange={(v) => set('uploader', v)}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Uploaded by"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Anyone</SelectItem>
              {(users ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.full_name}{u.is_active ? '' : ' (inactive)'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); clear() }}>
              <X /> Clear
            </Button>
          )}
        </div>
      </div>

      {isPending ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.rows.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title={hasFilters ? 'No matching attachments' : 'No attachments yet'}
          description={hasFilters ? 'Try a different file name or filter.' : 'Files attached to tickets will appear here.'}
        />
      ) : (
        <Card className={`gap-0 py-0 transition-opacity ${isFetching ? 'opacity-70' : ''}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead className="hidden w-24 text-right sm:table-cell">Size</TableHead>
                <TableHead className="hidden md:table-cell">Ticket</TableHead>
                <TableHead className="hidden lg:table-cell">Uploaded by</TableHead>
                <TableHead className="hidden xl:table-cell">Uploaded</TableHead>
                <TableHead className="w-36"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((a) => {
                const kind = fileKind(a.file_ext)
                const Icon = kind.icon
                return (
                  <TableRow key={a.id}>
                    <TableCell className="w-full max-w-0">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`flex size-8 shrink-0 items-center justify-center rounded-md ${kind.tile}`} title={kind.label}>
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium" title={a.original_name}>{a.original_name}</p>
                          <p className="text-muted-foreground truncate text-xs">
                            <span>{kind.label}</span>
                            {a.file_ext.toUpperCase() !== kind.label.toUpperCase() && <span className="uppercase"> · {a.file_ext}</span>}
                            <span className="sm:hidden"> · {formatBytes(a.size_bytes)}</span>
                            <span className="md:hidden">
                              {' · '}
                              <Link to={`/tickets/${a.ticket.ticket_number}`} className="font-mono hover:underline">{a.ticket.ticket_number}</Link>
                            </span>
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right text-xs tabular-nums sm:table-cell">{formatBytes(a.size_bytes)}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Link to={`/tickets/${a.ticket.ticket_number}`} className="group flex max-w-64 min-w-0 flex-col">
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-medium group-hover:underline">{a.ticket.ticket_number}</span>
                          <StatusBadge status={a.ticket.status as TicketStatus} className="h-4 px-1 text-[0.6rem]" />
                        </span>
                        <span className="text-muted-foreground truncate text-xs" title={a.ticket.title}>{a.ticket.title}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="flex items-center gap-2">
                        <UserAvatar name={a.uploader?.full_name ?? '?'} className="size-6 text-[0.6rem]" />
                        <span className="max-w-32 truncate text-sm">{a.uploader?.full_name ?? 'Unknown'}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-xs xl:table-cell" title={formatDateTime(a.created_at)}>{timeAgo(a.created_at)}</TableCell>
                    <TableCell><FileActions row={a} /></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {data && data.total > 0 && (
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <span>
            {(page - 1) * ATTACHMENTS_PAGE_SIZE + 1}–{Math.min(page * ATTACHMENTS_PAGE_SIZE, data.total)} of {data.total}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => set('page', String(page - 1))}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={page >= totalPages} onClick={() => set('page', String(page + 1))}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
