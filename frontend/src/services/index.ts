import { api, downloadFile, request, setAccessToken } from '@/lib/api'
import type {
  Activity,
  ActivityFeed,
  ActivityReport,
  AdminUser,
  AdminUserSummary,
  AuthConfig,
  AuthResponse,
  CalendarEvent,
  ConversionData,
  DashboardSummary,
  DuplicateMatch,
  MessageTemplate,
  TodayData,
  FollowUp,
  FollowUpInput,
  FollowUpSummary,
  NotificationItem,
  NotificationPage,
  Opportunity,
  OpportunityWrite,
  Paginated,
  PerformanceData,
  PipelineData,
  PipelineReport,
  ProductCategory,
  Prospect,
  ProspectHistory,
  ProspectListItem,
  ProspectNote,
  ProspectOptions,
  ProspectReport,
  ProspectSource,
  ProspectStatus,
  ProspectWrite,
  StageCount,
  TimelineEvent,
  User,
  UserSettings,
} from '@/types/api'

export type ListParams = Record<string, string | number | boolean | undefined | null | (string | number)[]>

// ------------------------------------------------------------------ auth
export const authService = {
  config: () => request<AuthConfig>('/auth/config/', { auth: false }),
  /** Exchange a Google ID token for a session; creates the account on first use. */
  async google(credential: string) {
    const data = await request<AuthResponse>('/auth/google/', { method: 'POST', body: { credential }, auth: false })
    setAccessToken(data.access)
    return data
  },
  async login(email: string, password: string) {
    const data = await request<AuthResponse>('/auth/login/', {
      method: 'POST',
      body: { email, password },
      auth: false,
    })
    setAccessToken(data.access)
    return data
  },
  async logout() {
    try {
      await request<void>('/auth/logout/', { method: 'POST', body: {}, auth: false })
    } finally {
      setAccessToken(null)
    }
  },
  me: () => api.get<User>('/auth/me/'),
  updateMe: (data: Partial<Pick<User, 'first_name' | 'last_name' | 'job_title'>>) => api.patch<User>('/auth/me/', data),
  async changePassword(current_password: string, new_password: string) {
    const data = await api.post<{ access: string }>('/auth/change-password/', { current_password, new_password })
    setAccessToken(data.access)
  },
}

// ------------------------------------------------------------- prospects
export const prospectService = {
  list: (params: ListParams, signal?: AbortSignal) =>
    api.get<Paginated<ProspectListItem>>('/prospects/', params, signal),
  get: (id: number) => api.get<Prospect>(`/prospects/${id}/`),
  create: (data: ProspectWrite) => api.post<Prospect>('/prospects/', data),
  update: (id: number, data: Partial<ProspectWrite>) => api.patch<Prospect>(`/prospects/${id}/`, data),
  changeStatus: (id: number, status: ProspectStatus, reason = '') =>
    api.post<Prospect>(`/prospects/${id}/change-status/`, { status, reason }),
  archive: (id: number) => api.post<Prospect>(`/prospects/${id}/archive/`),
  restore: (id: number) => api.post<Prospect>(`/prospects/${id}/restore/`),
  remove: (id: number, confirm_name: string) => api.delete(`/prospects/${id}/`, { confirm_name }),
  history: (id: number) => api.get<ProspectHistory>(`/prospects/${id}/history/`),
  timeline: (id: number) => api.get<TimelineEvent[]>(`/prospects/${id}/timeline/`),
  duplicates: (params: { mobile?: string; email?: string; exclude?: number }) =>
    api.get<{ matches: DuplicateMatch[] }>('/prospects/duplicates/', params),
  options: () => api.get<ProspectOptions>('/prospects/options/'),
  bulk: (ids: number[], action: string, value = '', reason = '') =>
    api.post<{ updated: number; skipped: number; not_found: number }>('/prospects/bulk/', { ids, action, value, reason }),
  exportCsv: (params: ListParams) => downloadFile('/prospects/export/', params),
}

export const noteService = {
  list: (prospect: number) => api.get<Paginated<ProspectNote>>('/notes/', { prospect, page_size: 100 }),
  create: (prospect: number, body: string) => api.post<ProspectNote>('/notes/', { prospect, body }),
  update: (id: number, body: string) => api.patch<ProspectNote>(`/notes/${id}/`, { body }),
}

// ------------------------------------------------------------ follow-ups
export interface CompletePayload {
  outcome?: string
  next_action?: string
  next_follow_up?: FollowUpInput | null
}

export const followUpService = {
  list: (params: ListParams) => api.get<Paginated<FollowUp>>('/follow-ups/', params),
  get: (id: number) => api.get<FollowUp>(`/follow-ups/${id}/`),
  create: (data: FollowUpInput & { prospect: number }) => api.post<FollowUp>('/follow-ups/', data),
  update: (id: number, data: Partial<FollowUpInput>) => api.patch<FollowUp>(`/follow-ups/${id}/`, data),
  complete: (id: number, data: CompletePayload) =>
    api.post<FollowUp & { next_follow_up_id: number | null }>(`/follow-ups/${id}/complete/`, data),
  cancel: (id: number, reason = '') => api.post<FollowUp>(`/follow-ups/${id}/cancel/`, { reason }),
  reschedule: (id: number, scheduled_at: string, reason = '') =>
    api.post<FollowUp>(`/follow-ups/${id}/reschedule/`, { scheduled_at, reason }),
  summary: () => api.get<FollowUpSummary>('/follow-ups/summary/'),
}

