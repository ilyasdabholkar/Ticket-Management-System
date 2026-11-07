import {
  TICKET_CATEGORY_META,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type TicketPriority,
  type TicketStatus,
} from '@tms/shared'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { CorrectionChanges, Ticket } from '../api'
import { useAdminCorrectTicket } from '../hooks'
import { ApplicationPicker, AssigneePicker } from './pickers'

type DateKey = 'started_on' | 'qa_deployed_on' | 'prod_deployed_on'
const DATE_FIELDS: { key: DateKey; label: string }[] = [
  { key: 'started_on', label: 'Started on' },
  { key: 'qa_deployed_on', label: 'QA deployed on' },
  { key: 'prod_deployed_on', label: 'Prod deployed on' },
]

/** ISO (UTC) -> value for <input type="datetime-local"> in local time, and back. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)

interface Props {
  ticket: Ticket
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Admin-only audited correction (spec §6.2, Q5). Sends only changed fields plus a mandatory reason
 * to admin_correct_ticket(), which bypasses the production lock inside the database and logs before/after.
 */
export function AdminCorrectionDialog({ ticket, open, onOpenChange }: Props) {
  const correct = useAdminCorrectTicket()
  const [title, setTitle] = useState(ticket.title)
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority)
  const [assignee, setAssignee] = useState<string | null>(ticket.assigned_to)
  const [appId, setAppId] = useState<string | null>(ticket.application_id)
  const [status, setStatus] = useState<TicketStatus>(ticket.status)
  const [dates, setDates] = useState<Record<DateKey, string>>({
    started_on: toLocalInput(ticket.started_on),
    qa_deployed_on: toLocalInput(ticket.qa_deployed_on),
    prod_deployed_on: toLocalInput(ticket.prod_deployed_on),
  })
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle(ticket.title)
    setPriority(ticket.priority)
    setAssignee(ticket.assigned_to)
    setAppId(ticket.application_id)
    setStatus(ticket.status)
    setDates({
      started_on: toLocalInput(ticket.started_on),
      qa_deployed_on: toLocalInput(ticket.qa_deployed_on),
      prod_deployed_on: toLocalInput(ticket.prod_deployed_on),
    })
    setReason('')
    setError(null)
  }, [open, ticket])

  const buildChanges = (): CorrectionChanges => {
    const c: CorrectionChanges = {}
    if (title.trim() !== ticket.title) c.title = title.trim()
    if (priority !== ticket.priority) c.priority = priority
    if (assignee !== ticket.assigned_to) c.assigned_to = assignee
    if (appId !== ticket.application_id) c.application_id = appId
    if (status !== ticket.status) c.status = status
    for (const { key } of DATE_FIELDS) {
      if (dates[key] !== toLocalInput(ticket[key])) c[key] = fromLocalInput(dates[key])
    }
    return c
  }

  const submit = async () => {
    const changes = buildChanges()
    if (Object.keys(changes).length === 0) return setError('Change at least one field.')
    if (changes.title !== undefined && (changes.title.length < 1 || changes.title.length > 255)) return setError('Title must be 1–255 characters.')
    if (reason.trim().length < 10) return setError('Explain the correction in at least 10 characters.')
    setError(null)
    await correct.mutateAsync({ id: ticket.id, changes, reason: reason.trim() })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !correct.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl!">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-amber-600" /> Admin correction · {ticket.ticket_number}
          </DialogTitle>
          <DialogDescription>
            For fixing mistakes, including on locked tickets. Only changed fields are saved, together with your reason, in the audit log.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="py-4">
          <Field>
            <FieldLabel htmlFor="ac-title">Title</FieldLabel>
            <Input id="ac-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ac-status">Status</FieldLabel>
              <Select value={status} onValueChange={(v) => setStatus(v as TicketStatus)}>
                <SelectTrigger id="ac-status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{TICKET_STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ac-priority">Priority</FieldLabel>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger id="ac-priority" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ac-assignee">Assignee</FieldLabel>
              <AssigneePicker id="ac-assignee" value={assignee} onChange={setAssignee} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ac-app">Application</FieldLabel>
              <ApplicationPicker
                id="ac-app"
                value={appId}
                onChange={setAppId}
                allowNone={!TICKET_CATEGORY_META[ticket.category].requiresApplication}
              />
            </Field>
          </div>
          {status !== ticket.status && ticket.status === 'prod_deployed' && (
            <Alert>
              <AlertDescription>
                Moving the ticket out of Prod Deployed unlocks it. Clear “Prod deployed on” if the deployment did not happen.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            {DATE_FIELDS.map(({ key, label }) => (
              <Field key={key}>
                <FieldLabel htmlFor={`ac-${key}`}>{label}</FieldLabel>
                <Input
                  id={`ac-${key}`}
                  type="datetime-local"
                  value={dates[key]}
                  onChange={(e) => setDates((d) => ({ ...d, [key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="ac-reason">Reason (required)</FieldLabel>
            <Textarea id="ac-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What was wrong and why is it being corrected?" />
            <FieldDescription>Stored permanently in the activity log.</FieldDescription>
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={correct.isPending}>Cancel</Button>
          <Button onClick={() => void submit().catch(() => {})} disabled={correct.isPending}>
            {correct.isPending && <Loader2 className="animate-spin" />}
            Apply correction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
