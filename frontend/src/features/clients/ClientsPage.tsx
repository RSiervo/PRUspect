import { useMutation, useQuery } from '@tanstack/react-query'
import { Award, Cake, CalendarPlus, Handshake, HeartHandshake, Search, Send, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Avatar } from '@/components/data-display/common'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/data-display/states'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, Segmented } from '@/components/ui/misc'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { useDebouncedValue } from '@/hooks'
import { errorMessage } from '@/lib/api'
import { formatDate } from '@/lib/datetime'
import { invalidateCrm } from '@/lib/queryKeys'
import { cn, formatMoney } from '@/lib/utils'
import { clientService, opportunityService } from '@/services'
import type { ClientEvent, ClientEventType } from '@/types/api'

const EVENT_META: Record<ClientEventType, { label: string; icon: typeof Cake; tint: string }> = {
  birthday: { label: 'Birthday', icon: Cake, tint: 'bg-pink-50 text-pink-700' },
  anniversary: { label: 'Policy anniversary', icon: Award, tint: 'bg-violet-50 text-violet-700' },
  premium_due: { label: 'Premium due', icon: Wallet, tint: 'bg-amber-50 text-amber-700' },
  referral_ask: { label: 'Ask for referrals', icon: Handshake, tint: 'bg-emerald-50 text-emerald-700' },
}

function when(event: ClientEvent) {
  if (event.days_until < 0) return `Overdue · ${formatDate(event.date, 'MMM d')}`
  if (event.days_until === 0) return 'Today'
  if (event.days_until === 1) return 'Tomorrow'
  return `In ${event.days_until} days · ${formatDate(event.date, 'EEE, MMM d')}`
}

function EventRow({ event, highlight }: { event: ClientEvent; highlight: boolean }) {
  const { composeMessage, scheduleFollowUp } = useQuickActions()
  const meta = EVENT_META[event.type]
  const Icon = meta.icon
  const p = event.prospect
  const paid = useMutation({
    mutationFn: () => opportunityService.premiumPaid(event.opportunity!.id),
    onSuccess: (opp) => {
      toast.success('Premium marked paid', { description: `Next due ${formatDate(opp.next_premium_due_date)}` })
      invalidateCrm()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const asked = useMutation({
    mutationFn: () => clientService.referralAsked(p.id),
    onSuccess: () => {
      toast.success('Noted', { description: `We’ll remind you again in about 6 months.` })
      invalidateCrm()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <li className={cn('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5', highlight && 'bg-brand-50/50')}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', meta.tint)}>
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink-900">
            {meta.label} · <Link to={`/prospects/${p.id}`} className="hover:text-brand-700">{p.full_name}</Link>
          </p>
          <p className={cn('truncate text-xs', event.overdue ? 'font-medium text-amber-700' : 'text-ink-500')}>
            {when(event)} · {event.detail}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-1 pl-12 sm:pl-0">
        {(p.mobile || p.email) && (
          <Button variant="ghost" size="sm" onClick={() => composeMessage({ ...p })}>
            <Send /> Message
          </Button>
        )}
        {event.type === 'premium_due' && event.opportunity && (
          <Button variant="secondary" size="sm" onClick={() => paid.mutate()} loading={paid.isPending}>
            Mark paid
          </Button>
        )}
        {event.type === 'referral_ask' ? (
          <Button variant="secondary" size="sm" onClick={() => asked.mutate()} loading={asked.isPending}>
            Mark asked
          </Button>
        ) : (
          <Button variant="ghost" size="icon-sm" onClick={() => scheduleFollowUp({ prospect: { id: p.id, full_name: p.full_name } })} aria-label={`Schedule follow-up with ${p.full_name}`}>
            <CalendarPlus />
          </Button>
        )}
      </div>
    </li>
  )
}

export function ClientsPage() {
  const [params] = useSearchParams()
  const focus = Number(params.get('focus')) || null
  const [days, setDays] = useState<'7' | '30' | '90'>('30')
  const [term, setTerm] = useState('')
  const search = useDebouncedValue(term.trim(), 300)
  const upcoming = useQuery({ queryKey: ['clients', 'upcoming', days], queryFn: () => clientService.upcoming(Number(days)) })
  const list = useQuery({ queryKey: ['clients', 'list', search], queryFn: () => clientService.list(search) })

  useEffect(() => {
    if (focus) document.getElementById(`client-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [focus, list.data])

  return (
    <div>
      <PageHeader title="Clients" description="People with an issued policy — keep in touch on the dates that matter." />

      <Card className="mb-4">
        <CardHeader
          title="Upcoming"
          description="Birthdays, policy anniversaries, premium due dates and referral asks."
          action={<Segmented label="Time range" value={days} onChange={setDays} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />}
          className="flex-col sm:flex-row"
        />
        <div className="pt-2 pb-2">
          {upcoming.error ? (
            <ErrorState error={upcoming.error} onRetry={upcoming.refetch} />
          ) : upcoming.isLoading ? (
            <ListSkeleton rows={3} />
          ) : !upcoming.data?.events.length ? (
            <EmptyState compact icon={HeartHandshake} title={`Nothing in the next ${days} days`} description="Add birth dates and premium schedules to your clients to get reminders." />
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.data.events.map((e) => (
                <EventRow key={`${e.type}-${e.opportunity?.id ?? e.prospect.id}-${e.date}`} event={e} highlight={e.prospect.id === focus} />
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line p-3 sm:px-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search clients" className="pl-10" aria-label="Search clients" />
          </div>
        </div>
        {list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : list.isLoading ? (
          <ListSkeleton rows={4} />
        ) : !list.data?.results.length ? (
          <EmptyState icon={HeartHandshake} title={search ? 'No clients match' : 'No clients yet'} description="When a prospect reaches Policy Issued — Won, they appear here." />
        ) : (
          <ul className="divide-y divide-line">
            {list.data.results.map((c) => (
              <li key={c.id} id={`client-${c.id}`} className={cn('grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[1.4fr_repeat(4,1fr)] sm:items-center sm:px-5', c.id === focus && 'bg-brand-50/50')}>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={c.full_name} />
                  <div className="min-w-0">
                    <Link to={`/prospects/${c.id}?tab=opportunities`} className="block truncate text-[13px] font-medium text-ink-900 hover:text-brand-700">
                      {c.full_name}
                    </Link>
                    <p className="truncate text-xs text-ink-500">Client since {formatDate(c.client_since)}</p>
                  </div>
                </div>
                <p className="text-xs text-ink-500 sm:text-[13px]"><span className="sm:hidden">Policies: </span><span className="text-ink-900">{c.policies}</span> polic{c.policies === 1 ? 'y' : 'ies'}</p>
                <p className="tabular text-xs text-ink-500 sm:text-[13px]"><span className="sm:hidden">Premium: </span><span className="text-ink-900">{formatMoney(c.annualized_premium)}</span>/yr</p>
                <p className="text-xs text-ink-500 sm:text-[13px]">Next premium: <span className="text-ink-900">{formatDate(c.next_premium_due_date)}</span></p>
                <p className="text-xs text-ink-500 sm:text-[13px]">Birthday: <span className="text-ink-900">{c.next_birthday ? formatDate(c.next_birthday, 'MMM d') : '—'}</span></p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
