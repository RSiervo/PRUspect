import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { KeyRound, Search, ShieldCheck, UserCheck, UserX, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Avatar, Pagination } from '@/components/data-display/common'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/data-display/states'
import { FilterPanel, FilterToggleButton, useFilterToggle } from '@/components/forms/FilterToggle'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input, Select } from '@/components/ui/input'
import { Badge } from '@/components/ui/misc'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDebouncedValue, useQueryState } from '@/hooks'
import { errorMessage } from '@/lib/api'
import { formatDateTime, timeAgo } from '@/lib/datetime'
import { queryClient } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { adminService } from '@/services'
import type { AdminUser } from '@/types/api'

const DEFAULTS = { search: '', status: '', method: '', ordering: 'joined', page: '1' }
const PAGE_SIZE = 25

function Methods({ user }: { user: AdminUser }) {
  return (
    <div className="flex flex-wrap gap-1">
      {user.sign_in_methods.includes('google') && <Badge className="h-5 bg-sky-50 text-[11px] text-sky-800 ring-sky-200">Google</Badge>}
      {user.sign_in_methods.includes('password') && (
        <Badge className="h-5 bg-ink-100 text-[11px] text-ink-700 ring-ink-200">
          <KeyRound className="size-3" aria-hidden /> Password
        </Badge>
      )}
      {user.sign_in_methods.length === 0 && <span className="text-xs text-ink-400">None</span>}
    </div>
  )
}

function StatusBadge({ user }: { user: AdminUser }) {
  return user.is_active ? (
    <Badge className="h-5 bg-emerald-50 text-[11px] text-emerald-800 ring-emerald-200">Active</Badge>
  ) : (
    <Badge className="h-5 bg-ink-500 text-[11px] text-white ring-ink-500">Deactivated</Badge>
  )
}

function ActionButton({ user, onAsk }: { user: AdminUser; onAsk: (user: AdminUser) => void }) {
  if (user.is_self) return <span className="text-xs text-ink-400">You</span>
  return user.is_active ? (
    <Button variant="ghost" size="sm" className="text-brand-700" onClick={() => onAsk(user)}>
      <UserX /> Deactivate
    </Button>
  ) : (
    <Button variant="secondary" size="sm" onClick={() => onAsk(user)}>
      <UserCheck /> Reactivate
    </Button>
  )
}

