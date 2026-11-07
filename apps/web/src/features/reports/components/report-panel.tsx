import { TICKET_CATEGORY_META, formatEffort, orgToday } from '@tms/shared'
import { Download, Eye, FileText, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/common/states'
import { StatusBadge } from '@/components/shared/ticket-badges'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useApplications } from '@/features/applications/hooks'
import { useAuth } from '@/features/auth/auth-context'
import { useUsers } from '@/features/users/hooks'
import { formatDateTime } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { getHeaderImageDataUrl, type ReportParams } from '../api'
import { useEffortReport, useReportSettings } from '../hooks'

const monthStart = () => `${orgToday().slice(0, 8)}01`

interface ReportPanelProps {
  /** Restricts the report to one application (application Reports tab). */
  applicationId?: string
}

export function ReportPanel({ applicationId }: ReportPanelProps) {
  const { profile, isAdmin, isEmployee } = useAuth()
  const { data: users } = useUsers()
  const { data: apps } = useApplications()
  const { data: settings } = useReportSettings()

  const employees = useMemo(() => (users ?? []).filter((u) => u.roles.includes('employee')), [users])
  // Default employee = the logged-in user (spec §9.1) when they hold the Employee role.
  const [userId, setUserId] = useState<string>(isEmployee && profile ? profile.id : '')
  const [start, setStart] = useState(monthStart())
  const [end, setEnd] = useState(orgToday())
  const [includeProduction, setIncludeProduction] = useState(false)
  const [params, setParams] = useState<ReportParams | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const validationError = !userId
    ? 'Select an employee.'
    : start > end
      ? 'The start date must be on or before the end date.'
      : null
  const { data: rows, isFetching, isError, error, refetch } = useEffortReport(params)
  const employee = users?.find((u) => u.id === params?.userId)
  const appName = applicationId ? apps?.find((a) => a.id === applicationId)?.name : null
  const total = (rows ?? []).reduce((sum, r) => sum + r.effort_minutes, 0)

  const generate = () => {
    if (validationError) return toast.error(validationError)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setParams({ userId, start, end, applicationId: applicationId ?? null })
  }

  async function buildPdf(): Promise<Blob | null> {
    if (!rows || !params || !employee || !settings) return null
    setPdfBusy(true)
    try {
      const [{ renderReportPdf }, headerImage] = await Promise.all([
        import('../pdf/report-document'),
        getHeaderImageDataUrl(settings.header_image_path),
      ])
      return await renderReportPdf({
        rows,
        includeProduction,
        employeeName: employee.full_name,
        employeeEmail: employee.email,
        start: params.start,
        end: params.end,
        companyName: settings.company_name,
        reportTitle: settings.report_title,
        footerText: settings.footer_text,
        headerImage,
        applicationName: appName,
        generatedAt: new Date(),
      })
    } catch (e) {
      toast.error(`Could not create the PDF: ${errorMessage(e)}`)
      return null
    } finally {
      setPdfBusy(false)
    }
  }

  const preview = async () => {
    const blob = await buildPdf()
    if (!blob) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(blob))
  }

  const download = async () => {
    const blob = await buildPdf()
    if (!blob || !employee || !params) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `effort-report_${employee.full_name.replace(/[^A-Za-z0-9]+/g, '-')}_${params.start}_${params.end}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))_auto] lg:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="rp-employee">Employee</Label>
            <Select value={userId || undefined} onValueChange={setUserId} disabled={!isAdmin}>
              <SelectTrigger id="rp-employee" className="w-full">
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {(isAdmin ? employees : employees.filter((u) => u.id === profile?.id)).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name}{u.is_active ? '' : ' (inactive)'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-start">Start date</Label>
            <Input id="rp-start" type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-end">End date</Label>
            <Input id="rp-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button onClick={generate} disabled={isFetching}>
            {isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Generate
          </Button>
          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
            <Checkbox checked={includeProduction} onCheckedChange={(c) => setIncludeProduction(c === true)} />
            Include production details (Prod status and Prod deployed timestamp)
          </label>
          {!isAdmin && !isEmployee && (
            <p className="text-muted-foreground text-sm sm:col-span-2 lg:col-span-4">Reports are available for users with the Employee role.</p>
          )}
        </CardContent>
      </Card>

      {!params ? (
        <EmptyState icon={FileText} title="Generate a report" description="Choose the employee and period, then select Generate to preview the tickets and download the PDF." />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !rows ? (
        <TableSkeleton rows={4} />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <span className="font-medium">{employee?.full_name}</span>
              <span className="text-muted-foreground"> · {params.start} to {params.end} · {rows.length} task{rows.length === 1 ? '' : 's'} · </span>
              <span className="font-medium tabular-nums">{formatEffort(total)}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void preview()} disabled={pdfBusy || !settings}>
                {pdfBusy ? <Loader2 className="animate-spin" /> : <Eye />} Preview PDF
              </Button>
              <Button onClick={() => void download()} disabled={pdfBusy || !settings}>
                {pdfBusy ? <Loader2 className="animate-spin" /> : <Download />} Download PDF
              </Button>
            </div>
          </div>

          {previewUrl && (
            <Card className="overflow-hidden py-0">
              <iframe title="Report PDF preview" src={previewUrl} className="h-[75svh] w-full border-0" />
            </Card>
          )}

          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-3"><CardTitle className="text-sm">Report contents</CardTitle></CardHeader>
            {rows.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-sm">No tickets were created by or assigned to this employee, and no effort was logged, in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task ID</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="hidden md:table-cell">Application</TableHead>
                      <TableHead className="hidden lg:table-cell">Category</TableHead>
                      <TableHead className="text-right">Efforts</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden xl:table-cell">Started</TableHead>
                      <TableHead className="hidden xl:table-cell">QA deployed</TableHead>
                      {includeProduction && <TableHead className="hidden xl:table-cell">Prod deployed</TableHead>}
                      <TableHead className="hidden sm:table-cell">Included because</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.ticket_id}>
                        <TableCell className="font-mono text-xs"><Link to={`/tickets/${r.ticket_number}`} className="hover:underline">{r.ticket_number}</Link></TableCell>
                        <TableCell className="max-w-64 truncate">{r.title}</TableCell>
                        <TableCell className="hidden md:table-cell">{r.application_name ?? '—'}</TableCell>
                        <TableCell className="hidden lg:table-cell">{TICKET_CATEGORY_META[r.category].label}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatEffort(r.effort_minutes)}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell className="hidden text-xs xl:table-cell">{formatDateTime(r.started_on)}</TableCell>
                        <TableCell className="hidden text-xs xl:table-cell">{formatDateTime(r.qa_deployed_on)}</TableCell>
                        {includeProduction && <TableCell className="hidden text-xs xl:table-cell">{formatDateTime(r.prod_deployed_on)}</TableCell>}
                        <TableCell className="hidden sm:table-cell">
                          <span className="flex flex-wrap gap-1">
                            {r.created_in_range && <Badge variant="outline" className="font-normal">Created/assigned</Badge>}
                            {r.effort_in_range && <Badge variant="outline" className="font-normal">Effort logged</Badge>}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4} className="font-medium">Total effort</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatEffort(total)}</TableCell>
                      <TableCell colSpan={includeProduction ? 5 : 4} />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
