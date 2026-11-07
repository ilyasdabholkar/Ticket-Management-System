import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/auth-context'
import { KbFormSheet } from '../components/kb-form-sheet'
import { KbList } from '../components/kb-list'

export function Component() {
  const { isAdmin } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Base"
        description="Search notes, SQL queries, API documentation, runbooks and uploaded documents across applications."
        actions={isAdmin && (<Button onClick={() => setCreateOpen(true)}><Plus /> New record</Button>)}
      />
      <KbList onCreate={isAdmin ? () => setCreateOpen(true) : undefined} />
      {isAdmin && <KbFormSheet open={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  )
}
