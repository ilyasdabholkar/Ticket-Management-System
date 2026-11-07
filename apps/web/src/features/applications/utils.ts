import type { Application } from './api'

export type ApplicationStatus = 'active' | 'inactive' | 'archived'

export function applicationStatus(app: Pick<Application, 'is_active' | 'deleted_at'>): ApplicationStatus {
  if (app.deleted_at) return 'archived'
  return app.is_active ? 'active' : 'inactive'
}
