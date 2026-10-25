import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { History, PencilLine, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { Pagination, Timeline, type TimelineItem } from '@/components/data-display/common'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/data-display/states'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { useDebouncedValue, useQueryState } from '@/hooks'
import { ACTIVITY_META, ACTIVITY_TYPES } from '@/lib/constants'
import { formatDateTime } from '@/lib/datetime'
import { qk } from '@/lib/queryKeys'
import { activityService } from '@/services'

const DEFAULTS = { search: '', activity_type: '', date_from: '', date_to: '', page: '1' }

/** The interaction log: every call, message and meeting that happened. */
export function ActivitiesPage() {
  const [filters, update] = useQueryState(DEFAULTS)
  const [term, setTerm] = useState(filters.search)
  const debounced = useDebouncedValue(term, 300)
  const { logActivity } = useQuickActions()

  useEffect(() => {
    if (debounced !== filters.search) update({ search: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const params = { ...filters, page: Number(filters.page) || 1, page_size: 30 }
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...qk.activities, params],
    queryFn: () => activityService.list(params),
    placeholderData: keepPreviousData,
  })

  const items: TimelineItem[] = (data?.results ?? []).map((a) => ({
    id: a.id,
    icon: ACTIVITY_META[a.activity_type].icon,
    tint: ACTIVITY_META[a.activity_type].tint,
    title: (
      <>
        {a.activity_type_label} ·{' '}
        <Link to={`/prospects/${a.prospect}?tab=timeline`} className="text-brand-700 hover:underline">
          {a.prospect_detail.full_name}
        </Link>
      </>
    ),
    description: a.subject,
    meta: [a.outcome && `Outcome: ${a.outcome}`, a.follow_up ? 'From a completed follow-up' : null].filter(Boolean).join(' · ') || undefined,
    time: formatDateTime(a.occurred_at),
  }))

  return (
    <div>
      <PageHeader
        title="Activities"
        description="A log of interactions that already happened. Completed follow-ups appear here automatically."
        actions={
          <Button onClick={() => logActivity()}>
            <PencilLine /> Log activity
          </Button>
        }
      />
      <div className="card overflow-hidden">
        <div className="grid grid-cols-1 gap-2 border-b border-line p-4 sm:grid-cols-[1fr_200px_160px_160px] sm:px-5">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search subject or prospect" className="pl-10" aria-label="Search activities" />
          </div>
          <Select value={filters.activity_type} onChange={(e) => update({ activity_type: e.target.value })} aria-label="Type">
            <option value="">All types</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>{ACTIVITY_META[t].label}</option>
            ))}
          </Select>
          <Input type="date" value={filters.date_from} onChange={(e) => update({ date_from: e.target.value })} aria-label="From date" />
          <Input type="date" value={filters.date_to} min={filters.date_from || undefined} onChange={(e) => update({ date_to: e.target.value })} aria-label="To date" />
        </div>
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <ListSkeleton rows={6} />
        ) : items.length === 0 ? (
          <EmptyState icon={History} title="No activities found" description="Log a call or meeting, or complete a follow-up." />
        ) : (
          <div className="p-5">
            <Timeline items={items} />
          </div>
        )}
        {data && <Pagination page={data.page} totalPages={data.total_pages} count={data.count} pageSize={30} onPageChange={(p) => update({ page: String(p) }, { resetPage: false })} />}
      </div>
    </div>
  )
}
