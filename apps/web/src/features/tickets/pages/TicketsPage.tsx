import { Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { CreateTicketSheet } from '../components/create-ticket-sheet'
import { TicketList } from '../components/ticket-list'

export function Component() {
  const [createOpen, setCreateOpen] = useState(false)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        description="Search, filter and manage Development, Support and R&D tickets."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Create ticket
          </Button>
        }
      />
      <TicketList onCreate={() => setCreateOpen(true)} />
      <CreateTicketSheet open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
