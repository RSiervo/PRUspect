// Types mirroring the Django REST API (backend/apps/*/serializers.py).

export type ProspectStatus =
  | 'new_lead'
  | 'contact_attempted'
  | 'contacted'
  | 'needs_analysis'
  | 'presentation_scheduled'
  | 'presentation_completed'
  | 'nurturing'
  | 'application_in_progress'
  | 'application_submitted'
  | 'underwriting'
  | 'won'
  | 'lost'
  | 'not_qualified'
  | 'on_hold'

export type StageKind = 'active' | 'won' | 'lost' | 'paused'
export type Priority = 'high' | 'medium' | 'low'
export type ActivityType =
  | 'call'
  | 'sms'
  | 'email'
  | 'online_meeting'
  | 'in_person_meeting'
  | 'presentation'
  | 'document'
  | 'other'
export type FollowUpStatus = 'pending' | 'completed' | 'canceled'
export type FollowUpBucket = 'overdue' | 'today' | 'upcoming' | 'completed' | 'canceled'
export type OpportunityStage =
  | 'identified'
  | 'proposal'
  | 'application_in_progress'
  | 'application_submitted'
  | 'underwriting'
  | 'issued'
  | 'lost'

export interface Paginated<T> {
  count: number
  page: number
  page_size: number
  total_pages: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface ApiErrorBody {
  detail: string
  code: string
  errors: Record<string, string[] | Record<string, string[]>>
}

export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  full_name: string
  job_title: string
  time_zone: string
  date_joined: string
  is_staff: boolean
  has_password: boolean
  google_linked: boolean
}

export interface AuthConfig {
  google_client_id: string | null
  google_signup_enabled: boolean
  google_allowed_domains: string[]
}

export interface AuthResponse {
  access: string
  user: User
  created?: boolean
}

export interface UserSettings {
  time_zone: string
  currency: string
  default_reminder_minutes: number
  archive_retention_days: number
  updated_at: string
}

export interface Named {
  id: number
  name: string
}

export interface ProspectSource {
  id: number
  name: string
  is_active: boolean
  sort_order: number
}

export interface ProductCategory extends ProspectSource {
  description: string
}

export interface Choice<T extends string = string> {
  value: T
  label: string
}

export interface ProspectOptions {
  statuses: (Choice<ProspectStatus> & { kind: StageKind })[]
  priorities: Choice<Priority>[]
  budget_ranges: Choice[]
  contact_methods: Choice[]
  sources: ProspectSource[]
  product_categories: ProductCategory[]
}

export interface ProspectListItem {
  id: number
  first_name: string
  last_name: string
  preferred_name: string
  full_name: string
  mobile: string
  email: string
  occupation: string
  company: string
  location: string
  source: Named | null
  insurance_interests: Named[]
  status: ProspectStatus
  status_label: string
  stage_kind: StageKind
  priority: Priority
  last_contacted_at: string | null
  next_follow_up_at: string | null
  created_at: string
  is_archived: boolean
  is_demo: boolean
  do_not_contact: boolean
}

export interface Prospect extends ProspectListItem {
  source_id: number | null
  birth_date: string | null
  referral_name: string
  existing_coverage: string
  budget_range: string
  budget_range_label: string
  notes: string
  consent_obtained: boolean
  consent_date: string | null
  consent_source: string
  preferred_contact_method: string
  preferred_contact_method_label: string
  status_changed_at: string | null
  qualified_at: string | null
  application_submitted_at: string | null
  policy_issued_at: string | null
  archived_at: string | null
  updated_at: string
}

export interface ProspectBrief {
  id: number
  first_name: string
  last_name: string
  preferred_name: string
  full_name: string
  status: ProspectStatus
  priority: Priority
  mobile: string
  email: string
  is_archived: boolean
  is_demo: boolean
}

export interface FollowUpInput {
  activity_type: ActivityType
  subject: string
  description?: string
  scheduled_at: string
  duration_minutes?: number
  priority?: Priority
  reminder_minutes?: number | null
}

export interface ProspectWrite {
  first_name: string
  last_name: string
  preferred_name?: string
  mobile?: string
  email?: string
  birth_date?: string | null
  occupation?: string
  company?: string
  location?: string
  source?: number | null
  referral_name?: string
  insurance_interests?: number[]
  existing_coverage?: string
  budget_range?: string
  priority?: Priority
  status?: ProspectStatus
  notes?: string
  consent_obtained?: boolean
  consent_date?: string | null
  consent_source?: string
  preferred_contact_method?: string
  do_not_contact?: boolean
  initial_follow_up?: FollowUpInput | null
}