export function AdminUsersPage() {
  const { user: me } = useAuth()
  const [filters, update] = useQueryState(DEFAULTS)
  const [term, setTerm] = useState(filters.search)
  const debounced = useDebouncedValue(term, 300)
  const [target, setTarget] = useState<AdminUser | null>(null)
  const panel = useFilterToggle()

  useEffect(() => {
    if (debounced !== filters.search) update({ search: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const isAdmin = Boolean(me?.is_staff)
  const params = { search: filters.search, status: filters.status, method: filters.method, ordering: filters.ordering, page: Number(filters.page) || 1, page_size: PAGE_SIZE }
  const summary = useQuery({ queryKey: ['admin-users', 'summary'], queryFn: adminService.summary, enabled: isAdmin })
  const list = useQuery({
    queryKey: ['admin-users', 'list', params],
    queryFn: () => adminService.users(params),
    enabled: isAdmin,
    placeholderData: keepPreviousData,
  })

  const toggle = useMutation({
    mutationFn: (user: AdminUser) => (user.is_active ? adminService.deactivate(user.id) : adminService.reactivate(user.id)),
    onSuccess: (user) => {
      toast.success(user.is_active ? `${user.email} reactivated` : `${user.email} deactivated`, {
        description: user.is_active ? 'They can sign in again.' : 'They were signed out and can no longer sign in.',
      })
      setTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (!isAdmin) {
    return (
      <div className="card">
        <EmptyState icon={ShieldCheck} title="Admins only" description="This page is available to administrator accounts." />
      </div>
    )
  }

  const s = summary.data
  const tiles = [
    { label: 'Total accounts', value: s?.total },
    { label: 'New this week', value: s?.new_this_week },
    { label: 'Signed in this week', value: s?.signed_in_this_week },
    { label: 'Using Google', value: s?.google },
    { label: 'Deactivated', value: s?.inactive },
  ]
  const results = list.data?.results ?? []

  return (
    <div>
      <PageHeader title="Users" description="Who has an account and how they use PRUspect. Prospect details stay private to each user — only counts are shown." />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="card p-4">
            <p className="text-xs text-ink-500">{t.label}</p>
            <p className="tabular mt-1 text-2xl font-semibold text-ink-900">{t.value ?? '–'}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:px-4 md:flex-row md:items-center">
          <div className="flex items-center gap-2 md:flex-1">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
              <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search name or email" className="pl-10" aria-label="Search users" />
            </div>
            <FilterToggleButton open={panel.open} onToggle={panel.toggle} activeCount={[filters.status, filters.method].filter(Boolean).length} controls="user-filters" />
          </div>
          <FilterPanel id="user-filters" open={panel.open} className="flex-col gap-2 md:flex-row">
          <div className="md:w-40"><Select value={filters.status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </Select></div>
          <div className="md:w-44"><Select value={filters.method} onChange={(e) => update({ method: e.target.value })} aria-label="Sign-in method">
            <option value="">All sign-in methods</option>
            <option value="google">Google</option>
            <option value="password">Password only</option>
          </Select></div>
          <div className="md:w-48"><Select value={filters.ordering} onChange={(e) => update({ ordering: e.target.value })} aria-label="Sort by">
            <option value="joined">Newest accounts</option>
            <option value="-joined">Oldest accounts</option>
            <option value="last_login">Recently signed in</option>
            <option value="prospects">Most prospects</option>
            <option value="email">Email A–Z</option>
          </Select></div>
          </FilterPanel>
        </div>

        {list.error ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : list.isLoading ? (
          <ListSkeleton rows={6} />
        ) : results.length === 0 ? (
          <EmptyState icon={Users} title="No users match" description="Try a different search or filter." />
        ) : (
          <>
            {/* Desktop table */}
            <div className={cn('relative hidden overflow-x-auto md:block', list.isFetching && 'opacity-70')}>
              <table className="w-full text-sm">
                <thead className="bg-ink-50/70 text-left text-xs font-medium text-ink-500">
                  <tr>
                    <th className="px-5 py-3">User</th>
                    <th className="px-3 py-3">Sign-in</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Joined</th>
                    <th className="px-3 py-3">Last sign-in</th>
                    <th className="px-3 py-3 text-right">Prospects</th>
                    <th className="px-3 py-3 text-right">Open follow-ups</th>
                    <th className="px-3 py-3">Manager</th>
                    <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {results.map((u) => (
                    <tr key={u.id} className={cn(!u.is_active && 'bg-ink-50/50')}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.full_name || u.email} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink-900">
                              {u.full_name || '—'}
                              {u.is_staff && <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">Admin</span>}
                            </p>
                            <p className="truncate text-xs text-ink-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><Methods user={u} /></td>
                      <td className="px-3 py-3"><StatusBadge user={u} /></td>
                      <td className="px-3 py-3 whitespace-nowrap text-ink-600" title={formatDateTime(u.date_joined)}>{timeAgo(u.date_joined)}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-ink-600" title={u.last_login ? formatDateTime(u.last_login) : undefined}>{timeAgo(u.last_login)}</td>
                      <td className="tabular px-3 py-3 text-right text-ink-900">{u.prospect_count}</td>
                      <td className="tabular px-3 py-3 text-right text-ink-900">{u.open_follow_up_count}</td>
                      <td className="px-3 py-3"><ManagerSelect user={u} /></td>
                      <td className="px-5 py-3 text-right"><ActionButton user={u} onAsk={setTarget} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Phone cards */}
            <ul className="divide-y divide-line md:hidden">
              {results.map((u) => (
                <li key={u.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.full_name || u.email} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink-900">{u.full_name || u.email}{u.is_staff && ' · Admin'}</p>
                      <p className="truncate text-xs text-ink-500">{u.email}</p>
                    </div>
                    <StatusBadge user={u} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                    <Methods user={u} />
                    <span>Joined {timeAgo(u.date_joined)}</span>
                    <span>Last sign-in {timeAgo(u.last_login)}</span>
                    <span>{u.prospect_count} prospects</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-ink-500">Manager: <div className="w-48"><ManagerSelect user={u} /></div></div>
                  <div className="flex justify-end"><ActionButton user={u} onAsk={setTarget} /></div>
                </li>
              ))}
            </ul>
          </>
        )}
        {list.data && (
          <Pagination page={list.data.page} totalPages={list.data.total_pages} count={list.data.count} pageSize={PAGE_SIZE} onPageChange={(p) => update({ page: String(p) }, { resetPage: false })} />
        )}
      </div>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target?.is_active ? `Deactivate ${target.email}?` : `Reactivate ${target?.email}?`}
        description={
          target?.is_active
            ? 'They are signed out immediately and can’t sign in — with Google or a password — until reactivated. Their prospects are kept, not deleted.'
            : 'They will be able to sign in again and see their prospects.'
        }
        confirmLabel={target?.is_active ? 'Deactivate' : 'Reactivate'}
        tone={target?.is_active ? 'danger' : 'default'}
        loading={toggle.isPending}
        onConfirm={() => target && toggle.mutate(target)}
      />
    </div>
  )
}

function ManagerSelect({ user }: { user: AdminUser }) {
  const everyone = useQuery({ queryKey: ['admin-users', 'all'], queryFn: () => adminService.users({ page_size: 100, status: 'active', ordering: 'email' }) })
  const save = useMutation({
    mutationFn: (managerId: number | null) => adminService.setManager(user.id, managerId),
    onSuccess: (u) => {
      toast.success(u.manager ? `${u.email} now reports to ${u.manager.full_name}` : `${u.email} has no manager`)
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const options = (everyone.data?.results ?? []).filter((o) => o.id !== user.id)
  return (
    <Select
      aria-label={`Manager for ${user.email}`}
      value={user.manager?.id ?? ''}
      disabled={save.isPending || !user.is_active}
      onChange={(e) => save.mutate(e.target.value ? Number(e.target.value) : null)}
      className="h-8 text-xs md:h-8"
    >
      <option value="">No manager</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.full_name || o.email}
        </option>
      ))}
    </Select>
  )
}
