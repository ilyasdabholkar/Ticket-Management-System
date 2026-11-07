import { zodResolver } from '@hookform/resolvers/zod'
import {
  KB_CATEGORIES,
  KB_CATEGORY_LABELS,
  KB_DOCUMENT_TYPES,
  KB_DOCUMENT_TYPE_LABELS,
  type Json,
} from '@tms/shared'
import type { JSONContent } from '@tiptap/react'
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
import { Textarea } from '@/components/ui/textarea'
import { useApplications } from '@/features/applications/hooks'
import { useAuth } from '@/features/auth/auth-context'
import { KB_BUCKET, type KbRecord } from '../api'
import { useCreateKb, useUpdateKb } from '../hooks'
import { kbFormSchema, type KbFormInput, type KbFormValues } from '../schemas'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  record?: KbRecord | null
  defaultApplicationId?: string
}

export function KbFormSheet({ open, onOpenChange, record, defaultApplicationId }: Props) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { data: apps } = useApplications()
  const create = useCreateKb()
  const update = useUpdateKb()
  const pending = create.isPending || update.isPending
  const [editorKey, setEditorKey] = useState(0)

  const form = useForm<KbFormInput, unknown, KbFormValues>({
    resolver: zodResolver(kbFormSchema),
    defaultValues: { application_id: '', title: '', description: '', document_type: 'note', category: 'general_notes', content: null },
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      record
        ? {
            application_id: record.application_id,
            title: record.title,
            description: record.description ?? '',
            document_type: record.document_type,
            category: record.category,
            content: (record.content as JSONContent | null) ?? null,
          }
        : {
            application_id: defaultApplicationId ?? '',
            title: '',
            description: '',
            document_type: 'note',
            category: 'general_notes',
            content: null,
          },
    )
    setEditorKey((k) => k + 1)
  }, [open, record, defaultApplicationId, form])

  const docType = useWatch({ control: form.control, name: 'document_type' })
  // Archived applications cannot receive KB records; inactive ones still can.
  const appOptions = (apps ?? []).filter((a) => !a.deleted_at || a.id === record?.application_id)

  const onSubmit = form.handleSubmit(async (v) => {
    const input = { ...v, content: (v.content as Json | null) ?? null }
    if (record) {
      await update.mutateAsync({ id: record.id, input })
      onOpenChange(false)
    } else {
      const created = await create.mutateAsync(input)
      onOpenChange(false)
      navigate(`/knowledge-base/${created.id}`)
    }
  })
  const errors = form.formState.errors

  return (
    <Sheet open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-2xl!">
        <form onSubmit={(e) => void onSubmit(e).catch(() => {})} noValidate className="flex min-h-full flex-col">
          <SheetHeader>
            <SheetTitle>{record ? 'Edit knowledge base record' : 'New knowledge base record'}</SheetTitle>
            <SheetDescription>Notes hold rich-text content; documents hold uploaded files (added after saving).</SheetDescription>
          </SheetHeader>
          <FieldGroup className="flex-1 px-4 pb-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.application_id}>
                <FieldLabel htmlFor="kb-app">Application</FieldLabel>
                <Controller
                  control={form.control}
                  name="application_id"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <SelectTrigger id="kb-app" className="w-full" aria-invalid={!!errors.application_id}>
                        <SelectValue placeholder="Select application" />
                      </SelectTrigger>
                      <SelectContent>
                        {appOptions.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}{a.is_active ? '' : ' (inactive)'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.application_id]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="kb-category">Category</FieldLabel>
                <Controller
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="kb-category" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {KB_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{KB_CATEGORY_LABELS[c]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="kb-title">Title</FieldLabel>
              <Input id="kb-title" aria-invalid={!!errors.title} {...form.register('title')} />
              <FieldError errors={[errors.title]} />
            </Field>
            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="kb-description">Description</FieldLabel>
              <Textarea id="kb-description" rows={2} aria-invalid={!!errors.description} {...form.register('description')} />
              <FieldError errors={[errors.description]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="kb-type">Type</FieldLabel>
              <Controller
                control={form.control}
                name="document_type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="kb-type" className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {KB_DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{KB_DOCUMENT_TYPE_LABELS[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>
                {docType === 'note' ? 'Write the content below. Files can still be attached.' : 'Upload files on the next screen. A note body is optional.'}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="kb-content">{docType === 'note' ? 'Content' : 'Notes (optional)'}</FieldLabel>
              <Controller
                control={form.control}
                name="content"
                render={({ field }) => (
                  <RichTextEditor
                    key={editorKey}
                    id="kb-content"
                    aria-label="Content"
                    value={(record?.content as JSONContent | null) ?? null}
                    onChange={field.onChange}
                    placeholder="Technical notes, SQL queries, API details, troubleshooting steps…"
                    images={profile ? { bucket: KB_BUCKET, folder: `inline/${profile.id}` } : undefined}
                  />
                )}
              />
            </Field>
          </FieldGroup>
          <SheetFooter className="bg-background sticky bottom-0 flex-row justify-end border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {record ? 'Save changes' : 'Create'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