export interface DuplicateMatch {
  id: number
  full_name: string
  mobile: string
  email: string
  status: ProspectStatus
  status_label: string
  is_archived: boolean
  matched_on: ('mobile' | 'email')[]
}

export interface StatusHistoryEntry {
  id: number
  from_status: ProspectStatus | ''
  from_status_label: string
  to_status: ProspectStatus
  to_status_label: string
  reason: string
  is_reopen: boolean
  changed_by_name: string
  changed_at: string
}

export interface ChangeLogEntry {
  id: number
  action: string
  action_label: string
  summary: string
  changes: Record<string, unknown>
  created_at: string
}

export interface ProspectHistory {
  status_history: StatusHistoryEntry[]
  changes: ChangeLogEntry[]
}

export interface TimelineEvent {
  id: string
  kind: 'created' | 'status' | 'archive' | 'note' | 'follow_up' | 'opportunity' | 'activity' | 'milestone' | 'other'
  title: string
  description: string
  occurred_at: string
  meta: Record<string, unknown>
}

export interface NoteRevision {
  id: number
  previous_body: string
  edited_at: string
}

export interface ProspectNote {
  id: number
  prospect: number
  body: string
  author_name: string
  is_edited: boolean
  revisions: NoteRevision[]
  created_at: string
  updated_at: string
}

export interface FollowUpReschedule {
  id: number
  previous_scheduled_at: string
  new_scheduled_at: string
  reason: string
  created_at: string
}

export interface FollowUp {
  id: number
  prospect: number
  prospect_detail: ProspectBrief
  activity_type: ActivityType
  activity_type_label: string
  subject: string
  description: string
  scheduled_at: string
  duration_minutes: number
  priority: Priority
  status: FollowUpStatus
  status_label: string
  outcome: string
  next_action: string
  completed_at: string | null
  canceled_at: string | null
  cancel_reason: string
  reminder_minutes: number | null
  bucket: FollowUpBucket
  is_appointment: boolean
  reschedules: FollowUpReschedule[]
  created_at: string
  updated_at: string
}

export interface FollowUpSummary {
  overdue: number
  today: number
  upcoming: number
  completed: number
  canceled: number
}

export interface Activity {
  id: number
  prospect: number
  prospect_detail: ProspectBrief
  activity_type: ActivityType
  activity_type_label: string
  subject: string
  description: string
  outcome: string
  occurred_at: string
  follow_up: number | null
  counts_as_contact: boolean
  created_at: string
}

