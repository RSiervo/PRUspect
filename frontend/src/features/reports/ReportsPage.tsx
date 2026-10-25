import { useMutation, useQuery } from '@tanstack/react-query'
import { Download, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'

import { EmptyState, ErrorState } from '@/components/data-display/states'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { Card, CardHeader, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { useQueryState } from '@/hooks'
import { errorMessage } from '@/lib/api'
import { CHART_COLORS, STATUS_META } from '@/lib/constants'
import { addDaysKey, todayKey } from '@/lib/datetime'
import { qk } from '@/lib/queryKeys'
import { formatMoney, formatPercent } from '@/lib/utils'
import { reportService, type DateRange } from '@/services'

const tooltipStyle = { borderRadius: 12, border: '1px solid #eee7e8', fontSize: 12 }
const axis = { tickLine: false, axisLine: false, tick: { fontSize: 11, fill: '#7a7072' } }

function ExportButton({ report, range }: { report: string; range: DateRange }) {
  const exp = useMutation({
    mutationFn: () => reportService.exportCsv(report, range),
    onSuccess: () => toast.success('CSV downloaded'),
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Button variant="secondary" size="sm" onClick={() => exp.mutate()} loading={exp.isPending}>
      <Download /> CSV
    </Button>
  )
}

function Definition({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-500">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-500">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold text-ink-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-500">{hint}</p>}
    </div>
  )
}

function Loading() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  )
}

function ProspectsReport({ range }: { range: DateRange }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: [...qk.reports, 'prospects', range], queryFn: () => reportService.prospects(range) })
  if (error) return <Card><ErrorState error={error} onRetry={refetch} /></Card>
  if (isLoading || !data) return <Loading />
  const maxStatus = Math.max(1, ...data.by_status.map((s) => s.count))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Prospects added" value={data.total} hint="In the selected range" />
        <Stat label="Sources used" value={data.sources.length} />
        <Stat label="Won" value={data.by_status.find((s) => s.value === 'won')?.count ?? 0} hint="Currently Policy Issued — Won" />
        <Stat label="Still active" value={data.by_status.filter((s) => s.kind === 'active').reduce((a, s) => a + s.count, 0)} />
      </div>
      <Card>
        <CardHeader title="Prospect acquisition by month" action={<ExportButton report="acquisition" range={range} />} />
        <div className="h-64 px-3 pt-4 pb-3" role="img" aria-label="New prospects per month">
          <ResponsiveContainer>
            <BarChart data={data.acquisition} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#eee7e8" />
              <XAxis dataKey="label" {...axis} tickFormatter={(v: string) => v.split(' ')[0] ?? v} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(200,16,46,0.05)' }} />
              <Bar dataKey="count" name="New prospects" fill={CHART_COLORS.newProspects} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Source performance" description="Prospects added in range, by source" action={<ExportButton report="sources" range={range} />} />
          <div className="relative overflow-x-auto px-5 pt-3 pb-4">
            {data.sources.length === 0 ? (
              <EmptyState compact title="No prospects in this range" />
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-500">
                  <tr><th className="py-2 font-medium">Source</th><th className="py-2 text-right font-medium">Prospects</th><th className="py-2 text-right font-medium">Qualified</th><th className="py-2 text-right font-medium">Won</th><th className="py-2 text-right font-medium">Conv.</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.sources.map((s) => (
                    <tr key={s.source_id ?? 'none'}>
                      <td className="py-2 text-ink-800">{s.source}</td>
                      <td className="tabular py-2 text-right">{s.prospects}</td>
                      <td className="tabular py-2 text-right">{s.qualified}</td>
                      <td className="tabular py-2 text-right">{s.won}</td>
                      <td className="tabular py-2 text-right">{formatPercent(s.conversion_rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-3"><Definition>Conversion = prospects from that source that reached Policy Issued ÷ prospects from that source added in the range.</Definition></div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Top referrers" description="Who referred the prospects added in this range" />
          <div className="relative overflow-x-auto px-5 pt-3 pb-4">
            {data.top_referrers.length === 0 ? (
              <EmptyState compact title="No linked referrals yet" description="Use “Referred by” on a prospect to link who sent them." />
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-500">
                  <tr><th className="py-2 font-medium">Referrer</th><th className="py-2 text-right font-medium">Referrals</th><th className="py-2 text-right font-medium">Won</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.top_referrers.map((r) => (
                    <tr key={r.prospect_id}>
                      <td className="py-2"><Link to={`/prospects/${r.prospect_id}`} className="text-ink-800 hover:text-brand-700">{r.name}</Link></td>
                      <td className="tabular py-2 text-right">{r.referrals}</td>
                      <td className="tabular py-2 text-right">{r.won}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Prospects by status" description="Current status of prospects added in range" action={<ExportButton report="status" range={range} />} />
          <ul className="space-y-2 px-5 pt-3 pb-5">
            {data.by_status.map((s) => (
              <li key={s.value} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3 text-sm sm:grid-cols-[11rem_1fr_2.5rem]">
                <span className="truncate text-ink-700">{s.label}</span>
                <span className="h-2 rounded-full bg-ink-100">
                  <span className="block h-2 rounded-full" style={{ width: `${(s.count / maxStatus) * 100}%`, background: STATUS_META[s.value].color }} />
                </span>
                <span className="tabular text-right text-ink-900">{s.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

function ConversionReport({ range }: { range: DateRange }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: [...qk.reports, 'conversion', range], queryFn: () => reportService.conversion(range) })
  if (error) return <Card><ErrorState error={error} onRetry={refetch} /></Card>
  if (isLoading || !data) return <Loading />
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-900">Cohort: {data.cohort.description}</h2>
            <p className="mt-0.5 text-sm text-ink-500">{data.cohort.size} prospects. Each rate counts how many of <em>these same prospects</em> later reached the milestone.</p>
          </div>
          <ExportButton report="conversion" range={range} />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          {data.rates.map((r) => (
            <div key={r.key} className="rounded-2xl border border-line p-4">
              <p className="text-sm font-medium text-ink-700">{r.label}</p>
              <p className="tabular mt-2 text-3xl font-semibold text-ink-900">{formatPercent(r.rate)}</p>
              <p className="tabular mt-1 text-xs text-ink-500">{r.numerator} of {r.denominator}</p>
              <div className="mt-2 h-1.5 rounded-full bg-ink-100"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${r.rate ?? 0}%` }} /></div>
              <div className="mt-3"><Definition>{r.definition}</Definition></div>
            </div>
          ))}
        </div>
      </Card>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Qualified" value={data.counts.qualified} />
        <Stat label="Applications submitted" value={data.counts.applications} />
        <Stat label="Policies issued" value={data.counts.issued} hint="Prospects reaching Won" />
      </div>
    </div>
  )
}

function ActivityReport({ range }: { range: DateRange }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: [...qk.reports, 'activity', range], queryFn: () => reportService.activity(range) })
  if (error) return <Card><ErrorState error={error} onRetry={refetch} /></Card>
  if (isLoading || !data) return <Loading />
  const f = data.follow_ups
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Follow-up completion rate" value={formatPercent(f.completion_rate)} hint={`${f.completed} of ${f.scheduled} scheduled`} />
        <Stat label="Overdue right now" value={f.overdue_now} hint="Pending, before today" />
        <Stat label="Missed in range" value={f.missed} hint="Still pending after their day" />
        <Stat label="Canceled" value={f.canceled} />
      </div>
      <Card>
        <CardHeader title="Appointment activity" description="Meetings and presentations by scheduled month" action={<ExportButton report="activity" range={range} />} />
        <div className="h-64 px-3 pt-4 pb-3" role="img" aria-label="Appointments scheduled and completed per month">
          <ResponsiveContainer>
            <BarChart data={data.appointments_by_month} barGap={2} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#eee7e8" />
              <XAxis dataKey="label" {...axis} tickFormatter={(v: string) => v.split(' ')[0] ?? v} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(37,99,235,0.05)' }} />
              <Legend itemSorter={null} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="scheduled" name="Scheduled" fill={CHART_COLORS.appointments} radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="completed" name="Completed" fill={CHART_COLORS.policies} radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <CardHeader title="By follow-up type" />
        <div className="relative overflow-x-auto px-5 pt-3 pb-4">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500"><tr><th className="py-2 font-medium">Type</th><th className="py-2 text-right font-medium">Scheduled</th><th className="py-2 text-right font-medium">Completed</th><th className="py-2 text-right font-medium">Rate</th></tr></thead>
            <tbody className="divide-y divide-line">
              {data.by_type.map((t) => (
                <tr key={t.activity_type}><td className="py-2">{t.label}</td><td className="tabular py-2 text-right">{t.total}</td><td className="tabular py-2 text-right">{t.completed}</td><td className="tabular py-2 text-right">{formatPercent(t.total ? Math.round((t.completed * 1000) / t.total) / 10 : null)}</td></tr>
              ))}
            </tbody>
          </table>
          {data.by_type.length === 0 && <EmptyState compact title="No follow-ups in this range" />}
          <div className="mt-3"><Definition>{data.definitions.completion_rate}</Definition></div>
        </div>
      </Card>
    </div>
  )
}

function PipelineReport({ range }: { range: DateRange }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: [...qk.reports, 'pipeline', range], queryFn: () => reportService.pipeline(range) })
  if (error) return <Card><ErrorState error={error} onRetry={refetch} /></Card>
  if (isLoading || !data) return <Loading />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="card p-5">
          <p className="text-sm text-ink-500">Estimated premium pipeline (current)</p>
          <p className="tabular mt-1 text-3xl font-semibold text-ink-900">{formatMoney(data.estimated_pipeline.total)}</p>
          <p className="mt-1 text-xs text-ink-500">{data.estimated_pipeline.opportunities} open opportunities{data.estimated_pipeline.without_estimate ? ` · ${data.estimated_pipeline.without_estimate} without an estimate` : ''}</p>
          <div className="mt-3"><Definition>{data.definitions.estimated_pipeline}</Definition></div>
        </div>
        <div className="card p-5">
          <p className="text-sm text-ink-500">Confirmed issued annualized premium (in range)</p>
          <p className="tabular mt-1 text-3xl font-semibold text-emerald-700">{formatMoney(data.issued.total)}</p>
          <p className="mt-1 text-xs text-ink-500">{data.issued.policies} policies issued{data.issued.without_verified_premium ? ` · ${data.issued.without_verified_premium} awaiting verified premium` : ''}</p>
          <div className="mt-3"><Definition>{data.definitions.issued}</Definition></div>
        </div>
      </div>
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">{data.definitions.note}</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Opportunities by stage" description="All non-archived opportunities" action={<ExportButton report="pipeline" range={range} />} />
          <div className="relative overflow-x-auto px-5 pt-3 pb-4">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-500"><tr><th className="py-2 font-medium">Stage</th><th className="py-2 text-right font-medium">Count</th><th className="py-2 text-right font-medium">Estimated</th><th className="py-2 text-right font-medium">Actual</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.by_stage.map((s) => (
                  <tr key={s.value}>
                    <td className="py-2">{s.label}</td>
                    <td className="tabular py-2 text-right">{s.count}</td>
                    <td className="tabular py-2 text-right text-ink-600">{formatMoney(s.estimated_annual_premium)}</td>
                    <td className="tabular py-2 text-right">{s.actual_annualized_premium ? formatMoney(s.actual_annualized_premium) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Policies issued by month" description="By issuance date" />
          <div className="h-64 px-3 pt-4 pb-3" role="img" aria-label="Policies issued per month">
            <ResponsiveContainer>
              <BarChart data={data.issued_by_month} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eee7e8" />
                <XAxis dataKey="label" {...axis} tickFormatter={(v: string) => v.split(' ')[0] ?? v} />
                <YAxis allowDecimals={false} {...axis} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(13,148,136,0.06)' }} />
                <Bar dataKey="count" name="Policies issued" fill={CHART_COLORS.policies} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  )
}

const PRESETS: Record<string, () => DateRange> = {
  '12m': () => ({ date_from: addDaysKey(todayKey(), -365), date_to: todayKey() }),
  '90d': () => ({ date_from: addDaysKey(todayKey(), -89), date_to: todayKey() }),
  ytd: () => ({ date_from: `${todayKey().slice(0, 4)}-01-01`, date_to: todayKey() }),
  '3y': () => ({ date_from: `${Number(todayKey().slice(0, 4)) - 2}-01-01`, date_to: todayKey() }),
}

export function ReportsPage() {
  const [q, update] = useQueryState({ tab: 'prospects', preset: '12m', date_from: '', date_to: '' })
  const range: DateRange = q.preset === 'custom' ? { date_from: q.date_from || undefined, date_to: q.date_to || undefined } : (PRESETS[q.preset] ?? PRESETS['12m']!)()

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Every figure is calculated on the server from your saved records."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="preset">Date range</Label>
              <Select id="preset" value={q.preset} onChange={(e) => update({ preset: e.target.value })} className="w-44">
                <option value="12m">Last 12 months</option>
                <option value="90d">Last 90 days</option>
                <option value="ytd">Year to date</option>
                <option value="3y">Last 3 calendar years</option>
                <option value="custom">Custom…</option>
              </Select>
            </div>
            {q.preset === 'custom' && (
              <>
                <Input type="date" aria-label="From" value={q.date_from} onChange={(e) => update({ date_from: e.target.value })} className="w-40" />
                <Input type="date" aria-label="To" value={q.date_to} min={q.date_from || undefined} onChange={(e) => update({ date_to: e.target.value })} className="w-40" />
              </>
            )}
          </div>
        }
      />
      <Tabs value={q.tab} onValueChange={(tab) => update({ tab })}>
        <TabsList className="mb-4">
          <TabsTrigger value="prospects">Prospects</TabsTrigger>
          <TabsTrigger value="conversion">Conversion</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="pipeline">Premium pipeline</TabsTrigger>
        </TabsList>
        <TabsContent value="prospects"><ProspectsReport range={range} /></TabsContent>
        <TabsContent value="conversion"><ConversionReport range={range} /></TabsContent>
        <TabsContent value="activity"><ActivityReport range={range} /></TabsContent>
        <TabsContent value="pipeline"><PipelineReport range={range} /></TabsContent>
      </Tabs>
    </div>
  )
}
