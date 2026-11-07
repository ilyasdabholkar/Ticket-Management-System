import { isRouteErrorResponse, useRouteError } from 'react-router'
import { ErrorState } from '@/components/common/states'

export function RouteError() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error
  return (
    <div className="p-6">
      <ErrorState title="This page failed to load" error={message} onRetry={() => window.location.reload()} />
    </div>
  )
}
