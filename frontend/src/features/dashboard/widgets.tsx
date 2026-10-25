import { useQuery } from '@tanstack/react-query'
import {
  AlarmClock,
  ArrowRight,
  CalendarPlus,
  CheckCircle2,
  FilePlus2,
  History,
  NotebookPen,
  PencilLine,
  RefreshCcw,
  UserPlus,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/data-display/states'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, Segmented, Skeleton } from '@/components/ui/misc'
import { useFollowUpDialogs, FollowUpItem } from '@/features/follow-ups/FollowUpItem'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { CHART_COLORS } from '@/lib/constants'
import { timeAgo } from '@/lib/datetime'
import { qk } from '@/lib/queryKeys'
import { cn, formatPercent } from '@/lib/utils'
import { dashboardService } from '@/services'
import type { ConversionData, ProspectStatus } from '@/types/api'

// ------------------------------------------------------------ pipeline

const FUNNEL_GROUPS: { label: string; statuses: ProspectStatus[]; color: string }[] = [
  { label: 'New Lead', statuses: ['new_lead', 'contact_attempted'], color: '#c8102e' },
  { label: 'Contacted', statuses: ['contacted', 'nurturing'], color: '#d42a45' },
  { label: 'Needs Analysis', statuses: ['needs_analysis'], color: '#e04a62' },
  { label: 'Presentation', statuses: ['presentation_scheduled', 'presentation_completed'], color: '#ea6c80' },
  { label: 'Application', statuses: ['application_in_progress', 'application_submitted', 'underwriting'], color: '#a39a9c' },
]

export function PipelineWidget() {
  const reduce = useReducedMotion()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: [...qk.dashboard, 'pipeline'], queryFn: dashboardService.pipeline })
  const stages = data?.stages ?? []
  const count = (statuses: ProspectStatus[]) =>
    stages.filter((s) => statuses.includes(s.value)).reduce((sum, s) => sum + s.count, 0)
  const active = FUNNEL_GROUPS.reduce((sum, g) => sum + count(g.statuses), 0)
  const max = Math.max(1, ...FUNNEL_GROUPS.map((g) => count(g.statuses)))
  const closed = (status: ProspectStatus) => stages.find((s) => s.value === status)?.count ?? 0

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Prospect Pipeline"
        description="Active prospects by stage. Select a stage to see them."
        action={
          <Link to="/pipeline" className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-brand-700">
            View all <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className="flex-1 px-5 pt-4 pb-5">
          <ul className="space-y-2">
            {FUNNEL_GROUPS.map((group, index) => {
              const n = count(group.statuses)
              const width = 30 + (70 * n) / max
              return (
                <li key={group.label}>
                  <Link
                    to={`/prospects?status=${group.statuses.join(',')}`}
                    className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg p-1 hover:bg-ink-50"
                    aria-label={`${group.label}: ${n} prospects`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-1/2 shrink-0">
                        {isLoading ? (
                          <Skeleton className="h-7" />
                        ) : (
                          <motion.div
                            className="mx-auto grid h-7 place-items-center rounded-md text-xs font-semibold text-white"
                            style={{ background: group.color }}
                            initial={reduce ? false : { width: '0%' }}
                            animate={{ width: `${width}%` }}
                            transition={{ duration: 0.5, delay: index * 0.06, ease: 'easeOut' }}
                          >
                            {n}
                          </motion.div>
                        )}
                      </div>
                      <span className="truncate text-sm text-ink-700 group-hover:text-ink-900">{group.label}</span>
                    </div>
                    <span className="tabular text-xs text-ink-500">{active ? formatPercent(Math.round((n * 1000) / active) / 10) : '—'}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
            {(['won', 'lost', 'on_hold'] as const).map((status) => (
              <Link key={status} to={`/prospects?status=${status === 'lost' ? 'lost,not_qualified' : status}`} className="rounded-lg py-1 hover:bg-ink-50">
                <p className="tabular text-lg font-semibold text-ink-900">{status === 'lost' ? closed('lost') + closed('not_qualified') : closed(status)}</p>
                <p className="text-[11px] text-ink-500">{status === 'won' ? 'Won' : status === 'lost' ? 'Lost / Not qualified' : 'On hold'}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

// --------------------------------------------------------- performance

const SERIES = [
  { key: 'new_prospects', label: 'New prospects', color: CHART_COLORS.newProspects },
  { key: 'appointments', label: 'Appointments', color: CHART_COLORS.appointments },
  { key: 'qualified', label: 'Qualified', color: CHART_COLORS.qualified },
  { key: 'policies_issued', label: 'Policies issued', color: CHART_COLORS.policies },
] as const

export function PerformanceWidget() {
  const [period, setPeriod] = useState<'monthly' | 'quarterly'>('monthly')
  const [showTable, setShowTable] = useState(false)
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...qk.dashboard, 'performance', period],
    queryFn: () => dashboardService.performance(period),
  })
  const empty = data?.series.every((p) => SERIES.every((s) => p[s.key] === 0))

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={period === 'monthly' ? 'Monthly Performance' : 'Quarterly Performance'}
        description={period === 'monthly' ? 'Last 6 months' : 'Last 4 quarters'}
        action={
          <Segmented
            label="Period"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'quarterly', label: 'Quarterly' },
            ]}
          />
        }
      />
      <div className="flex-1 px-3 pt-4 pb-3 sm:px-4">
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading || !data ? (
          <Skeleton className="mx-2 h-56" />
        ) : empty ? (
          <EmptyState compact title="No activity yet" description="Add prospects and schedule meetings to see your trend." />
        ) : showTable ? (
          <div className="relative overflow-x-auto px-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-500">
                  <th className="py-2 font-medium">Period</th>
                  {SERIES.map((s) => (
                    <th key={s.key} className="py-2 text-right font-medium">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.series.map((point) => (
                  <tr key={point.period}>
                    <td className="py-2 text-ink-700">{point.label}</td>
                    {SERIES.map((s) => (
                      <td key={s.key} className="tabular py-2 text-right text-ink-900">{point[s.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-60" role="img" aria-label="Bar chart of new prospects, appointments, qualified prospects and policies issued per period">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.series} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eee7e8" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#7a7072' }}
                  tickFormatter={(v: string) => (period === 'monthly' ? v.split(' ')[0] ?? v : v)}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#7a7072' }} />
                <Tooltip
                  cursor={{ fill: 'rgba(200,16,46,0.05)' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #eee7e8', fontSize: 12, boxShadow: '0 10px 30px -12px rgba(60,20,25,.25)' }}
                  labelStyle={{ color: '#1c1718', fontWeight: 600 }}
                  itemStyle={{ color: '#463e40' }}
                />
                <Legend itemSorter={null} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#5c5355', paddingTop: 6 }} />
                {SERIES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={14} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {data && !empty && (
        <div className="border-t border-line px-5 py-2.5">
          <button type="button" className="text-xs font-medium text-ink-500 hover:text-brand-700" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Show chart' : 'Show as table'}
          </button>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------- follow-ups

export function FollowUpsWidget() {
  const { open, dialogs } = useFollowUpDialogs()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: [...qk.dashboard, 'activity'], queryFn: dashboardService.activity })
  const items = [...(data?.overdue ?? []), ...(data?.upcoming ?? [])].slice(0, 6)

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Upcoming Follow-ups"
        description={data?.overdue.length ? `${data.overdue.length} overdue shown first` : 'Your next conversations'}
        action={
          <Link to="/follow-ups" className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-brand-700">
            View all <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      <div className="flex-1 pt-2 pb-2">
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <ListSkeleton rows={4} />
        ) : items.length === 0 ? (
          <EmptyState compact icon={CheckCircle2} title="Nothing scheduled" description="Schedule a follow-up to keep conversations moving." />
        ) : (
          <div className="divide-y divide-line">
            {items.map((item) => (
              <FollowUpItem key={item.id} followUp={item} onAction={open} compact />
            ))}
          </div>
        )}
      </div>
      {dialogs}
    </Card>
  )
}

// ----------------------------------------------------------- conversion

function Ring({ value, color }: { value: number | null; color: string }) {
  const reduce = useReducedMotion()
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(100, value ?? 0))
  return (
    <svg viewBox="0 0 84 84" className="size-24" aria-hidden>
      <circle cx="42" cy="42" r={radius} fill="none" stroke="#f1eeee" strokeWidth="8" />
      <motion.circle
        cx="42"
        cy="42"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={reduce ? false : { strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference * (1 - pct / 100) }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        transform="rotate(-90 42 42)"
      />
      <text x="42" y="47" textAnchor="middle" className="fill-ink-900 text-[15px] font-semibold">
        {value === null ? '—' : `${Math.round(value)}%`}
      </text>
    </svg>
  )
}

export function ConversionWidget({ data, loading }: { data?: ConversionData; loading: boolean }) {
  const colors = ['#c8102e', '#e04a62', '#ea6c80']
  return (
    <Card>
      <CardHeader
        title="Conversion Overview"
        description={data ? `${data.cohort.description} · ${data.cohort.size} in cohort` : 'Cohort-based conversion'}
        action={
          <Link to="/reports" className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-brand-700">
            Reports <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-4 px-5 pt-4 pb-5 sm:grid-cols-3">
        {loading || !data
          ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="mx-auto size-24 rounded-full" />)
          : data.rates.map((rate, i) => (
              <div key={rate.key} className="flex items-center gap-3 sm:flex-col sm:text-center">
                <Ring value={rate.rate} color={colors[i] ?? '#c8102e'} />
                <div>
                  <p className="text-sm font-medium text-ink-800">{rate.label}</p>
                  <p className="tabular text-xs text-ink-500">
                    ({rate.numerator} / {rate.denominator})
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-ink-400">{rate.definition}</p>
                </div>
              </div>
            ))}
      </div>
    </Card>
  )
}

// -------------------------------------------------------- quick actions

export function QuickActionsWidget() {
  const navigate = useNavigate()
  const { scheduleFollowUp, logActivity } = useQuickActions()
  const actions = [
    { label: 'Add Prospect', icon: UserPlus, onClick: () => navigate('/prospects/new'), primary: true },
    { label: 'Schedule Follow-up', icon: CalendarPlus, onClick: () => scheduleFollowUp() },
    { label: 'Log Activity', icon: PencilLine, onClick: () => logActivity() },
    { label: 'View Overdue', icon: AlarmClock, onClick: () => navigate('/follow-ups?bucket=overdue') },
  ]
  return (
    <Card>
      <CardHeader title="Quick Actions" />
      <div className="grid grid-cols-1 gap-2 px-5 pt-4 pb-5 sm:grid-cols-2 lg:grid-cols-1">
        {actions.map((action) => (
          <Button key={action.label} variant={action.primary ? 'primary' : 'secondary'} className="h-11 justify-start" onClick={action.onClick}>
            <action.icon /> {action.label}
          </Button>
        ))}
      </div>
    </Card>
  )
}

// -------------------------------------------------------- recent activity

const FEED_ICONS: Record<string, { icon: typeof UserPlus; tint: string }> = {
  'prospect.created': { icon: UserPlus, tint: 'bg-brand-50 text-brand-600' },
  'prospect.status_changed': { icon: RefreshCcw, tint: 'bg-violet-50 text-violet-600' },
  'followup.completed': { icon: CheckCircle2, tint: 'bg-emerald-50 text-emerald-600' },
  'followup.created': { icon: CalendarPlus, tint: 'bg-sky-50 text-sky-600' },
  'followup.rescheduled': { icon: AlarmClock, tint: 'bg-amber-50 text-amber-600' },
  'activity.logged': { icon: History, tint: 'bg-teal-50 text-teal-600' },
  'opportunity.created': { icon: FilePlus2, tint: 'bg-orange-50 text-orange-600' },
  'opportunity.updated': { icon: FilePlus2, tint: 'bg-orange-50 text-orange-600' },
  'note.added': { icon: NotebookPen, tint: 'bg-ink-100 text-ink-600' },
}

export function RecentActivityWidget() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: [...qk.dashboard, 'activity'], queryFn: dashboardService.activity })
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Recent Activity"
        action={
          <Link to="/activities" className="flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-brand-700">
            View all <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      <div className="flex-1 px-5 pt-3 pb-4">
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <ListSkeleton rows={4} />
        ) : !data?.recent.length ? (
          <EmptyState compact icon={History} title="No activity yet" />
        ) : (
          <ul className="space-y-3">
            {data.recent.slice(0, 6).map((item) => {
              const meta = FEED_ICONS[item.action] ?? { icon: History, tint: 'bg-ink-100 text-ink-600' }
              const Icon = meta.icon
              return (
                <li key={item.id} className="flex gap-3">
                  <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', meta.tint)}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{item.action_label}</p>
                    <p className="truncate text-xs text-ink-500">
                      {item.prospect ? (
                        <Link to={`/prospects/${item.prospect.id}`} className="hover:text-brand-700">
                          {item.summary}
                        </Link>
                      ) : (
                        item.summary
                      )}{' '}
                      · {timeAgo(item.created_at)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}