export const activityService = {
  list: (params: ListParams) => api.get<Paginated<Activity>>('/activities/', params),
  create: (data: {
    prospect: number
    activity_type: string
    subject: string
    description?: string
    outcome?: string
    occurred_at: string
  }) => api.post<Activity>('/activities/', data),
}

// ---------------------------------------------------------- opportunities
export const opportunityService = {
  list: (params: ListParams) => api.get<Paginated<Opportunity>>('/opportunities/', params),
  create: (data: OpportunityWrite) => api.post<Opportunity>('/opportunities/', data),
  update: (id: number, data: Partial<OpportunityWrite>) => api.patch<Opportunity>(`/opportunities/${id}/`, data),
  remove: (id: number) => api.delete(`/opportunities/${id}/`),
}

export const pipelineService = {
  board: (params: ListParams) => api.get<PipelineData>('/pipeline/', params),
}

// -------------------------------------------------------------- calendar
export const calendarService = {
  events: (start: string, end: string) =>
    api.get<{ start: string; end: string; time_zone: string; events: CalendarEvent[] }>('/calendar/events/', {
      start,
      end,
    }),
}

// ------------------------------------------------------------- dashboard
export const dashboardService = {
  summary: () => api.get<DashboardSummary>('/dashboard/summary/'),
  today: () => api.get<TodayData>('/dashboard/today/'),
  pipeline: () => api.get<{ stages: StageCount[] }>('/dashboard/pipeline/'),
  activity: () => api.get<ActivityFeed>('/dashboard/activity/'),
  performance: (period: 'monthly' | 'quarterly') => api.get<PerformanceData>('/dashboard/performance/', { period }),
}

// --------------------------------------------------------------- reports
export interface DateRange {
  date_from?: string
  date_to?: string
}

export const reportService = {
  prospects: (range: DateRange) => api.get<ProspectReport>('/reports/prospects/', { ...range }),
  conversion: (range: DateRange) => api.get<ConversionData>('/reports/conversion/', { ...range }),
  pipeline: (range: DateRange) => api.get<PipelineReport>('/reports/pipeline/', { ...range }),
  activity: (range: DateRange) => api.get<ActivityReport>('/reports/activity/', { ...range }),
  exportCsv: (report: string, range: DateRange) => downloadFile('/reports/export/', { report, ...range }),
}

// -------------------------------------------------------------- settings
export const settingsService = {
  get: () => api.get<UserSettings>('/settings/'),
  update: (data: Partial<UserSettings>) => api.patch<UserSettings>('/settings/', data),
  sources: () => api.get<ProspectSource[]>('/settings/sources/'),
  createSource: (data: Partial<ProspectSource>) => api.post<ProspectSource>('/settings/sources/', data),
  updateSource: (id: number, data: Partial<ProspectSource>) =>
    api.patch<ProspectSource>(`/settings/sources/${id}/`, data),
  deleteSource: (id: number) => api.delete(`/settings/sources/${id}/`),
  categories: () => api.get<ProductCategory[]>('/settings/product-categories/'),
  createCategory: (data: Partial<ProductCategory>) =>
    api.post<ProductCategory>('/settings/product-categories/', data),
  updateCategory: (id: number, data: Partial<ProductCategory>) =>
    api.patch<ProductCategory>(`/settings/product-categories/${id}/`, data),
  deleteCategory: (id: number) => api.delete(`/settings/product-categories/${id}/`),
  demoData: () => api.get<{ demo_prospects: number }>('/settings/demo-data/'),
  removeDemoData: () => api.delete<{ deleted: number }>('/settings/demo-data/'),
}

// --------------------------------------------------------- notifications
export const notificationService = {
  list: () => api.get<NotificationPage>('/notifications/', { page_size: 20 }),
  markRead: (id: number) => api.post<NotificationItem>(`/notifications/${id}/read/`),
  markAllRead: () => api.post<{ updated: number }>('/notifications/read-all/'),
}

// ------------------------------------------------------------- admin (staff only)
export const adminService = {
  users: (params: ListParams) => api.get<Paginated<AdminUser>>('/admin/users/', params),
  summary: () => api.get<AdminUserSummary>('/admin/users/summary/'),
  deactivate: (id: number) => api.post<AdminUser>(`/admin/users/${id}/deactivate/`),
  reactivate: (id: number) => api.post<AdminUser>(`/admin/users/${id}/reactivate/`),
}

// ------------------------------------------------------------ message templates
export const templateService = {
  list: () => api.get<MessageTemplate[]>('/settings/message-templates/'),
  create: (data: Partial<MessageTemplate>) => api.post<MessageTemplate>('/settings/message-templates/', data),
  update: (id: number, data: Partial<MessageTemplate>) => api.patch<MessageTemplate>(`/settings/message-templates/${id}/`, data),
  remove: (id: number) => api.delete(`/settings/message-templates/${id}/`),
}
