import { Settings2 } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { ReportPanel } from '../components/report-panel'

export function Component() {
  const { isAdmin } = useAuth()
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Employee task and effort reports: tickets created by or assigned to the employee in the period, plus tickets they logged effort on."
        actions={
          isAdmin && (
            <Button asChild variant="outline">
              <Link to="/settings/report"><Settings2 /> Report settings</Link>
            </Button>
          )
        }
      />
      <ReportPanel />
    </div>
  )
}
