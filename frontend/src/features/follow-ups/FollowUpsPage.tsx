import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarPlus, CheckCircle2, ClipboardCheck, Search } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Pagination } from '@/components/data-display/common'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/data-display/states'
import { FilterPanel, FilterToggleButton, useFilterToggle } from '@/components/forms/FilterToggle'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { useDebouncedValue, useQueryState } from '@/hooks'
import { ACTIVITY_META, ACTIVITY_TYPES, PRIORITIES, PRIORITY_META } from '@/lib/constants'
import { dateKey, formatDate, todayKey } from '@/lib/datetime'
import { qk } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { followUpService } from '@/services'
import type { FollowUp } from '@/types/api'

import { FollowUpItem, useFollowUpDialogs } from './FollowUpItem'

const DEFAULTS = { bucket: 'today', search: '', activity_type: '', priority: '', page: '1' }
const BUCKETS = [
  { value: 'overdue', label: 'Overdue', tone: 'text-amber-700' },
  { value: 'today', label: 'Due today', tone: 'text-brand-700' },
  { value: 'upcoming', label: 'Upcoming', tone: 'text-sky-700' },
  { value: 'completed', label: 'Completed', tone: 'text-emerald-700' },
  { value: 'canceled', label: 'Canceled', tone: 'text-ink-500' },
] as const

function groupByDay(items: FollowUp[], field: 'scheduled_at' | 'completed_at') {
  const groups = new Map<string, FollowUp[]>()
  for (const item of items) {
    const key = dateKey(item[field] ?? item.scheduled_at)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.entries()]
}

export function FollowUpsPage() {
  const [filters, update] = useQueryState(DEFAULTS)
  const [term, setTerm] = useState(filters.search)
  const debounced = useDebouncedValue(term, 300)
  const { scheduleFollowUp } = useQuickActions()
  const { open, dialogs } = useFollowUpDialogs()
  const panel = useFilterToggle()

  useEffect(() => {
    if (debounced !== filters.search) update({ search: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const { data: summary } = useQuery({ queryKey: qk.followUpSummary, queryFn: followUpService.summary })
  const params = { bucket: filters.bucket, search: filters.search, activity_type: filters.activity_type, priority: filters.priority, page: Number(filters.page) || 1, page_size: 25 }
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: qk.followUpList(params),
    queryFn: () => followUpService.list(params),
    placeholderData: keepPreviousData,
  })
  const field = filters.bucket === 'completed' ? 'completed_at' : 'scheduled_at'
  const today = todayKey()

  return (
    <div>
      <PageHeader
        title="Follow-ups"
        description="Calls, messages and meetings to keep every prospect moving."
        actions={
          <Button onClick={() => scheduleFollowUp()}>
            <CalendarPlus /> Schedule follow-up
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5" role="tablist" aria-label="Follow-up groups">
        {BUCKETS.map((b) => {
          const active = filters.bucket === b.value
          return (
            <button
              key={b.value}
              role="tab"
              aria-selected={active}
              onClick={() => update({ bucket: b.value })}
              className={cn('card flex items-center justify-between px-4 py-3 text-left transition-shadow hover:shadow-[var(--shadow-pop)]', active && 'ring-2 ring-brand-500')}
            >
              <span className="text-sm text-ink-600">{b.label}</span>
              <span className={cn('tabular text-xl font-semibold', b.tone)}>{summary ? summary[b.value] : '–'}</span>
            </button>
          )
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:px-4 md:flex-row md:items-center">
          <div className="flex items-center gap-2 md:flex-1">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search subject or prospect" className="pl-10" aria-label="Search follow-ups" />
            </div>
            <FilterToggleButton open={panel.open} onToggle={panel.toggle} activeCount={[filters.activity_type, filters.priority].filter(Boolean).length} controls="follow-up-filters" />
          </div>
          <FilterPanel id="follow-up-filters" open={panel.open} className="flex-col gap-2 md:flex-row">
          <div className="md:w-52"><Select value={filters.activity_type} onChange={(e) => update({ activity_type: e.target.value })} aria-label="Type">
            <option value="">All types</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>{ACTIVITY_META[t].label}</option>
            ))}
          </Select></div>
          <div className="md:w-40"><Select value={filters.priority} onChange={(e) => update({ priority: e.target.value })} aria-label="Priority">
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_META[p].label}</option>
            ))}
          </Select></div>
          </FilterPanel>
        </div>

        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <ListSkeleton rows={6} />
        ) : !data?.results.length ? (
          <EmptyState
            icon={filters.bucket === 'overdue' ? CheckCircle2 : ClipboardCheck}
            title={filters.bucket === 'overdue' ? 'Nothing overdue — nice work' : filters.bucket === 'today' ? 'Nothing due today' : `No ${filters.bucket} follow-ups`}
            description={filters.bucket === 'upcoming' || filters.bucket === 'today' ? 'Schedule a follow-up to plan your next conversation.' : undefined}
            action={filters.bucket !== 'completed' && filters.bucket !== 'canceled' ? <Button variant="secondary" onClick={() => scheduleFollowUp()}><CalendarPlus /> Schedule follow-up</Button> : undefined}
          />
        ) : (
          <div className={cn(isFetching && 'opacity-70')}>
            {groupByDay(data.results, field).map(([day, items]) => (
              <section key={day}>
                <h2 className="sticky top-14 z-10 border-y border-line bg-ink-50/95 px-4 py-1.5 text-xs font-semibold text-ink-500 backdrop-blur sm:px-5">
                  {day === today ? 'Today' : formatDate(day, 'EEEE, MMM d, yyyy')}
                </h2>
                <div className="divide-y divide-line">
                  {items.map((item) => (
                    <FollowUpItem key={item.id} followUp={item} onAction={open} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {data && <Pagination page={data.page} totalPages={data.total_pages} count={data.count} pageSize={25} onPageChange={(p) => update({ page: String(p) }, { resetPage: false })} />}
      </div>
      {dialogs}
    </div>
  )
}
