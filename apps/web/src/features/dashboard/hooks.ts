import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getDashboardStats, listRecentActivity, listRecentTickets } from './api'

export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: (from: string, to: string) => [...dashboardKeys.all, 'stats', from, to] as const,
  activity: () => [...dashboardKeys.all, 'activity'] as const,
  recent: (order: string) => [...dashboardKeys.all, 'recent', order] as const,
}

const LIVE = { refetchInterval: 60_000, refetchOnWindowFocus: true } as const

export const useDashboardStats = (from: string, to: string, enabled = true) =>
  useQuery({ queryKey: dashboardKeys.stats(from, to), queryFn: () => getDashboardStats(from, to), placeholderData: keepPreviousData, enabled, ...LIVE })

export const useRecentActivity = () => useQuery({ queryKey: dashboardKeys.activity(), queryFn: () => listRecentActivity(8), ...LIVE })

export const useRecentTickets = (order: 'created_at' | 'updated_at') =>
  useQuery({ queryKey: dashboardKeys.recent(order), queryFn: () => listRecentTickets(order, 6), ...LIVE })