export interface Opportunity {
  id: number
  prospect: number
  prospect_detail: ProspectBrief
  name: string
  product_category: number | null
  product_category_name: string
  estimated_annual_premium: string | null
  estimated_monthly_premium: string | null
  currency: string
  estimated_close_date: string | null
  stage: OpportunityStage
  stage_label: string
  application_reference: string
  application_submitted_date: string | null
  policy_issued_date: string | null
  actual_annualized_premium: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface OpportunityWrite {
  prospect: number
  name: string
  product_category?: number | null
  estimated_annual_premium?: string | null
  currency?: string
  estimated_close_date?: string | null
  stage?: OpportunityStage
  application_reference?: string
  application_submitted_date?: string | null
  policy_issued_date?: string | null
  actual_annualized_premium?: string | null
  notes?: string
}

export interface CalendarEvent {
  id: number
  title: string
  start: string
  end: string
  activity_type: ActivityType
  activity_type_label: string
  status: FollowUpStatus
  priority: Priority
  is_appointment: boolean
  is_overdue: boolean
  description: string
  prospect: { id: number; full_name: string }
}

export interface Kpi {
  value: number | null
  previous?: number
  completed_today?: number
  this_month?: number
  numerator?: number
  denominator?: number
}

export interface ConversionRate {
  key: string
  label: string
  rate: number | null
  numerator: number
  denominator: number
  definition: string
}

export interface ConversionData {
  cohort: { date_from: string | null; date_to: string | null; size: number; description: string }
  counts: { qualified: number; applications: number; issued: number }
  rates: ConversionRate[]
}

export interface DashboardSummary {
  as_of: string
  time_zone: string
  kpis: Record<
    | 'total_prospects'
    | 'new_this_month'
    | 'follow_ups_today'
    | 'overdue_follow_ups'
    | 'appointments_this_week'
    | 'qualified_prospects'
    | 'policies_issued'
    | 'conversion_rate',
    Kpi
  >
  definitions: Record<string, string>
  conversion: ConversionData
}

export interface StageCount {
  value: ProspectStatus
  label: string
  kind: StageKind
  count: number
  share?: number | null
}

export interface PerformancePoint {
  period: string
  label: string
  new_prospects: number
  appointments: number
  qualified: number
  policies_issued: number
}

export interface PerformanceData {
  period: 'monthly' | 'quarterly'
  series: PerformancePoint[]
  definitions: Record<string, string>
}

export interface FeedItem {
  id: number
  action: string
  action_label: string
  summary: string
  created_at: string
  prospect: { id: number; full_name: string } | null
}

export interface ActivityFeed {
  recent: FeedItem[]
  overdue: FollowUp[]
  upcoming: FollowUp[]
}

export interface PipelineCard {
  id: number
  full_name: string
  preferred_name: string
  status: ProspectStatus
  priority: Priority
  insurance_interests: string[]
  last_contacted_at: string | null
  next_follow_up_at: string | null
  estimated_annual_premium: string | null
  is_demo: boolean
}

export interface PipelineStage extends StageCount {
  prospects: PipelineCard[]
}

export interface PipelineData {
  stages: PipelineStage[]
  totals: {
    open_estimated: string
    open_count: number
    submitted_estimated: string
    issued_actual: string
    issued_count: number
    issued_missing_actual: number
  }
  notes: Record<string, string>
}

export interface NotificationItem {
  id: number
  kind: 'reminder' | 'overdue' | 'system'
  title: string
  body: string
  link: string
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface NotificationPage extends Paginated<NotificationItem> {
  unread_count: number
}

export interface MonthCount {
  period: string
  label: string
  count: number
}

export interface ProspectReport {
  date_from: string
  date_to: string
  total: number
  acquisition: MonthCount[]
  sources: {
    source_id: number | null
    source: string
    prospects: number
    qualified: number
    won: number
    conversion_rate: number | null
  }[]
  by_status: StageCount[]
  definitions: Record<string, string>
}

export interface ActivityReport {
  date_from: string
  date_to: string
  follow_ups: {
    scheduled: number
    completed: number
    canceled: number
    missed: number
    completion_rate: number | null
    overdue_now: number
  }
  appointments_by_month: { period: string; label: string; scheduled: number; completed: number }[]
  by_type: { activity_type: ActivityType; label: string; total: number; completed: number }[]
  definitions: Record<string, string>
}

export interface PipelineReport {
  date_from: string
  date_to: string
  currency: string
  estimated_pipeline: { total: string; opportunities: number; without_estimate: number }
  issued: { total: string; policies: number; without_verified_premium: number }
  by_stage: {
    value: OpportunityStage
    label: string
    count: number
    estimated_annual_premium: string
    actual_annualized_premium: string | null
  }[]
  issued_by_month: { period: string; label: string; count: number; actual_annualized_premium: string }[]
  definitions: Record<string, string>
}

export interface AdminUser {
  id: number
  email: string
  full_name: string
  first_name: string
  last_name: string
  is_active: boolean
  is_staff: boolean
  is_superuser: boolean
  date_joined: string
  last_login: string | null
  sign_in_methods: ('google' | 'password')[]
  prospect_count: number
  open_follow_up_count: number
  is_self: boolean
}

export interface AdminUserSummary {
  total: number
  active: number
  inactive: number
  google: number
  new_this_week: number
  signed_in_this_week: number
}

export type MessageChannel = 'any' | 'sms' | 'email' | 'whatsapp' | 'viber'

export interface MessageTemplate {
  id: number
  name: string
  channel: MessageChannel
  subject: string
  body: string
  sort_order: number
  updated_at: string
}

export interface TodayProspect {
  id: number
  full_name: string
  status: ProspectStatus
  priority: Priority
  mobile: string
  email: string
  last_contacted_at: string | null
}

export interface TodayData {
  date: string
  agenda: FollowUp[]
  overdue: FollowUp[]
  overdue_count: number
  stale: TodayProspect[]
  stale_count: number
  no_next_step: TodayProspect[]
  no_next_step_count: number
  definitions: Record<string, string>
}
