import {
  CalendarCheck2,
  FileText,
  Mail,
  MessageSquareText,
  MonitorSmartphone,
  MoreHorizontal,
  Phone,
  Presentation,
  Users,
  type LucideIcon,
} from 'lucide-react'

import type { ActivityType, OpportunityStage, Priority, ProspectStatus, StageKind } from '@/types/api'

interface StatusMeta {
  label: string
  short: string
  kind: StageKind
  /** Badge classes (background, text, ring) chosen for WCAG AA contrast. */
  badge: string
  /** Solid color for dots, funnel bars and chart fills. */
  color: string
}

export const STATUS_META: Record<ProspectStatus, StatusMeta> = {
  new_lead: { label: 'New Lead', short: 'New', kind: 'active', badge: 'bg-sky-50 text-sky-800 ring-sky-200', color: '#0ea5e9' },
  contact_attempted: { label: 'Contact Attempted', short: 'Attempted', kind: 'active', badge: 'bg-slate-100 text-slate-700 ring-slate-200', color: '#94a3b8' },
  contacted: { label: 'Contacted', short: 'Contacted', kind: 'active', badge: 'bg-blue-50 text-blue-800 ring-blue-200', color: '#3b82f6' },
  needs_analysis: { label: 'Needs Analysis', short: 'Needs Analysis', kind: 'active', badge: 'bg-violet-50 text-violet-800 ring-violet-200', color: '#8b5cf6' },
  presentation_scheduled: { label: 'Presentation Scheduled', short: 'Pres. Scheduled', kind: 'active', badge: 'bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200', color: '#d946ef' },
  presentation_completed: { label: 'Presentation Completed', short: 'Pres. Done', kind: 'active', badge: 'bg-pink-50 text-pink-800 ring-pink-200', color: '#ec4899' },
  nurturing: { label: 'Follow-up / Nurturing', short: 'Nurturing', kind: 'active', badge: 'bg-teal-50 text-teal-800 ring-teal-200', color: '#14b8a6' },
  application_in_progress: { label: 'Application In Progress', short: 'App. In Progress', kind: 'active', badge: 'bg-amber-50 text-amber-800 ring-amber-200', color: '#f59e0b' },
  application_submitted: { label: 'Application Submitted', short: 'App. Submitted', kind: 'active', badge: 'bg-orange-50 text-orange-800 ring-orange-200', color: '#f97316' },
  underwriting: { label: 'Underwriting', short: 'Underwriting', kind: 'active', badge: 'bg-rose-50 text-rose-800 ring-rose-200', color: '#f43f5e' },
  won: { label: 'Policy Issued — Won', short: 'Won', kind: 'won', badge: 'bg-emerald-600 text-white ring-emerald-600', color: '#059669' },
  lost: { label: 'Not Interested — Lost', short: 'Lost', kind: 'lost', badge: 'bg-ink-600 text-white ring-ink-600', color: '#5c5355' },
  not_qualified: { label: 'Not Qualified', short: 'Not Qualified', kind: 'lost', badge: 'bg-ink-400 text-white ring-ink-400', color: '#a39a9c' },
  on_hold: { label: 'On Hold', short: 'On Hold', kind: 'paused', badge: 'bg-yellow-50 text-yellow-800 ring-yellow-300 border-dashed', color: '#ca8a04' },
}

export const STATUS_ORDER = Object.keys(STATUS_META) as ProspectStatus[]
export const ACTIVE_STATUSES = STATUS_ORDER.filter((s) => STATUS_META[s].kind === 'active')
export const CLOSED_LOST: ProspectStatus[] = ['lost', 'not_qualified']

export const PRIORITY_META: Record<Priority, { label: string; badge: string; rank: number }> = {
  high: { label: 'High', badge: 'bg-brand-50 text-brand-700 ring-brand-200', rank: 1 },
  medium: { label: 'Medium', badge: 'bg-amber-50 text-amber-800 ring-amber-200', rank: 2 },
  low: { label: 'Low', badge: 'bg-ink-100 text-ink-600 ring-ink-200', rank: 3 },
}
export const PRIORITIES: Priority[] = ['high', 'medium', 'low']

export const ACTIVITY_META: Record<ActivityType, { label: string; icon: LucideIcon; tint: string }> = {
  call: { label: 'Phone Call', icon: Phone, tint: 'bg-blue-50 text-blue-700' },
  sms: { label: 'Text Message', icon: MessageSquareText, tint: 'bg-teal-50 text-teal-700' },
  email: { label: 'Email', icon: Mail, tint: 'bg-sky-50 text-sky-700' },
  online_meeting: { label: 'Online Meeting', icon: MonitorSmartphone, tint: 'bg-violet-50 text-violet-700' },
  in_person_meeting: { label: 'In-Person Meeting', icon: Users, tint: 'bg-amber-50 text-amber-700' },
  presentation: { label: 'Insurance Presentation', icon: Presentation, tint: 'bg-brand-50 text-brand-700' },
  document: { label: 'Document Follow-up', icon: FileText, tint: 'bg-emerald-50 text-emerald-700' },
  other: { label: 'Other', icon: MoreHorizontal, tint: 'bg-ink-100 text-ink-600' },
}
export const ACTIVITY_TYPES = Object.keys(ACTIVITY_META) as ActivityType[]
export const APPOINTMENT_TYPES: ActivityType[] = ['online_meeting', 'in_person_meeting', 'presentation']
export const AppointmentIcon = CalendarCheck2

export const OPPORTUNITY_STAGES: { value: OpportunityStage; label: string; badge: string }[] = [
  { value: 'identified', label: 'Identified', badge: 'bg-sky-50 text-sky-800 ring-sky-200' },
  { value: 'proposal', label: 'Proposal / Presentation', badge: 'bg-violet-50 text-violet-800 ring-violet-200' },
  { value: 'application_in_progress', label: 'Application In Progress', badge: 'bg-amber-50 text-amber-800 ring-amber-200' },
  { value: 'application_submitted', label: 'Application Submitted', badge: 'bg-orange-50 text-orange-800 ring-orange-200' },
  { value: 'underwriting', label: 'Underwriting', badge: 'bg-rose-50 text-rose-800 ring-rose-200' },
  { value: 'issued', label: 'Policy Issued', badge: 'bg-emerald-600 text-white ring-emerald-600' },
  { value: 'lost', label: 'Lost / Declined', badge: 'bg-ink-500 text-white ring-ink-500' },
]
export const SUBMITTED_OPP_STAGES: OpportunityStage[] = ['application_submitted', 'underwriting', 'issued']

export const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'No reminder' },
  { value: '0', label: 'At the scheduled time' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '120', label: '2 hours before' },
  { value: '1440', label: '1 day before' },
]

/** Categorical chart palette, validated for CVD separation and contrast (fixed order, never cycled). */
export const CHART_COLORS = {
  newProspects: '#c8102e',
  appointments: '#2563eb',
  qualified: '#d97706',
  policies: '#0d9488',
} as const
