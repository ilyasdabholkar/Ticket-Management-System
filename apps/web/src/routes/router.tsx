import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/components/layout/app-shell'
import { env } from '@/lib/env'
import { AdminRoute, GuestRoute, ProtectedRoute } from './guards'
import { NotFoundPage } from './not-found'
import { RouteError } from './route-error'

// Guards are UI conveniences; RLS and database functions enforce access.
export const router = createBrowserRouter(
  [
    {
      Component: GuestRoute,
      HydrateFallback: () => null,
      errorElement: <RouteError />,
      children: [{ path: '/login', lazy: () => import('@/features/auth/pages/LoginPage') }],
    },
    {
      Component: ProtectedRoute,
      HydrateFallback: () => null,
      errorElement: <RouteError />,
      children: [
        {
          path: '/',
          Component: AppShell,
          children: [
            { index: true, lazy: () => import('@/features/dashboard/pages/DashboardPage') },
            { path: 'board', lazy: () => import('@/features/board/pages/BoardPage') },
            { path: 'tickets', lazy: () => import('@/features/tickets/pages/TicketsPage') },
            { path: 'tickets/:ticketNumber', lazy: () => import('@/features/tickets/pages/TicketDetailPage') },
            { path: 'applications', lazy: () => import('@/features/applications/pages/ApplicationsPage') },
            {
              path: 'applications/:applicationId/:tab?',
              lazy: () => import('@/features/applications/pages/ApplicationDetailPage'),
            },
            { path: 'knowledge-base', lazy: () => import('@/features/knowledge-base/pages/KnowledgeBasePage') },
            { path: 'knowledge-base/:id', lazy: () => import('@/features/knowledge-base/pages/KnowledgeBaseDetailPage') },
            { path: 'effort', lazy: () => import('@/features/effort-logs/pages/EffortPage') },
            { path: 'reports', lazy: () => import('@/features/reports/pages/ReportsPage') },
            { path: 'settings/profile', lazy: () => import('@/features/settings/pages/ProfileSettingsPage') },
            {
              Component: AdminRoute,
              children: [
                { path: 'settings/users', lazy: () => import('@/features/users/pages/UsersPage') },
                { path: 'settings/report', lazy: () => import('@/features/settings/pages/ReportSettingsPage') },
                { path: 'settings/trash', lazy: () => import('@/features/settings/pages/TrashPage') },
              ],
            },
            { path: '*', Component: NotFoundPage },
          ],
        },
      ],
    },
  ],
  { basename: env.VITE_BASE_PATH.replace(/\/$/, '') || '/' },
)
