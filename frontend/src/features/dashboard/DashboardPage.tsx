import { useQuery } from '@tanstack/react-query'
import {
  AlarmClock,
  BadgeCheck,
  CalendarCheck2,
  ClipboardList,
  FileCheck2,
  Percent,
  UserPlus,
  Users,
} from 'lucide-react'
import { Link } from 'react-router'

import { KpiCard } from '@/components/data-display/KpiCard'
import { ErrorState } from '@/components/data-display/states'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatDate, nowInZone } from '@/lib/datetime'
import { qk } from '@/lib/queryKeys'
import { formatPercent } from '@/lib/utils'
import { dashboardService } from '@/services'

import {
  ConversionWidget,
  FollowUpsWidget,
  PerformanceWidget,
  PipelineWidget,
  QuickActionsWidget,
  RecentActivityWidget,
} from './widgets'

function greeting() {
  const hour = nowInZone().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const { user } = useAuth()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: [...qk.dashboard, 'summary'], queryFn: dashboardService.summary })
  const k = data?.kpis
  const d = data?.definitions ?? {}

  const newDelta =
    k && k.new_this_month.previous !== undefined
      ? k.new_this_month.value! - k.new_this_month.previous
      : null

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-[22px]">
            {greeting()}, {user?.first_name || 'there'}! <span aria-hidden>👋</span>
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-500">
            Here’s your prospect activity at a glance · {formatDate(nowInZone().toISOString(), 'EEEE, MMM d, yyyy')}
          </p>
        </div>
        <Button asChild>
          <Link to="/prospects/new">
            <UserPlus /> Add prospect
          </Link>
        </Button>
      </div>

      {error ? (
        <div className="card">
          <ErrorState error={error} onRetry={refetch} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <KpiCard index={0} loading={isLoading} label="Total Prospects" value={k?.total_prospects.value} icon={Users} tone="blue" to="/prospects" definition={d.total_prospects} hint="Active, not archived" />
          <KpiCard
            index={1}
            loading={isLoading}
            label="New This Month"
            value={k?.new_this_month.value}
            icon={UserPlus}
            tone="violet"
            to="/prospects?ordering=-created_at"
            definition={d.new_this_month}
            hint={newDelta === null ? undefined : `${newDelta >= 0 ? '+' : ''}${newDelta} vs last month`}
          />
          <KpiCard
            index={2}
            loading={isLoading}
            label="Follow-ups Today"
            value={k?.follow_ups_today.value}
            icon={ClipboardList}
            tone="orange"
            to="/follow-ups?bucket=today"
            definition={d.follow_ups_today}
            hint={k ? `${k.follow_ups_today.completed_today ?? 0} completed today` : undefined}
          />
          <KpiCard index={3} loading={isLoading} label="Overdue Follow-ups" value={k?.overdue_follow_ups.value} icon={AlarmClock} tone="amber" to="/follow-ups?bucket=overdue" definition={d.overdue_follow_ups} hint={k?.overdue_follow_ups.value ? 'Needs your attention' : 'All caught up'} />
          <KpiCard index={4} loading={isLoading} label="Appointments This Week" value={k?.appointments_this_week.value} icon={CalendarCheck2} tone="teal" to="/calendar?view=week" definition={d.appointments_this_week} hint="Meetings & presentations" />
          <KpiCard index={5} loading={isLoading} label="Qualified Prospects" value={k?.qualified_prospects.value} icon={BadgeCheck} tone="green" to="/prospects?milestone=qualified" definition={d.qualified_prospects} hint="Reached Needs Analysis+" />
          <KpiCard index={6} loading={isLoading} label="Policies Issued" value={k?.policies_issued.value} icon={FileCheck2} tone="brand" to="/reports?tab=pipeline" definition={d.policies_issued} hint={k ? `${k.policies_issued.this_month ?? 0} this month` : undefined} />
          <KpiCard
            index={7}
            loading={isLoading}
            label="Conversion Rate"
            value={formatPercent(k?.conversion_rate.value)}
            icon={Percent}
            tone="slate"
            to="/reports?tab=conversion"
            definition={d.conversion_rate}
            hint={k ? `${k.conversion_rate.numerator} of ${k.conversion_rate.denominator} prospects` : undefined}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <PipelineWidget />
        <PerformanceWidget />
        <div className="lg:col-span-2 2xl:col-span-1">
          <FollowUpsWidget />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ConversionWidget data={data?.conversion} loading={isLoading} />
        <QuickActionsWidget />
        <div className="lg:col-span-2 2xl:col-span-1">
          <RecentActivityWidget />
        </div>
      </div>
    </div>
  )
}
