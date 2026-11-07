import { useMemo } from 'react'
import { AppIcon } from '@/components/shared/app-icon'
import { Combobox } from '@/components/shared/combobox'
import { UserAvatar } from '@/components/shared/user-avatar'
import { useApplications } from '@/features/applications/hooks'
import { useUsers } from '@/features/users/hooks'

interface PickerProps {
  id?: string
  value: string | null
  onChange: (value: string | null) => void
  disabled?: boolean
  invalid?: boolean
  className?: string
}

/** Active, non-archived applications only (spec §4). Shows the current value even if it became inactive. */
export function ApplicationPicker({ allowNone, ...props }: PickerProps & { allowNone?: boolean }) {
  const { data: apps } = useApplications()
  const options = useMemo(
    () =>
      (apps ?? [])
        .filter((a) => a.is_active && !a.deleted_at)
        .map((a) => ({ value: a.id, label: a.name, icon: <AppIcon iconKey={a.icon_key} seed={a.name} className="size-5 rounded" /> })),
    [apps],
  )
  const current = apps?.find((a) => a.id === props.value)
  return (
    <Combobox
      {...props}
      options={options}
      placeholder="Select application"
      searchPlaceholder="Search applications…"
      emptyText="No active applications."
      clearLabel={allowNone ? 'No application' : undefined}
      fallbackLabel={current ? `${current.name} (inactive)` : 'Unknown application'}
      aria-label="Application"
    />
  )
}

/** Active employees (Employee role) plus "Unassigned". */
export function AssigneePicker(props: PickerProps) {
  const { data: users } = useUsers()
  const options = useMemo(
    () =>
      (users ?? [])
        .filter((u) => u.is_active && u.roles.includes('employee'))
        .map((u) => ({
          value: u.id,
          label: u.full_name,
          keywords: [u.email],
          icon: <UserAvatar name={u.full_name} className="size-5 text-[0.6rem]" />,
        })),
    [users],
  )
  const current = users?.find((u) => u.id === props.value)
  return (
    <Combobox
      {...props}
      options={options}
      placeholder="Unassigned"
      searchPlaceholder="Search people…"
      emptyText="No active employees."
      clearLabel="Unassigned"
      fallbackLabel={current ? `${current.full_name} (inactive)` : 'Unknown user'}
      aria-label="Assignee"
    />
  )
}
