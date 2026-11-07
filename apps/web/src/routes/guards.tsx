import { ShieldAlert } from 'lucide-react'
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import { EmptyState } from '@/components/common/states'
import { useAuth } from '@/features/auth/auth-context'
import { safeRedirect } from '@/lib/redirect'

function FullPageLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center" role="status" aria-label="Loading">
      <div className="border-primary size-8 animate-spin rounded-full border-2 border-t-transparent" />
    </div>
  )
}

/** Requires a signed-in, active user. UI convenience only; RLS is the real gate. */
export function ProtectedRoute() {
  const { isLoading, session, profile } = useAuth()
  const location = useLocation()
  if (isLoading) return <FullPageLoader />
  if (!session || !profile) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }
  return <Outlet />
}

/** Requires an admin. Non-admins see an access-denied state. */
export function AdminRoute() {
  const { isAdmin } = useAuth()
  if (!isAdmin) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Administrator access required"
        description="You do not have permission to view this page."
      />
    )
  }
  return <Outlet />
}

/** Login page wrapper: signed-in users go to ?redirect (if safe) or the dashboard. */
export function GuestRoute() {
  const { isLoading, session, profile } = useAuth()
  const [params] = useSearchParams()
  if (isLoading) return <FullPageLoader />
  if (session && profile) return <Navigate to={safeRedirect(params.get('redirect'))} replace />
  return <Outlet />
}
