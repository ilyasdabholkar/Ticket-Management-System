import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { Application } from '../api'
import { useArchiveApplication, useRestoreApplication } from '../hooks'

interface Props {
  application: Application | null
  onOpenChange: (open: boolean) => void
}

/** Confirms archive (soft delete) or restore depending on the application's state. */
export function ArchiveApplicationDialog({ application, onOpenChange }: Props) {
  const archive = useArchiveApplication()
  const restore = useRestoreApplication()
  const archived = !!application?.deleted_at

  return (
    <AlertDialog open={!!application} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {archived ? 'Restore' : 'Archive'} {application?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {archived
              ? 'The application returns to the list. It keeps its current active/inactive setting.'
              : 'The application is hidden from lists and cannot receive new tickets or be edited. Its tickets, knowledge base and reports remain available. An administrator can restore it later.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={archived ? 'default' : 'destructive'}
            onClick={() => application && (archived ? restore : archive).mutate(application.id)}
          >
            {archived ? 'Restore' : 'Archive'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
