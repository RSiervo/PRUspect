import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { BellRing, CheckCheck, ChevronDown, CircleCheck, Monitor, RotateCcw, Server, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Pagination } from '@/components/data-display/common'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/data-display/states'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/misc'
import { useAuth } from '@/features/auth/AuthProvider'
import { needsTwoFactor, TwoFactorGate } from '@/features/admin/TwoFactorGate'
import { useQueryState } from '@/hooks'
import { errorMessage } from '@/lib/api'
import { formatDateTime, timeAgo } from '@/lib/datetime'
import { queryClient } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { errorService } from '@/services'
import type { ErrorEvent } from '@/types/api'

const DEFAULTS = { status: 'open', source: '', page: '1', error: '' }
const PAGE_SIZE = 20

function refresh() {
  void queryClient.invalidateQueries({ queryKey: ['admin-errors'] })
}

function ErrorRow({ event, initiallyOpen }: { event: ErrorEvent; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  const toggle = useMutation({
    mutationFn: () => (event.is_resolved ? errorService.reopen(event.id) : errorService.resolve(event.id)),
    onSuccess: (e) => {
      toast.success(e.is_resolved ? 'Marked as resolved' : 'Reopened')
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const Icon = event.source === 'server' ? Server : Monitor
  return (
    <li className={cn('px-4 py-3 sm:px-5', initiallyOpen && 'bg-brand-50/40')}>
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', event.is_resolved ? 'bg-ink-100 text-ink-500' : 'bg-brand-50 text-brand-600')}>
          <Icon className="size-4" aria-hidden />
        </span>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-900">
            {event.error_type || 'Error'}
            <Badge className="h-5 bg-ink-100 text-[11px] text-ink-700 ring-ink-200">{event.source === 'server' ? 'Server' : 'Browser'}</Badge>
            {event.is_resolved && <Badge className="h-5 bg-emerald-50 text-[11px] text-emerald-800 ring-emerald-200">Resolved</Badge>}
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm break-words text-ink-600">{event.message}</p>
          <p className="mt-1 text-xs text-ink-500">
            <span className="font-mono">{event.location || '—'}</span> · {event.count}× · {event.users_affected} user{event.users_affected === 1 ? '' : 's'} · last {timeAgo(event.last_seen)}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant={event.is_resolved ? 'ghost' : 'secondary'} size="sm" onClick={() => toggle.mutate()} loading={toggle.isPending}>
            {event.is_resolved ? <><RotateCcw /> <span className="hidden sm:inline">Reopen</span></> : <><CircleCheck /> <span className="hidden sm:inline">Resolve</span></>}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => setOpen((v) => !v)} aria-label={open ? 'Hide details' : 'Show details'}>
            <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-2 pl-11">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-ink-600 sm:grid-cols-2">
            <div><dt className="inline text-ink-400">First seen: </dt><dd className="inline">{formatDateTime(event.first_seen)}</dd></div>
            <div><dt className="inline text-ink-400">Last seen: </dt><dd className="inline">{formatDateTime(event.last_seen)}</dd></div>
            {event.last_user_email && <div><dt className="inline text-ink-400">Last affected: </dt><dd className="inline">{event.last_user_email}</dd></div>}
            {event.release && <div><dt className="inline text-ink-400">Version: </dt><dd className="inline font-mono">{event.release}</dd></div>}
          </dl>
          {event.stack ? (
            <pre className="max-h-72 overflow-auto rounded-xl bg-ink-900 p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-ink-100">{event.stack}</pre>
          ) : (
            <p className="text-xs text-ink-400">No stack trace.</p>
          )}
        </div>
      )}
    </li>
  )
}

export function AdminSystemPage() {
  const { user: me } = useAuth()
  const [filters, update] = useQueryState(DEFAULTS)
  const [confirmAll, setConfirmAll] = useState(false)
  const isAdmin = Boolean(me?.is_staff) && !needsTwoFactor(me)
  const params = { status: filters.status, source: filters.source, page: Number(filters.page) || 1, page_size: PAGE_SIZE }
  const summary = useQuery({ queryKey: ['admin-errors', 'summary'], queryFn: errorService.summary, enabled: isAdmin, refetchInterval: 60_000 })
  const list = useQuery({ queryKey: ['admin-errors', 'list', params], queryFn: () => errorService.list(params), enabled: isAdmin, placeholderData: keepPreviousData, refetchInterval: 60_000 })

  const resolveAll = useMutation({
    mutationFn: errorService.resolveAll,
    onSuccess: (r) => {
      toast.success(`Resolved ${r.resolved} error${r.resolved === 1 ? '' : 's'}`)
      setConfirmAll(false)
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const testAlert = useMutation({
    mutationFn: errorService.testAlert,
    onSuccess: () => {
      toast.success('Test alert sent', { description: 'Check your notifications (and your phone, if notifications are on).' })
      refresh()
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (me?.is_staff && needsTwoFactor(me)) return <TwoFactorGate />
  if (!isAdmin) {
    return (
      <div className="card">
        <EmptyState icon={ShieldCheck} title="Admins only" description="This page is available to administrator accounts." />
      </div>
    )
  }

  const s = summary.data
  const tiles = [
    { label: 'Open errors', value: s?.open, alert: Boolean(s?.open) },
    { label: 'Seen in last 24 hours', value: s?.seen_last_24h },
    { label: 'Occurrences (open)', value: s?.occurrences_open },
    { label: 'Last error', value: s ? (s.last_error_at ? timeAgo(s.last_error_at) : 'Never') : undefined },
  ]
  const results = list.data?.results ?? []
  const highlighted = Number(filters.error) || null

  return (
    <div>
      <PageHeader
        title="System"
        description="Errors from the server and from people’s browsers. Admins get a notification when a new error appears."
        actions={
          <Button variant="secondary" onClick={() => testAlert.mutate()} loading={testAlert.isPending}>
            <BellRing /> Send test alert
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="card p-4">
            <p className="text-xs text-ink-500">{t.label}</p>
            <p className={cn('tabular mt-1 text-2xl font-semibold', t.alert ? 'text-brand-700' : 'text-ink-900')}>{t.value ?? '–'}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 sm:px-4">
          <div className="w-36"><Select value={filters.status} onChange={(e) => update({ status: e.target.value, error: '' })} aria-label="Status">
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </Select></div>
          <div className="w-36"><Select value={filters.source} onChange={(e) => update({ source: e.target.value, error: '' })} aria-label="Source">
            <option value="">All sources</option>
            <option value="server">Server</option>
            <option value="browser">Browser</option>
          </Select></div>
          <div className="flex-1" />
          {filters.status !== 'resolved' && Boolean(s?.open) && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmAll(true)}>
              <CheckCheck /> Resolve all
            </Button>
          )}
        </div>

        {list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : list.isLoading ? (
          <ListSkeleton rows={4} />
        ) : results.length === 0 ? (
          <EmptyState icon={CircleCheck} title={filters.status === 'open' ? 'No open errors' : 'Nothing here'} description={filters.status === 'open' ? 'Everything is running normally.' : 'Try a different filter.'} />
        ) : (
          <ul className={cn('divide-y divide-line', list.isFetching && 'opacity-70')}>
            {results.map((event) => <ErrorRow key={event.id} event={event} initiallyOpen={event.id === highlighted} />)}
          </ul>
        )}
        {list.data && list.data.total_pages > 1 && (
          <Pagination page={list.data.page} totalPages={list.data.total_pages} count={list.data.count} pageSize={PAGE_SIZE} onPageChange={(p) => update({ page: String(p) }, { resetPage: false })} />
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-500">
        Only technical details are kept: error type, message, page and stack trace. Emails and phone numbers in messages are masked. Uptime and reminder checks run every 30 minutes from GitHub Actions; a failed check emails the repository owner.
      </p>

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        title="Resolve all open errors?"
        description="If an error happens again, it reopens and you get a new alert."
        confirmLabel="Resolve all"
        loading={resolveAll.isPending}
        onConfirm={() => resolveAll.mutate()}
      />
    </div>
  )
}
