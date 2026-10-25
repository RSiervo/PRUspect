import { useQuery } from '@tanstack/react-query'
import { Lock, UsersRound } from 'lucide-react'

import { Avatar } from '@/components/data-display/common'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/data-display/states'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/misc'
import { ApiError } from '@/lib/api'
import { timeAgo } from '@/lib/datetime'
import { cn, formatCompactMoney, formatPercent } from '@/lib/utils'
import { teamService } from '@/services'

const COLUMNS = [
  { key: 'prospects', label: 'Prospects' },
  { key: 'new_this_month', label: 'New this month' },
  { key: 'follow_ups_today', label: 'Due today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'appointments_week', label: 'Appts this week' },
  { key: 'policies_this_month', label: 'Policies (month)' },
] as const

/** Manager view: each team member's totals — never their prospects' details. */
export function TeamPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['team'], queryFn: teamService.get, retry: false })
  if (error instanceof ApiError && error.status === 403) {
    return (
      <div className="card">
        <EmptyState icon={UsersRound} title="No team yet" description="When an administrator assigns advisors to you, their totals appear here." />
      </div>
    )
  }
  return (
    <div>
      <PageHeader title="Team" description="How your advisors are doing this month." />
      <p className="mb-4 flex items-center gap-2 text-xs text-ink-500">
        <Lock className="size-3.5" aria-hidden /> Totals only — each advisor’s prospects stay private to them.
      </p>
      {error ? (
        <div className="card"><ErrorState error={error} onRetry={refetch} /></div>
      ) : isLoading || !data ? (
        <div className="card"><ListSkeleton rows={4} /></div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {COLUMNS.map((c) => (
              <div key={c.key} className="card p-4">
                <p className="text-xs text-ink-500">{c.label}</p>
                <p className={cn('tabular mt-1 text-2xl font-semibold', c.key === 'overdue' && data.totals.overdue ? 'text-amber-700' : 'text-ink-900')}>{data.totals[c.key]}</p>
              </div>
            ))}
          </div>
          <Card className="overflow-hidden">
            <div className="relative hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-ink-50/70 text-left text-xs font-medium text-ink-500">
                  <tr>
                    <th className="px-5 py-2.5">Advisor</th>
                    {COLUMNS.map((c) => <th key={c.key} className="px-3 py-2.5 text-right">{c.label}</th>)}
                    <th className="px-3 py-2.5 text-right">Issued premium</th>
                    <th className="px-3 py-2.5 text-right">Conversion</th>
                    <th className="px-5 py-2.5">Last sign-in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.members.map((m) => (
                    <tr key={m.id}>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={m.full_name || m.email} className="size-8" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink-900">{m.full_name || m.email}</p>
                            <p className="truncate text-xs text-ink-500">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className={cn('tabular px-3 py-2.5 text-right', c.key === 'overdue' && m.overdue ? 'font-medium text-amber-700' : 'text-ink-900')}>{m[c.key]}</td>
                      ))}
                      <td className="tabular px-3 py-2.5 text-right">{formatCompactMoney(m.issued_premium_this_month)}</td>
                      <td className="tabular px-3 py-2.5 text-right">{formatPercent(m.conversion_rate)}</td>
                      <td className="px-5 py-2.5 text-ink-600">{timeAgo(m.last_login)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {data.members.map((m) => (
                <li key={m.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.full_name || m.email} className="size-8" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink-900">{m.full_name || m.email}</p>
                      <p className="text-xs text-ink-500">Last sign-in {timeAgo(m.last_login)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {COLUMNS.map((c) => (
                      <div key={c.key} className="rounded-lg bg-ink-50 py-1.5">
                        <p className={cn('tabular text-sm font-semibold', c.key === 'overdue' && m.overdue ? 'text-amber-700' : 'text-ink-900')}>{m[c.key]}</p>
                        <p className="text-[10.5px] text-ink-500">{c.label}</p>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
