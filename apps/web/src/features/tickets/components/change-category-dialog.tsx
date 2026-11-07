import { TICKET_CATEGORIES, TICKET_CATEGORY_META, type TicketCategory } from '@tms/shared'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Ticket } from '../api'
import { useChangeTicketCategory } from '../hooks'
import { ApplicationPicker } from './pickers'

interface Props {
  ticket: Ticket
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangeCategoryDialog({ ticket, open, onOpenChange }: Props) {
  const navigate = useNavigate()
  const change = useChangeTicketCategory()
  const [category, setCategory] = useState<TicketCategory>(ticket.category)
  const [appId, setAppId] = useState<string | null>(ticket.application_id)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCategory(ticket.category)
      setAppId(ticket.application_id)
      setError(null)
    }
  }, [open, ticket])

  const needsApp = TICKET_CATEGORY_META[category].requiresApplication
  const unchanged = category === ticket.category

  const submit = async () => {
    if (needsApp && !appId) {
      setError('Development and Support tickets require an application')
      return
    }
    const number = await change.mutateAsync({ id: ticket.id, category, applicationId: appId })
    onOpenChange(false)
    navigate(`/tickets/${number}`, { replace: true })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !change.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change category</DialogTitle>
          <DialogDescription>
            The ticket gets a new number in the new category. {ticket.ticket_number} keeps working as a link and in search.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="py-4">
          <Field>
            <FieldLabel htmlFor="cc-category">New category</FieldLabel>
            <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
              <SelectTrigger id="cc-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TICKET_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {TICKET_CATEGORY_META[c].label} ({TICKET_CATEGORY_META[c].prefix})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {needsApp && !ticket.application_id && (
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="cc-app">Application</FieldLabel>
              <ApplicationPicker id="cc-app" value={appId} onChange={setAppId} invalid={!!error} />
              <FieldError>{error}</FieldError>
            </Field>
          )}
          {!unchanged && (
            <Alert>
              <AlertDescription>
                New number: <strong>{TICKET_CATEGORY_META[category].prefix}-…</strong> (assigned on save)
              </AlertDescription>
            </Alert>
          )}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={change.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit().catch(() => {})} disabled={unchanged || change.isPending}>
            {change.isPending && <Loader2 className="animate-spin" />}
            Change category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
