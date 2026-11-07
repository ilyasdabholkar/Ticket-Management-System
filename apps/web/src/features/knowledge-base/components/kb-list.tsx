import {
  KB_CATEGORIES,
  KB_CATEGORY_LABELS,
  KB_DOCUMENT_TYPES,
  KB_DOCUMENT_TYPE_LABELS,
  type KbCategory,
  type KbDocumentType,
} from '@tms/shared'
import { BookOpen, FileText, NotebookText, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useApplications } from '@/features/applications/hooks'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { timeAgo } from '@/lib/dates'
import type { KbFilters } from '../api'
import { useKbList } from '../hooks'
import { Snippet } from './snippet'

const ALL = '__all__'

export function KbList({ applicationId, onCreate }: { applicationId?: string; onCreate?: () => void }) {
  const [params, setParams] = useSearchParams()
  const { data: apps } = useApplications()
  const filters: KbFilters = {
    search: params.get('q') ?? undefined,
    applicationId: applicationId ?? (params.get('app') || undefined),
    category: (params.get('category') as KbCategory) || undefined,
    documentType: (params.get('type') as KbDocumentType) || undefined,
  }
  const set = (key: string, value: string | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (!value || value === ALL) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  const hasFilters = ['q', 'app', 'category', 'type'].some((k) => params.has(k))

  const [searchInput, setSearchInput] = useState(filters.search ?? '')
  const debounced = useDebouncedValue(searchInput, 350)
  useEffect(() => {
    if ((filters.search ?? '') !== debounced) set('q', debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const { data, isPending, isError, error, refetch, isFetching } = useKbList(filters)
  const appName = (id: string) => apps?.find((a) => a.id === id)?.name ?? ''

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder='Search titles, descriptions, notes and document text (e.g. "reset password" -legacy)'
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search knowledge base"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {!applicationId && (
            <Select value={filters.applicationId ?? ALL} onValueChange={(v) => set('app', v)}>
              <SelectTrigger className="w-full sm:w-48" aria-label="Application"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All applications</SelectItem>
                {(apps ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}{a.deleted_at ? ' (archived)' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={filters.category ?? ALL} onValueChange={(v) => set('category', v)}>
            <SelectTrigger className="w-full sm:w-52" aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {KB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{KB_CATEGORY_LABELS[c]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.documentType ?? ALL} onValueChange={(v) => set('type', v)}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Notes &amp; documents</SelectItem>
              {KB_DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{KB_DOCUMENT_TYPE_LABELS[t]}s</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setSearchInput(''); setParams(new URLSearchParams(), { replace: true }) }}>
              <X /> Clear
            </Button>
          )}
        </div>
      </div>

      {isPending ? (
        <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={filters.search ? 'No results' : hasFilters ? 'No matching records' : 'No knowledge base records yet'}
          description={filters.search ? 'Try different words, or remove filters.' : onCreate ? 'Create the first note or document.' : 'An administrator can add notes and documents.'}
          action={!hasFilters && onCreate ? <Button size="sm" onClick={onCreate}>New record</Button> : undefined}
        />
      ) : (
        <div className={`space-y-2 transition-opacity ${isFetching ? 'opacity-70' : ''}`}>
          {filters.search && <p className="text-muted-foreground text-xs">{data.length} result{data.length === 1 ? '' : 's'}, best match first</p>}
          {data.map((r) => {
            const Icon = r.document_type === 'document' ? FileText : NotebookText
            return (
              <Link key={r.id} to={`/knowledge-base/${r.id}`} className="focus-visible:ring-ring block rounded-xl focus-visible:ring-2 focus-visible:outline-none">
                <Card className="hover:border-primary/40 gap-0 px-4 py-3 transition-colors">
                  <div className="flex items-start gap-3">
                    <Icon className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{r.title}</h3>
                        <Badge variant="secondary" className="font-normal">{KB_CATEGORY_LABELS[r.category]}</Badge>
                        {!applicationId && <span className="text-muted-foreground text-xs">{appName(r.application_id)}</span>}
                      </div>
                      {r.snippet ? (
                        <p className="text-muted-foreground line-clamp-2 text-sm"><Snippet text={r.snippet} /></p>
                      ) : r.description ? (
                        <p className="text-muted-foreground line-clamp-2 text-sm">{r.description}</p>
                      ) : null}
                      <p className="text-muted-foreground text-xs">Updated {timeAgo(r.updated_at)}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
