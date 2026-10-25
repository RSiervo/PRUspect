import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { Archive, ArchiveRestore, Download, Mail, Phone, UserPlus, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { DemoBadge, PriorityBadge } from '@/components/data-display/badges'
import { Avatar, Pagination } from '@/components/data-display/common'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/data-display/states'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/menu'
import { Checkbox, Tabs, TabsList, TabsTrigger } from '@/components/ui/misc'
import { useLocalPreference, useMediaQuery, useQueryState } from '@/hooks'
import { errorMessage } from '@/lib/api'
import { PRIORITIES, PRIORITY_META, STATUS_META, STATUS_ORDER } from '@/lib/constants'
import { formatDate, formatRelativeDay, timeAgo } from '@/lib/datetime'
import { invalidateCrm, qk } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { prospectService, type ListParams } from '@/services'
import type { ProspectListItem, ProspectStatus } from '@/types/api'

import { StatusChanger, useProspectOptions } from './ChangeStatus'
import { FILTER_DEFAULTS, ProspectFilters, type FilterState } from './ProspectFilters'
import { ProspectRowActions } from './ProspectRowActions'

const PAGE_SIZE = 20

function toParams(filters: FilterState): ListParams {
  return {
    search: filters.search,
    status: filters.status,
    priority: filters.priority,
    source: filters.source,
    interest: filters.interest,
    created_from: filters.created_from,
    created_to: filters.created_to,
    milestone: filters.milestone,
    ordering: filters.ordering,
    archived: filters.archived,
  }
}

function NextFollowUp({ value }: { value: string | null }) {
  if (!value) return <span className="text-ink-300">None</span>
  const overdue = new Date(value).getTime() < Date.now()
  return <span className={cn(overdue && 'font-medium text-amber-700')}>{formatRelativeDay(value)}</span>
}

function ProspectCard({ prospect, selected, onSelect }: { prospect: ProspectListItem; selected: boolean; onSelect: (checked: boolean) => void }) {
  return (
    <div className={cn('card relative flex flex-col gap-3 p-4 transition-shadow hover:shadow-[var(--shadow-pop)]', selected && 'ring-2 ring-brand-300')}>
      <div className="flex items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={(c) => onSelect(c === true)} aria-label={`Select ${prospect.full_name}`} className="mt-2.5" />
        <Avatar name={prospect.full_name} className="size-11" />
        <div className="min-w-0 flex-1">
          <Link to={`/prospects/${prospect.id}`} className="block truncate font-semibold text-ink-900 after:absolute after:inset-0 hover:text-brand-700">
            {prospect.full_name}
          </Link>
          <p className="truncate text-sm text-ink-500">{prospect.mobile || prospect.email}</p>
        </div>
        <div className="relative z-10 flex flex-col items-end gap-1.5">
          <ProspectRowActions prospect={prospect} />
        </div>
      </div>
      <div className="relative z-10 flex flex-wrap items-center gap-1.5">
        <StatusChanger prospectId={prospect.id} prospectName={prospect.full_name} status={prospect.status} disabled={prospect.is_archived} />
        <PriorityBadge priority={prospect.priority} />
        {prospect.is_demo && <DemoBadge />}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
        <div>
          <p className="text-ink-400">Next follow-up</p>
          <p className="mt-0.5 text-ink-700">
            <NextFollowUp value={prospect.next_follow_up_at} />
          </p>
        </div>
        <div>
          <p className="text-ink-400">Last contact</p>
          <p className="mt-0.5 text-ink-700">{timeAgo(prospect.last_contacted_at)}</p>
        </div>
      </div>
    </div>
  )
}

export function ProspectsPage() {
  const [filters, update] = useQueryState(FILTER_DEFAULTS)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [preferredView, setPreferredView] = useLocalPreference<'table' | 'cards'>('prospect-view', 'table')
  const view = isDesktop ? preferredView : 'cards'
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkConfirm, setBulkConfirm] = useState<null | { action: string; value?: string; label: string }>(null)
  const { data: options } = useProspectOptions()

  const page = Number(filters.page) || 1
  const params = { ...toParams(filters), page, page_size: PAGE_SIZE }
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: qk.prospectList(params),
    queryFn: ({ signal }) => prospectService.list(params, signal),
    placeholderData: keepPreviousData,
  })

  const results = data?.results ?? []
  const allSelected = results.length > 0 && results.every((p) => selected.has(p.id))
  const someSelected = results.some((p) => selected.has(p.id))

  const bulk = useMutation({
    mutationFn: ({ action, value }: { action: string; value?: string }) => prospectService.bulk([...selected], action, value),
    onSuccess: (result) => {
      toast.success(`Updated ${result.updated} prospect${result.updated === 1 ? '' : 's'}`, {
        description: result.skipped ? `${result.skipped} already matched and were skipped.` : undefined,
      })
      setSelected(new Set())
      setBulkConfirm(null)
      invalidateCrm()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const exportCsv = useMutation({
    mutationFn: () => prospectService.exportCsv(toParams(filters)),
    onSuccess: () => toast.success('Export ready', { description: 'Your CSV contains only the prospects matching these filters.' }),
    onError: (error) => toast.error(errorMessage(error)),
  })

  const toggleOne = (id: number, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

  const archivedTab = filters.archived === 'archived'

  return (
    <div>
      <PageHeader
        title="Prospects"
        description={data ? `${data.count.toLocaleString()} ${archivedTab ? 'archived' : 'active'} prospect${data.count === 1 ? '' : 's'}${filters.search ? ` matching “${filters.search}”` : ''}` : 'Your prospect list'}
        actions={
          <>
            <Button variant="secondary" onClick={() => exportCsv.mutate()} loading={exportCsv.isPending} disabled={!data?.count}>
              <Download /> Export CSV
            </Button>
            <Button asChild>
              <Link to="/prospects/new">
                <UserPlus /> Add prospect
              </Link>
            </Button>
          </>
        }
      />

      <div className="card overflow-hidden">
        <Tabs value={archivedTab ? 'archived' : 'active'} onValueChange={(v) => { setSelected(new Set()); update({ archived: v }) }}>
          <TabsList className="px-4 sm:px-5">
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
        <ProspectFilters filters={filters} update={update} options={options} view={view} onViewChange={setPreferredView} />

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-brand-100 bg-brand-50/60 px-4 py-2.5 sm:px-5" role="region" aria-label="Bulk actions">
            <p className="mr-2 text-sm font-medium text-brand-900">{selected.size} selected</p>
            {!archivedTab && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm">Set priority</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {PRIORITIES.map((p) => (
                      <DropdownMenuItem key={p} onSelect={() => bulk.mutate({ action: 'set_priority', value: p })}>
                        {PRIORITY_META[p].label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm">Change status</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuLabel>Move selected to…</DropdownMenuLabel>
                    {STATUS_ORDER.map((s: ProspectStatus) => (
                      <DropdownMenuItem key={s} onSelect={() => setBulkConfirm({ action: 'set_status', value: s, label: `Move ${selected.size} prospects to ${STATUS_META[s].label}?` })}>
                        <span className="size-2 rounded-full" style={{ background: STATUS_META[s].color }} aria-hidden />
                        {STATUS_META[s].label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="secondary" size="sm" onClick={() => setBulkConfirm({ action: 'archive', label: `Archive ${selected.size} prospects?` })}>
                  <Archive /> Archive
                </Button>
              </>
            )}
            {archivedTab && (
              <Button variant="secondary" size="sm" onClick={() => bulk.mutate({ action: 'restore' })} loading={bulk.isPending}>
                <ArchiveRestore /> Restore
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X /> Clear
            </Button>
          </div>
        )}

        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <ListSkeleton rows={8} />
        ) : results.length === 0 ? (
          <EmptyState
            icon={Users}
            title={filters.search || filters.status || filters.priority ? 'No prospects match these filters' : archivedTab ? 'No archived prospects' : 'No prospects yet'}
            description={filters.search || filters.status ? 'Try a different search or clear the filters.' : archivedTab ? 'Archived prospects appear here.' : 'Add your first prospect to start building your pipeline.'}
            action={
              !archivedTab && !filters.search && (
                <Button asChild>
                  <Link to="/prospects/new">
                    <UserPlus /> Add prospect
                  </Link>
                </Button>
              )
            }
          />
        ) : view === 'table' ? (
          <div className={cn('relative overflow-x-auto transition-opacity', isFetching && 'opacity-70')}>
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="bg-ink-50/70 text-left text-xs font-medium text-ink-500">
                <tr>
                  <th className="sticky left-0 z-10 w-10 bg-ink-50 px-4 py-2.5">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={(c) => setSelected(c === true ? new Set(results.map((p) => p.id)) : new Set())}
                      aria-label="Select all on this page"
                    />
                  </th>
                  <th className="sticky left-10 z-10 bg-ink-50 px-3 py-2.5">Prospect</th>
                  <th className="px-3 py-2.5">Contact number</th>
                  <th className="px-3 py-2.5">Email</th>
                  <th className="px-3 py-2.5">Occupation</th>
                  <th className="px-3 py-2.5">Source</th>
                  <th className="px-3 py-2.5">Insurance interest</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Priority</th>
                  <th className="px-3 py-2.5">Last contact</th>
                  <th className="px-3 py-2.5">Next follow-up</th>
                  <th className="px-3 py-2.5">Date added</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {results.map((p) => (
                  <tr key={p.id} className={cn('group hover:bg-ink-50/50', selected.has(p.id) && 'bg-brand-50/40')}>
                    <td className="sticky left-0 z-10 bg-white px-4 py-2.5 group-hover:bg-ink-50">
                      <Checkbox checked={selected.has(p.id)} onCheckedChange={(c) => toggleOne(p.id, c === true)} aria-label={`Select ${p.full_name}`} />
                    </td>
                    <td className="sticky left-10 z-10 bg-white px-3 py-2.5 group-hover:bg-ink-50">
                      <div className="flex items-center gap-3">
                        <Avatar name={p.full_name} />
                        <div className="min-w-0">
                          <Link to={`/prospects/${p.id}`} className="block max-w-48 truncate font-medium text-ink-900 hover:text-brand-700">
                            {p.full_name}
                          </Link>
                          <div className="flex items-center gap-1.5">
                            {p.preferred_name && <span className="text-xs text-ink-500">“{p.preferred_name}”</span>}
                            {p.is_demo && <DemoBadge />}
                            {p.do_not_contact && <span className="text-[11px] font-medium text-amber-700">Do not contact</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink-700">
                      {p.mobile ? (
                        <a href={`tel:${p.mobile}`} className="inline-flex items-center gap-1.5 hover:text-brand-700"><Phone className="size-3.5 text-ink-400" />{p.mobile}</a>
                      ) : '—'}
                    </td>
                    <td className="max-w-52 truncate px-3 py-2.5 text-ink-700">
                      {p.email ? (
                        <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 hover:text-brand-700"><Mail className="size-3.5 text-ink-400" />{p.email}</a>
                      ) : '—'}
                    </td>
                    <td className="max-w-40 truncate px-3 py-2.5 text-ink-700">{p.occupation || '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink-700">{p.source?.name ?? '—'}</td>
                    <td className="max-w-44 truncate px-3 py-2.5 text-ink-700" title={p.insurance_interests.map((i) => i.name).join(', ')}>
                      {p.insurance_interests.map((i) => i.name).join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusChanger prospectId={p.id} prospectName={p.full_name} status={p.status} disabled={p.is_archived} />
                    </td>
                    <td className="px-3 py-2.5"><PriorityBadge priority={p.priority} /></td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink-600">{timeAgo(p.last_contacted_at)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink-700"><NextFollowUp value={p.next_follow_up_at} /></td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-ink-600">{formatDate(p.created_at)}</td>
                    <td className="px-3 py-2.5 text-right"><ProspectRowActions prospect={p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={cn('grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3', isFetching && 'opacity-70')}>
            {results.map((p) => (
              <ProspectCard key={p.id} prospect={p} selected={selected.has(p.id)} onSelect={(c) => toggleOne(p.id, c)} />
            ))}
          </div>
        )}

        {data && (
          <Pagination page={data.page} totalPages={data.total_pages} count={data.count} pageSize={PAGE_SIZE} onPageChange={(next) => update({ page: String(next) }, { resetPage: false })} />
        )}
      </div>

      <ConfirmDialog
        open={bulkConfirm !== null}
        onOpenChange={(open) => !open && setBulkConfirm(null)}
        title={bulkConfirm?.label ?? ''}
        description={bulkConfirm?.action === 'archive' ? 'Archived prospects are hidden from active lists and metrics. You can restore them later.' : 'Each change is recorded in the prospect’s status history.'}
        tone={bulkConfirm?.action === 'archive' ? 'danger' : 'default'}
        loading={bulk.isPending}
        onConfirm={() => bulkConfirm && bulk.mutate({ action: bulkConfirm.action, value: bulkConfirm.value })}
      />
    </div>
  )
}
