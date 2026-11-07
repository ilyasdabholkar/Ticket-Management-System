import { zodResolver } from '@hookform/resolvers/zod'
import { ImageOff, Loader2, Upload } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ErrorState } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useHeaderPreview, useReportSettings, useUpdateReportSettings, useUploadHeaderImage } from '@/features/reports/hooks'
import { formatDateTime } from '@/lib/dates'

const schema = z.object({
  company_name: z.string().trim().min(1, 'Company name is required').max(120, 'At most 120 characters'),
  report_title: z.string().trim().min(1, 'Report title is required').max(160, 'At most 160 characters'),
  footer_text: z
    .string()
    .trim()
    .max(500, 'At most 500 characters')
    .transform((v) => (v === '' ? null : v)),
})
type Input = z.input<typeof schema>
type Output = z.output<typeof schema>

export function Component() {
  const { data: settings, isPending, isError, error, refetch } = useReportSettings()
  const { data: headerUrl } = useHeaderPreview(settings ? settings.header_image_path : undefined)
  const save = useUpdateReportSettings()
  const upload = useUploadHeaderImage()
  const fileRef = useRef<HTMLInputElement>(null)

  const form = useForm<Input, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues: { company_name: '', report_title: '', footer_text: '' },
  })
  useEffect(() => {
    if (settings) form.reset({ company_name: settings.company_name, report_title: settings.report_title, footer_text: settings.footer_text ?? '' })
  }, [settings, form])

  if (isPending) return <Skeleton className="h-96 w-full rounded-xl" />
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  const errors = form.formState.errors

  return (
    <div className="space-y-6">
      <PageHeader title="Report Settings" description="Appearance of the employee PDF reports (spec §9.6)." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
            <CardHeader>
              <CardTitle>Text</CardTitle>
              <CardDescription>Last updated {formatDateTime(settings.updated_at)}</CardDescription>
            </CardHeader>
            <CardContent className="py-6">
              <FieldGroup>
                <Field data-invalid={!!errors.company_name}>
                  <FieldLabel htmlFor="rs-company">Company name</FieldLabel>
                  <Input id="rs-company" aria-invalid={!!errors.company_name} {...form.register('company_name')} />
                  <FieldDescription>Centred in the letterhead footer of every page (e.g. CODE WITH Z).</FieldDescription>
                  <FieldError errors={[errors.company_name]} />
                </Field>
                <Field data-invalid={!!errors.report_title}>
                  <FieldLabel htmlFor="rs-title">Report title</FieldLabel>
                  <Input id="rs-title" aria-invalid={!!errors.report_title} {...form.register('report_title')} />
                  <FieldError errors={[errors.report_title]} />
                </Field>
                <Field data-invalid={!!errors.footer_text}>
                  <FieldLabel htmlFor="rs-footer">Footer text: address / contact (optional)</FieldLabel>
                  <Textarea id="rs-footer" rows={3} aria-invalid={!!errors.footer_text} {...form.register('footer_text')} />
                  <FieldDescription>Centred under the company name on every page. The generation time and page numbers are added automatically.</FieldDescription>
                  <FieldError errors={[errors.footer_text]} />
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
                {save.isPending && <Loader2 className="animate-spin" />} Save
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Header image</CardTitle>
            <CardDescription>PNG or JPEG, up to 2 MB. Shown top-right on every page, above the amber bar (letterhead from Template.docx).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 py-6">
            <div className="bg-muted/40 flex h-32 items-center justify-center rounded-lg border">
              {headerUrl ? (
                <img src={headerUrl} alt="Report header" className="max-h-24 max-w-[90%] object-contain" />
              ) : (
                <span className="text-muted-foreground flex items-center gap-2 text-sm"><ImageOff className="size-4" /> No header image</span>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) upload.mutate(f)
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />} {settings.header_image_path ? 'Replace image' : 'Upload image'}
              </Button>
              {settings.header_image_path && (
                <Button variant="ghost" onClick={() => save.mutate({ header_image_path: null })} disabled={save.isPending}>
                  Remove
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
