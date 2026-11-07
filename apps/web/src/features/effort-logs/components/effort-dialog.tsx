import { zodResolver } from '@hookform/resolvers/zod'
import { formatEffort, orgToday, toEffortMinutes } from '@tms/shared'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Combobox } from '@/components/shared/combobox'
import { UserAvatar } from '@/components/shared/user-avatar'
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
import { useAuth } from '@/features/auth/auth-context'
import { useUsers } from '@/features/users/hooks'
import type { EffortLog } from '../api'
import { useCreateEffort, useUpdateEffort } from '../hooks'
import { effortFormSchema, type EffortFormInput, type EffortFormValues } from '../schemas'

interface EffortDialogProps {
  ticketId: string
  ticketNumber: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit mode when provided. */
  entry?: EffortLog | null
}

export function EffortDialog({ ticketId, ticketNumber, open, onOpenChange, entry }: EffortDialogProps) {
  const { profile, isAdmin, isEmployee } = useAuth()
  const { data: users } = useUsers()
  const create = useCreateEffort()
  const update = useUpdateEffort()
  const pending = create.isPending || update.isPending

  const form = useForm<EffortFormInput, unknown, EffortFormValues>({
    resolver: zodResolver(effortFormSchema),
    defaultValues: { effort_date: orgToday(), effort_value: '' as unknown as number, effort_unit: 'hours', description: '' },
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      entry
        ? {
            effort_date: entry.effort_date,
            effort_value: Number(entry.effort_value),
            effort_unit: entry.effort_unit,
            description: entry.description ?? '',
          }
        : { effort_date: orgToday(), effort_value: '' as unknown as number, effort_unit: 'hours', description: '', user_id: isEmployee ? profile?.id : undefined },
    )
  }, [open, entry, form, profile?.id, isEmployee])

  const value = useWatch({ control: form.control, name: 'effort_value' })
  const unit = useWatch({ control: form.control, name: 'effort_unit' })
  const numeric = Number(value)
  const preview = Number.isFinite(numeric) && numeric > 0 ? toEffortMinutes(numeric, unit) : null

  const onSubmit = form.handleSubmit(async (v) => {
    const input = { effort_date: v.effort_date, effort_value: v.effort_value, effort_unit: v.effort_unit, description: v.description }
    if (entry) await update.mutateAsync({ id: entry.id, input })
    else {
      if (isAdmin && !v.user_id) {
        form.setError('user_id', { message: 'Select the employee this effort belongs to' })
        return
      }
      await create.mutateAsync({ ticketId, input, userId: isAdmin && v.user_id && v.user_id !== profile?.id ? v.user_id : undefined })
    }
    onOpenChange(false)
  })

  const errors = form.formState.errors
  const userOptions = (users ?? [])
    .filter((u) => u.is_active && u.roles.includes('employee'))
    .map((u) => ({ value: u.id, label: u.full_name, keywords: [u.email], icon: <UserAvatar name={u.full_name} className="size-5 text-[0.6rem]" /> }))

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void onSubmit(e).catch(() => {})} noValidate>
          <DialogHeader>
            <DialogTitle>{entry ? 'Edit effort' : 'Log effort'} · {ticketNumber}</DialogTitle>
            <DialogDescription>Effort is stored in minutes. 1.5 hours = 90 minutes.</DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-5">
            {isAdmin && !entry && (
              <Field data-invalid={!!errors.user_id}>
                <FieldLabel htmlFor="ef-user">Employee</FieldLabel>
                <Controller
                  control={form.control}
                  name="user_id"
                  render={({ field }) => (
                    <Combobox id="ef-user" options={userOptions} value={field.value ?? null} onChange={(v) => field.onChange(v ?? undefined)} aria-label="Employee" />
                  )}
                />
                <FieldDescription>Administrators can log effort on behalf of an employee.</FieldDescription>
                <FieldError errors={[errors.user_id]} />
              </Field>
            )}
            <Field data-invalid={!!errors.effort_date}>
              <FieldLabel htmlFor="ef-date">Date of work</FieldLabel>
              <Input id="ef-date" type="date" max={orgToday()} aria-invalid={!!errors.effort_date} {...form.register('effort_date')} />
              <FieldError errors={[errors.effort_date]} />
            </Field>
            <div className="grid grid-cols-[1fr_9rem] gap-3">
              <Field data-invalid={!!errors.effort_value}>
                <FieldLabel htmlFor="ef-value">Effort</FieldLabel>
                <Input
                  id="ef-value"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step={unit === 'hours' ? '0.25' : '1'}
                  autoFocus
                  aria-invalid={!!errors.effort_value}
                  {...form.register('effort_value')}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ef-unit">Unit</FieldLabel>
                <Controller
                  control={form.control}
                  name="effort_unit"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="ef-unit" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="minutes">Minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
            <div className="-mt-3 min-h-5 text-xs">
              {errors.effort_value ? (
                <FieldError errors={[errors.effort_value]} />
              ) : preview !== null ? (
                <span className="text-muted-foreground">= {preview} minutes ({formatEffort(preview)})</span>
              ) : null}
            </div>
            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="ef-desc">Work description (optional)</FieldLabel>
              <Textarea id="ef-desc" rows={3} aria-invalid={!!errors.description} {...form.register('description')} />
              <FieldError errors={[errors.description]} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {entry ? 'Save' : 'Log effort'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
