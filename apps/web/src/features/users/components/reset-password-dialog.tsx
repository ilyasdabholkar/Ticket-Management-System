import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
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
import type { Profile } from '@/features/auth/api'
import { useResetUserPassword } from '../hooks'
import { resetPasswordSchema, type ResetPasswordValues } from '../schemas'

interface ResetPasswordDialogProps {
  user: Profile | null
  onOpenChange: (open: boolean) => void
}

export function ResetPasswordDialog({ user, onOpenChange }: ResetPasswordDialogProps) {
  const reset = useResetUserPassword()
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '' },
  })
  useEffect(() => {
    if (user) form.reset({ password: '' })
  }, [user, form])

  const onSubmit = form.handleSubmit(async ({ password }) => {
    await reset.mutateAsync({ user_id: user!.id, password })
    onOpenChange(false)
  })
  const errors = form.formState.errors

  return (
    <Dialog open={!!user} onOpenChange={(o) => !reset.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void onSubmit(e).catch(() => {})} noValidate>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>Set a new temporary password for {user?.full_name}.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-6">
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="rp-password">New temporary password</FieldLabel>
              <Input
                id="rp-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...form.register('password')}
              />
              <FieldDescription>At least 8 characters. Ask the user to change it after signing in.</FieldDescription>
              <FieldError errors={[errors.password]} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={reset.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={reset.isPending}>
              {reset.isPending && <Loader2 className="animate-spin" />}
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
