import { zodResolver } from '@hookform/resolvers/zod'
import { USER_ROLES, USER_ROLE_META, type UserRole } from '@tms/shared'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { Checkbox } from '@/components/ui/checkbox'
import type { Profile } from '@/features/auth/api'
import { useCreateUser, useUpdateUser } from '../hooks'
import { createUserSchema, editUserSchema, type CreateUserValues } from '../schemas'

const sameRoles = (a: readonly UserRole[], b: readonly UserRole[]) =>
  a.length === b.length && a.every((r) => b.includes(r))

interface UserFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When provided the dialog edits this user; otherwise it creates one. */
  user?: Profile | null
  /** Editing yourself: the Admin role cannot be removed. */
  lockRole?: boolean
}

export function UserFormDialog({ open, onOpenChange, user, lockRole }: UserFormDialogProps) {
  const isEdit = !!user
  const create = useCreateUser()
  const update = useUpdateUser()
  const pending = create.isPending || update.isPending

  const form = useForm<CreateUserValues>({
    // Edit mode has no password field.
    resolver: zodResolver(isEdit ? (editUserSchema as unknown as typeof createUserSchema) : createUserSchema),
    defaultValues: { full_name: '', email: '', roles: ['employee'], password: '' },
  })

  useEffect(() => {
    if (open) {
      form.reset(
        user
          ? { full_name: user.full_name, email: user.email, roles: [...user.roles], password: '' }
          : { full_name: '', email: '', roles: ['employee'], password: '' },
      )
    }
  }, [open, user, form])

  const onSubmit = form.handleSubmit(async (v) => {
    if (user) {
      // Send only changed fields.
      await update.mutateAsync({
        user_id: user.id,
        ...(v.full_name !== user.full_name ? { full_name: v.full_name } : {}),
        ...(v.email !== user.email ? { email: v.email } : {}),
        ...(sameRoles(v.roles, user.roles) ? {} : { roles: v.roles }),
      })
    } else {
      await create.mutateAsync(v)
    }
    onOpenChange(false)
  })

  const errors = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void onSubmit(e).catch(() => {})} noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit user' : 'Add user'}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? 'Update the user’s details and role.'
                : 'The user signs in with this email and temporary password, then changes it from their profile.'}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup className="py-6">
            <Field data-invalid={!!errors.full_name}>
              <FieldLabel htmlFor="u-name">Full name</FieldLabel>
              <Input id="u-name" aria-invalid={!!errors.full_name} {...form.register('full_name')} />
              <FieldError errors={[errors.full_name]} />
            </Field>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="u-email">Email</FieldLabel>
              <Input id="u-email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...form.register('email')} />
              <FieldError errors={[errors.email]} />
            </Field>
            <Field data-invalid={!!errors.roles}>
              <FieldLabel id="u-roles-label">Roles</FieldLabel>
              <Controller
                control={form.control}
                name="roles"
                render={({ field }) => (
                  <div role="group" aria-labelledby="u-roles-label" className="space-y-2">
                    {USER_ROLES.map((r) => {
                      const checked = field.value.includes(r)
                      const locked = lockRole && r === 'admin'
                      return (
                        <label key={r} className="hover:bg-accent/50 flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-70">
                          <Checkbox
                            checked={checked}
                            disabled={locked}
                            onCheckedChange={(c) =>
                              field.onChange(c ? [...field.value, r] : field.value.filter((x) => x !== r))
                            }
                            aria-label={USER_ROLE_META[r].label}
                            className="mt-0.5"
                          />
                          <span className="space-y-0.5">
                            <span className="block text-sm font-medium">{USER_ROLE_META[r].label}</span>
                            <span className="text-muted-foreground block text-xs">{USER_ROLE_META[r].description}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              />
              {lockRole && <FieldDescription>You cannot remove your own Admin role.</FieldDescription>}
              <FieldError errors={[errors.roles]} />
            </Field>
            {!isEdit && (
              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="u-password">Temporary password</FieldLabel>
                <Input
                  id="u-password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  {...form.register('password')}
                />
                <FieldDescription>At least 8 characters. Share it with the user securely.</FieldDescription>
                <FieldError errors={[errors.password]} />
              </Field>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {isEdit ? 'Save changes' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
