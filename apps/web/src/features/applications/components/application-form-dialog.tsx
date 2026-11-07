import { zodResolver } from '@hookform/resolvers/zod'
import { APP_ICON_KEYS } from '@tms/shared'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { AppIcon } from '@/components/shared/app-icon'
import { APP_ICONS } from '@/components/shared/app-icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { Application } from '../api'
import { useCreateApplication, useUpdateApplication } from '../hooks'
import { applicationSchema, type ApplicationFormInput, type ApplicationFormValues } from '../schemas'

interface ApplicationFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  application?: Application | null
}

const EMPTY: ApplicationFormInput = { name: '', description: '', icon_key: 'app-window', is_active: true }

export function ApplicationFormDialog({ open, onOpenChange, application }: ApplicationFormDialogProps) {
  const isEdit = !!application
  const navigate = useNavigate()
  const create = useCreateApplication()
  const update = useUpdateApplication()
  const pending = create.isPending || update.isPending

  const form = useForm<ApplicationFormInput, unknown, ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: EMPTY,
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      application
        ? {
            name: application.name,
            description: application.description ?? '',
            icon_key: (APP_ICON_KEYS as readonly string[]).includes(application.icon_key)
              ? (application.icon_key as ApplicationFormInput['icon_key'])
              : 'app-window',
            is_active: application.is_active,
          }
        : EMPTY,
    )
  }, [open, application, form])

  const name = useWatch({ control: form.control, name: 'name' })
  const iconKey = useWatch({ control: form.control, name: 'icon_key' })

  const onSubmit = form.handleSubmit(async (values) => {
    if (application) {
      await update.mutateAsync({ id: application.id, input: values })
      onOpenChange(false)
    } else {
      const created = await create.mutateAsync(values)
      onOpenChange(false)
      navigate(`/applications/${created.id}`)
    }
  })

  const errors = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={(e) => void onSubmit(e).catch(() => {})} noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit application' : 'New application'}</DialogTitle>
            <DialogDescription>
              Development and Support tickets belong to an application. Inactive applications cannot receive new tickets.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-6">
            <div className="flex items-start gap-3">
              <AppIcon iconKey={iconKey} seed={name || iconKey} className="mt-6 size-12" />
              <Field data-invalid={!!errors.name} className="flex-1">
                <FieldLabel htmlFor="app-name">Name</FieldLabel>
                <Input id="app-name" aria-invalid={!!errors.name} {...form.register('name')} />
                <FieldError errors={[errors.name]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="app-description">Description</FieldLabel>
              <Textarea id="app-description" rows={3} aria-invalid={!!errors.description} {...form.register('description')} />
              <FieldError errors={[errors.description]} />
            </Field>

            <Field>
              <FieldLabel id="app-icon-label">Icon</FieldLabel>
              <Controller
                control={form.control}
                name="icon_key"
                render={({ field }) => (
                  <div role="radiogroup" aria-labelledby="app-icon-label" className="grid grid-cols-6 gap-2 sm:grid-cols-10">
                    {APP_ICON_KEYS.map((key) => {
                      const Icon = APP_ICONS[key]
                      const selected = field.value === key
                      return (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={key.replace(/-/g, ' ')}
                          title={key.replace(/-/g, ' ')}
                          onClick={() => field.onChange(key)}
                          className={cn(
                            'flex aspect-square items-center justify-center rounded-md border transition-colors',
                            'hover:bg-accent focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                            selected && 'border-primary bg-primary/10 text-primary',
                          )}
                        >
                          <Icon className="size-4" />
                        </button>
                      )
                    })}
                  </div>
                )}
              />
            </Field>

            <Controller
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="app-active">Active</FieldLabel>
                    <FieldDescription>Inactive applications keep their history but cannot get new tickets.</FieldDescription>
                  </FieldContent>
                  <Switch id="app-active" checked={field.value} onCheckedChange={field.onChange} />
                </Field>
              )}
            />
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {isEdit ? 'Save changes' : 'Create application'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
