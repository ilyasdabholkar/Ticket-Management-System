import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'
import { BrandLogo } from '@/components/shared/brand-logo'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { safeRedirect } from '@/lib/redirect'
import { signInWithPassword } from '../api'
import { loginSchema, type LoginValues } from '../schemas'

function friendlyAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return 'Incorrect email or password.'
  if (/banned/i.test(message)) return 'Your account is inactive. Contact an administrator.'
  return message
}

export function Component() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [authError, setAuthError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setAuthError(null)
    try {
      await signInWithPassword(email, password)
      navigate(safeRedirect(params.get('redirect')), { replace: true })
    } catch (e) {
      setAuthError(friendlyAuthError(e instanceof Error ? e.message : 'Sign in failed'))
    }
  })

  return (
    <div className="bg-muted/40 flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <BrandLogo className="mx-auto mb-2 h-12" />
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>Ticket Management System</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup>
              {authError && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertDescription>{authError}</AlertDescription>
                </Alert>
              )}
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  aria-invalid={!!errors.email}
                  {...register('email')}
                />
                <FieldError errors={[errors.email]} />
              </Field>
              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
                <FieldError errors={[errors.password]} />
              </Field>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" />}
                Sign in
              </Button>
              <p className="text-muted-foreground text-center text-xs">
                Accounts are created by an administrator.
              </p>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
