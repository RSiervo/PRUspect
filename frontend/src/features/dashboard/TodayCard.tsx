import { useQuery } from '@tanstack/react-query'
import { CalendarPlus, CheckCircle2, Phone, Send, Snowflake } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { PriorityBadge } from '@/components/data-display/badges'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/data-display/states'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, Segmented } from '@/components/ui/misc'
import { FollowUpItem, useFollowUpDialogs } from '@/features/follow-ups/FollowUpItem'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { timeAgo } from '@/lib/datetime'
import { qk } from '@/lib/queryKeys'
import { dashboardService } from '@/services'
import type { TodayProspect } from '@/types/api'

type Tab = 'agenda' | 'cold' | 'next'

function nameParts(full: string) {
  const [first = '', ...rest] = full.split(' ')
  return { first_name: first, last_name: rest.join(' ') }
}

function ProspectRow({ p, action }: { p: TodayProspect; action: 'call' | 'schedule' }) {
  const { trackContact, composeMessage, scheduleFollowUp } = useQuickActions()
  const contact = { id: p.id, full_name: p.full_name, ...nameParts(p.full_name), mobile: p.mobile, email: p.email }
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <Link to={`/prospects/${p.id}`} className="block truncate text-[13px] font-medium text-ink-900 hover:text-brand-700">
          {p.full_name}
        </Link>
        <p className="text-xs text-ink-500">Last contact {timeAgo(p.last_contacted_at).toLowerCase()}</p>
      </div>
      <PriorityBadge priority={p.priority} className="hidden h-5 text-[11px] sm:inline-flex" />
      {action === 'call' ? (
        <div className="flex gap-1">
          {p.mobile && (
            <Button variant="ghost" size="icon-sm" asChild>
              <a href={`tel:${p.mobile}`} onClick={() => trackContact(contact, 'call')} aria-label={`Call ${p.full_name}`}>
                <Phone />
              </a>
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => composeMessage(contact)} aria-label={`Message ${p.full_name}`}>
            <Send />
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => scheduleFollowUp({ prospect: { id: p.id, full_name: p.full_name } })}>
          <CalendarPlus /> Schedule
        </Button>
      )}
    </li>
  )
}

/** Daily worklist: today's agenda, prospects going cold, and prospects with no next step. */
export function TodayCard() {
  const [tab, setTab] = useState<Tab>('agenda')
  const { open, dialogs } = useFollowUpDialogs()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: [...qk.dashboard, 'today'], queryFn: dashboardService.today })

  return (
    <Card>
      <CardHeader
        title="Today"
        description={data ? `${data.agenda.length} scheduled · ${data.overdue_count} overdue` : 'Your worklist'}
        action={
          <Segmented
            label="Today list"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'agenda', label: 'Agenda' },
              { value: 'cold', label: `Going cold${data ? ` ${data.stale_count}` : ''}` },
              { value: 'next', label: `No next step${data ? ` ${data.no_next_step_count}` : ''}` },
            ]}
          />
        }
        className="flex-col sm:flex-row"
      />
      <div className="pt-2 pb-2">
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading || !data ? (
          <ListSkeleton rows={3} />
        ) : tab === 'agenda' ? (
          <>
            {data.agenda.length ? (
              <div className="divide-y divide-line">
                {data.agenda.map((f) => (
                  <FollowUpItem key={f.id} followUp={f} onAction={open} compact />
                ))}
              </div>
            ) : (
              <EmptyState compact icon={CheckCircle2} title="Nothing scheduled today" description="Check who’s going cold and plan a call." />
            )}
            {data.overdue_count > 0 && (
              <div className="mt-1 border-t border-line">
                <p className="flex items-center justify-between px-4 pt-3 pb-1 text-xs font-semibold text-amber-700 sm:px-5">
                  Overdue ({data.overdue_count})
                  <Link to="/follow-ups?bucket=overdue" className="font-medium text-ink-500 hover:text-brand-700">
                    View all
                  </Link>
                </p>
                <div className="divide-y divide-line">
                  {data.overdue.slice(0, 3).map((f) => (
                    <FollowUpItem key={f.id} followUp={f} onAction={open} compact />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : tab === 'cold' ? (
          data.stale.length ? (
            <ul className="divide-y divide-line">
              {data.stale.map((p) => (
                <ProspectRow key={p.id} p={p} action="call" />
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={Snowflake} title="No one is going cold" description={data.definitions.stale} />
          )
        ) : data.no_next_step.length ? (
          <ul className="divide-y divide-line">
            {data.no_next_step.map((p) => (
              <ProspectRow key={p.id} p={p} action="schedule" />
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={CheckCircle2} title="Every active prospect has a next step" />
        )}
      </div>
      {dialogs}
    </Card>
  )
}
