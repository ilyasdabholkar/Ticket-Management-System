import { zodResolver } from '@hookform/resolvers/zod'
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_META,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  type Json,
} from '@tms/shared'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { RichTextEditor } from '@/components/shared/rich-text/rich-text-editor'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useAuth } from '@/features/auth/auth-context'
import { ATTACHMENT_BUCKET } from '../api'
import { useCreateTicket } from '../hooks'
import { ticketFormSchema, type TicketFormValues } from '../schemas'
import { ApplicationPicker, AssigneePicker } from './pickers'

interface CreateTicketSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultApplicationId?: string
}

export function CreateTicketSheet({ open, onOpenChange, defaultApplicationId }: CreateTicketSheetProps) {
  const { profile, isEmployee } = useAuth()
  const navigate = useNavigate()
  const create = useCreateTicket()
  // Remount the editor each time the sheet opens so it starts empty.
  const [editorKey, setEditorKey] = useState(0)

  const form = useForm<TicketFormValues>({
    resolver: zodResolver(ticketFormSchema),
    defaultValues: {
      category: 'development',
      application_id: defaultApplicationId ?? null,
      title: '',
      description: null,
      priority: 'medium',
      assigned_to: null,
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        category: 'development',
        application_id: defaultApplicationId ?? null,
        title: '',
        description: null,
        priority: 'medium',
        assigned_to: null,
      })
      setEditorKey((k) => k + 1)
    }
  }, [open, defaultApplicationId, form])

  const category = useWatch({ control: form.control, name: 'category' })
  const needsApp = TICKET_CATEGORY_META[category].requiresApplication

  const onSubmit = form.handleSubmit(async (v) => {
    const created = await create.mutateAsync({ ...v, description: v.description as Json | null })
    onOpenChange(false)
    navigate(`/tickets/${created.ticket_number}`)
  })

  const errors = form.formState.errors
  const pending = create.isPending

  return (
    <Sheet open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-2xl!">
        <form onSubmit={(e) => void onSubmit(e).catch(() => {})} noValidate className="flex min-h-full flex-col">
          <SheetHeader>
            <SheetTitle>Create ticket</SheetTitle>
            <SheetDescription>The ticket number is assigned automatically from the category.</SheetDescription>
          </SheetHeader>

          <FieldGroup className="flex-1 px-4 pb-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.category}>
                <FieldLabel htmlFor="t-category">Category</FieldLabel>
                <Controller
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="t-category" className="w-full">
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
                  )}
                />
              </Field>
              <Field data-invalid={!!errors.application_id}>
                <FieldLabel htmlFor="t-app">Application{needsApp ? '' : ' (optional)'}</FieldLabel>
                <Controller
                  control={form.control}
                  name="application_id"
                  render={({ field }) => (
                    <ApplicationPicker
                      id="t-app"
                      value={field.value}
                      onChange={field.onChange}
                      allowNone={!needsApp}
                      invalid={!!errors.application_id}
                    />
                  )}
                />
                <FieldError errors={[errors.application_id]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="t-title">Title</FieldLabel>
              <Input id="t-title" autoFocus aria-invalid={!!errors.title} {...form.register('title')} />
              <FieldError errors={[errors.title]} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="t-priority">Priority</FieldLabel>
                <Controller
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="t-priority" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TICKET_PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {TICKET_PRIORITY_LABELS[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="t-assignee">Assignee</FieldLabel>
                  {profile && isEmployee && (
                    <button
                      type="button"
                      className="text-primary text-xs hover:underline"
                      onClick={() => form.setValue('assigned_to', profile.id, { shouldDirty: true })}
                    >
                      Assign to me
                    </button>
                  )}
                </div>
                <Controller
                  control={form.control}
                  name="assigned_to"
                  render={({ field }) => <AssigneePicker id="t-assignee" value={field.value} onChange={field.onChange} />}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="t-description">Description</FieldLabel>
              <Controller
                control={form.control}
                name="description"
                render={({ field }) => (
                  <RichTextEditor
                    key={editorKey}
                    id="t-description"
                    aria-label="Description"
                    value={null}
                    onChange={field.onChange}
                    placeholder="Describe the work, steps to reproduce, expected result…"
                    images={profile ? { bucket: ATTACHMENT_BUCKET, folder: `inline/${profile.id}` } : undefined}
                  />
                )}
              />
              <FieldDescription>Files can be attached after the ticket is created.</FieldDescription>
            </Field>
          </FieldGroup>

          <SheetFooter className="bg-background sticky bottom-0 flex-row justify-end border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Create ticket
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
