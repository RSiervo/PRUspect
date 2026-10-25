import { QueryClient } from '@tanstack/react-query'

import { ApiError } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return count < 2
      },
    },
    mutations: { retry: false },
  },
})

export const qk = {
  prospects: ['prospects'] as const,
  prospectList: (params: unknown) => ['prospects', 'list', params] as const,
  prospect: (id: number) => ['prospects', 'detail', id] as const,
  prospectHistory: (id: number) => ['prospects', 'history', id] as const,
  prospectTimeline: (id: number) => ['prospects', 'timeline', id] as const,
  prospectOptions: ['prospect-options'] as const,
  notes: (id: number) => ['notes', id] as const,
  followUps: ['follow-ups'] as const,
  followUpList: (params: unknown) => ['follow-ups', 'list', params] as const,
  followUpSummary: ['follow-ups', 'summary'] as const,
  activities: ['activities'] as const,
  opportunities: ['opportunities'] as const,
  pipeline: ['pipeline'] as const,
  calendar: ['calendar'] as const,
  dashboard: ['dashboard'] as const,
  reports: ['reports'] as const,
  settings: ['settings'] as const,
  notifications: ['notifications'] as const,
}

/** After any write, refresh every view that summarises prospect data. */
export function invalidateCrm() {
  for (const key of [
    qk.prospects,
    qk.followUps,
    qk.activities,
    qk.opportunities,
    qk.pipeline,
    qk.calendar,
    qk.dashboard,
    qk.reports,
    qk.notifications,
    ['notes'],
  ]) {
    void queryClient.invalidateQueries({ queryKey: key })
  }
}
