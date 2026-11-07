import { Construction } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from './states'

interface PhasePlaceholderProps {
  title: string
  description: string
  phase: number
}

/** Temporary page body for modules that are scheduled for a later phase. */
export function PhasePlaceholder({ title, description, phase }: PhasePlaceholderProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={Construction}
        title={`Planned for Phase ${phase}`}
        description="This module is not implemented yet."
      />
    </div>
  )
}
