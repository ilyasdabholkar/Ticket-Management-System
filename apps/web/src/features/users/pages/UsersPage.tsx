import { KeyRound, MoreHorizontal, Pencil, Plus, Search, UserCheck, UserX, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/common/states'
import { PageHeader } from '@/components/layout/page-header'
import { RoleBadges } from '@/components/shared/role-badges'
import { UserAvatar } from '@/components/shared/user-avatar'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Profile } from '@/features/auth/api'
import { useAuth } from '@/features/auth/auth-context'
import { ResetPasswordDialog } from '../components/reset-password-dialog'
import { UserFormDialog } from '../components/user-form-dialog'
import { useSetUserActive, useUsers } from '../hooks'

type StatusFilter = 'all' | 'active' | 'inactive'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

export function Component() {
  const { profile: me } = useAuth()
  const { data: users, isPending, isError, error, refetch } = useUsers()
  const setActive = useSetUserActive()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [resetting, setResetting] = useState<Profile | null>(null)
  const [toggling, setToggling] = useState<Profile | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (users ?? []).filter(
      (u) =>
        (status === 'all' || (status === 'active') === u.is_active) &&
        (!q || u.full_name.toLowerCase().includes(q) || u.email.includes(q)),
    )
  }, [users, search, status])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (u: Profile) => {
    setEditing(u)
    setFormOpen(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Create users, assign roles (Admin, Employee or both) and control access."
        actions={
          <Button onClick={openCreate}>
            <Plus /> Add user
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search by name or email"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search users"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isPending ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={users.length === 0 ? 'No users yet' : 'No matching users'}
          description={users.length === 0 ? 'Add your first employee.' : 'Try a different search or filter.'}
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead className="hidden md:table-cell">Roles</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const isMe = u.id === me?.id
                return (
                  <TableRow key={u.id} className={u.is_active ? undefined : 'text-muted-foreground'}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar name={u.full_name} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {u.full_name}
                            {isMe && <span className="text-muted-foreground font-normal"> (you)</span>}
                          </p>
                          <p className="text-muted-foreground truncate text-xs">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <RoleBadges roles={u.roles} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="gap-1.5">
                        <span
                          className={`size-2 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-zinc-400'}`}
                          aria-hidden
                        />
                        {u.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{dateFormat.format(new Date(u.created_at))}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${u.full_name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openEdit(u)}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setResetting(u)}>
                            <KeyRound /> Reset password
                          </DropdownMenuItem>
                          {!isMe && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant={u.is_active ? 'destructive' : 'default'}
                                onSelect={() => setToggling(u)}
                              >
                                {u.is_active ? <UserX /> : <UserCheck />}
                                {u.is_active ? 'Deactivate' : 'Reactivate'}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} lockRole={editing?.id === me?.id} />
      <ResetPasswordDialog user={resetting} onOpenChange={(o) => !o && setResetting(null)} />

      <AlertDialog open={!!toggling} onOpenChange={(o) => !o && setToggling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggling?.is_active ? 'Deactivate' : 'Reactivate'} {toggling?.full_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggling?.is_active
                ? 'They will be signed out and cannot sign in until reactivated. Their tickets, comments and effort history are kept.'
                : 'They will be able to sign in again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={toggling?.is_active ? 'destructive' : 'default'}
              onClick={() => toggling && setActive.mutate({ user_id: toggling.id, is_active: !toggling.is_active })}
            >
              {toggling?.is_active ? 'Deactivate' : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
