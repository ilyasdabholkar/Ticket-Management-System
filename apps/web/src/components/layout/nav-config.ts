import type { LucideIcon } from 'lucide-react'
import {
  AppWindow,
  BookOpen,
  Clock,
  FileCog,
  FileText,
  KanbanSquare,
  LayoutDashboard,
  ListTodo,
  Settings,
  Trash2,
  Users,
} from 'lucide-react'

export interface NavItem {
  title: string
  to: string
  icon: LucideIcon
  /** Only visible to admins (also enforced by route guards + RLS). */
  adminOnly?: boolean
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { title: 'Dashboard', to: '/', icon: LayoutDashboard },
      { title: 'Board', to: '/board', icon: KanbanSquare },
      { title: 'Tickets', to: '/tickets', icon: ListTodo },
      { title: 'Applications', to: '/applications', icon: AppWindow },
      { title: 'Effort', to: '/effort', icon: Clock },
      { title: 'Knowledge Base', to: '/knowledge-base', icon: BookOpen },
      { title: 'Reports', to: '/reports', icon: FileText },
    ],
  },
  {
    label: 'Administration',
    items: [
      { title: 'Users', to: '/settings/users', icon: Users, adminOnly: true },
      { title: 'Report Settings', to: '/settings/report', icon: FileCog, adminOnly: true },
      { title: 'Deleted Items', to: '/settings/trash', icon: Trash2, adminOnly: true },
      { title: 'Settings', to: '/settings/profile', icon: Settings },
    ],
  },
]
