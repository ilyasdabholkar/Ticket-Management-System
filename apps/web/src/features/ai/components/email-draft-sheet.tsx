import { Copy, Loader2, Mail, RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { ErrorState } from '@/components/common/states'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { EMAIL_LENGTHS, EMAIL_PURPOSES, EMAIL_TECHNICALITY, EMAIL_TONES, type EmailDraft, type EmailOptions } from '../api'
import { copyText, useGenerateEmail } from '../hooks'

function OptionSelect<K extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: K; options: Record<K, string>; onChange: (v: K) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as K)}>
        <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.entries(options) as [K, string][]).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

const DEFAULTS: EmailOptions = { purpose: 'development_update', tone: 'professional', technicality: 'semi_technical', length: 'medium', instructions: '' }

export function EmailDraftSheet({ ticketId }: { ticketId: string }) {
  const [options, setOptions] = useState<EmailOptions>(DEFAULTS)
  const [generated, setGenerated] = useState<EmailDraft | null>(null) // last AI output applied to the editor
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [pending, setPending] = useState<EmailDraft | null>(null) // new draft waiting for "replace" confirmation
  const gen = useGenerateEmail()
  const set = <K extends keyof EmailOptions>(k: K, v: EmailOptions[K]) => setOptions((o) => ({ ...o, [k]: v }))
  const edited = !!generated && (subject !== generated.subject || body !== generated.body)

  const apply = (d: EmailDraft) => {
    setGenerated(d)
    setSubject(d.subject)
    setBody(d.body)
  }
  // Never silently overwrite manual edits.
  const generate = () => gen.mutate({ ticketId, options }, { onSuccess: (d) => (edited ? setPending(d) : apply(d)) })

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" className="btn-action btn-ai-email"><Mail /> Generate Email Draft</Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Sparkles className="size-4" /> Email draft</SheetTitle>
          <SheetDescription>
            AI writes a draft from this ticket&apos;s details, comments, history and effort. Review it before you send it yourself. Nothing is sent or saved.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <OptionSelect id="ai-purpose" label="Email purpose" value={options.purpose} options={EMAIL_PURPOSES} onChange={(v) => set('purpose', v)} />
            <OptionSelect id="ai-tone" label="Tone" value={options.tone} options={EMAIL_TONES} onChange={(v) => set('tone', v)} />
            <OptionSelect id="ai-tech" label="Technicality" value={options.technicality} options={EMAIL_TECHNICALITY} onChange={(v) => set('technicality', v)} />
            <OptionSelect id="ai-length" label="Length" value={options.length} options={EMAIL_LENGTHS} onChange={(v) => set('length', v)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-instr" className="text-xs">Additional instructions (optional)</Label>
            <Textarea
              id="ai-instr"
              rows={2}
              maxLength={1000}
              placeholder="e.g. Keep it suitable for management. Mention the deployment date."
              value={options.instructions}
              onChange={(e) => set('instructions', e.target.value)}
            />
          </div>
          <Button onClick={generate} disabled={gen.isPending} className="w-full sm:w-auto">
            {gen.isPending ? <Loader2 className="animate-spin" /> : generated ? <RefreshCw /> : <Sparkles />}
            {gen.isPending ? 'Generating…' : generated ? 'Regenerate' : 'Generate draft'}
          </Button>

          {gen.isError && <ErrorState title="Could not generate the email" error={gen.error} onRetry={generate} className="py-6" />}

          {gen.isPending && !generated ? (
            <div className="space-y-3"><Skeleton className="h-9 w-full" /><Skeleton className="h-64 w-full" /></div>
          ) : generated ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ai-subject" className="text-xs">Subject</Label>
                  <Button variant="ghost" size="xs" onClick={() => void copyText(subject, 'Subject')}><Copy /> Copy Subject</Button>
                </div>
                <Input id="ai-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ai-body" className="text-xs">Body</Label>
                  <Button variant="ghost" size="xs" onClick={() => void copyText(body, 'Email body')}><Copy /> Copy Body</Button>
                </div>
                <Textarea id="ai-body" rows={16} value={body} onChange={(e) => setBody(e.target.value)} className="leading-relaxed" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void copyText(`Subject: ${subject}\n\n${body}`, 'Email')}><Copy /> Copy Email</Button>
                {edited && <span className="text-muted-foreground text-xs">Edited. Regenerating will ask before replacing your changes.</span>}
              </div>
              {generated.used_context.length > 0 && <p className="text-muted-foreground text-xs">Based on: {generated.used_context.join(', ')}</p>}
            </div>
          ) : null}
        </div>

        <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Replace your edited draft?</AlertDialogTitle>
              <AlertDialogDescription>A new draft is ready. Replacing will discard the changes you made to the subject and body.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep my draft</AlertDialogCancel>
              <AlertDialogAction onClick={() => { if (pending) apply(pending); setPending(null) }}>Replace</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}
