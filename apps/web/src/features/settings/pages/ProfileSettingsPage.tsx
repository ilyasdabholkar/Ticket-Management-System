import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { PageHeader } from '@/components/layout/page-header'
import { UserAvatar } from '@/components/shared/user-avatar'
import { RoleBadges } from '@/components/shared/role-badges'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { changeMyPassword, updateMyFullName } from '@/features/auth/api'
import { authKeys, useAuth } from '@/features/auth/auth-context'
import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordValues,
  type ProfileValues,
} from '@/features/auth/schemas'
import { errorMessage } from '@/lib/errors'

function ProfileForm() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: profile?.full_name ?? '' },
  })
  useEffect(() => {
    if (profile) form.reset({ full_name: profile.full_name })
  }, [profile, form])

  const mutation = useMutation({
    mutationFn: (v: ProfileValues) => updateMyFullName(profile!.id, v.full_name),
    onSuccess: () => {
      toast.success('Profile updated')
      void queryClient.invalidateQueries({ queryKey: authKeys.profile(profile?.id) })
      void queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (!profile) return null
  const errors = form.formState.errors

  return (
    <Card>
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your name appears on tickets, comments and reports.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 py-6">
          <div className="flex items-center gap-3">
            <UserAvatar name={profile.full_name} className="size-12" />
            <div className="min-w-0">
              <p className="truncate font-medium">{profile.full_name}</p>
              <p className="text-muted-foreground truncate text-sm">{profile.email}</p>
            </div>
            <RoleBadges roles={profile.roles} className="ml-auto" />
          </div>
          <FieldGroup>
            <Field data-invalid={!!errors.full_name}>
              <FieldLabel htmlFor="full_name">Full name</FieldLabel>
              <Input id="full_name" aria-invalid={!!errors.full_name} {...form.register('full_name')} />
              <FieldError errors={[errors.full_name]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" value={profile.email} disabled readOnly />
              <FieldDescription>Only an administrator can change your email or roles.</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={mutation.isPending || !form.formState.isDirty}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function PasswordForm() {
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: '', confirm: '' },
  })
  const mutation = useMutation({
    mutationFn: (v: ChangePasswordValues) => changeMyPassword(v.password),
    onSuccess: () => {
      toast.success('Password changed')
      form.reset()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const errors = form.formState.errors

  return (
    <Card>
      <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Use at least 8 characters. Change the temporary password you were given.</CardDescription>
        </CardHeader>
        <CardContent className="py-6">
          <FieldGroup>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="new-password">New password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...form.register('password')}
              />
              <FieldError errors={[errors.password]} />
            </Field>
            <Field data-invalid={!!errors.confirm}>
              <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.confirm}
                {...form.register('confirm')}
              />
              <FieldError errors={[errors.confirm]} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Update password
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

export function Component() {
  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Manage your account details and password." />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileForm />
        <PasswordForm />
      </div>
    </div>
  )
}
