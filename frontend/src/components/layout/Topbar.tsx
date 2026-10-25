import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, CheckCheck, ChevronDown, LogOut, Search, Settings as SettingsIcon, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { StatusBadge } from '@/components/data-display/badges'
import { Avatar } from '@/components/data-display/common'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/menu'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDebouncedValue } from '@/hooks'
import { timeAgo } from '@/lib/datetime'
import { qk } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { notificationService, prospectService } from '@/services'

export function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const debounced = useDebouncedValue(term.trim(), 250)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: ({ signal }) => prospectService.list({ search: debounced, page_size: 6, archived: 'all' }, signal),
    enabled: debounced.length >= 2,
  })

  // "/" focuses search, like most productivity apps.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const goToList = () => {
    if (!term.trim()) return
    setOpen(false)
    navigate(`/prospects?search=${encodeURIComponent(term.trim())}`)
  }

  return (
    <Popover open={open && debounced.length >= 2} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <form
          role="search"
          className={cn('relative', className)}
          onSubmit={(event) => {
            event.preventDefault()
            goToList()
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => {
              setTerm(event.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search prospects, name, or phone…"
            aria-label="Search prospects"
            className="h-10 w-full rounded-full border border-line bg-ink-50/60 pr-10 pl-10 text-sm placeholder:text-ink-400 focus:border-brand-300 focus:bg-white focus:ring-4 focus:ring-brand-100 focus:outline-none"
          />
          <kbd className="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-line bg-white px-1.5 text-[10px] text-ink-400 sm:block">/</kbd>
        </form>
      </PopoverAnchor>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-72 p-1.5"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {isFetching && !data ? (
          <p className="px-3 py-3 text-sm text-ink-500">Searching…</p>
        ) : data && data.results.length > 0 ? (
          <ul>
            {data.results.map((prospect) => (
              <li key={prospect.id}>
                <Link
                  to={`/prospects/${prospect.id}`}
                  onClick={() => {
                    setOpen(false)
                    setTerm('')
                  }}
                  className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-ink-50"
                >
                  <Avatar name={prospect.full_name} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{prospect.full_name}</p>
                    <p className="truncate text-xs text-ink-500">{prospect.mobile || prospect.email}</p>
                  </div>
                  <StatusBadge status={prospect.status} short />
                </Link>
              </li>
            ))}
            <li>
              <button type="button" onClick={goToList} className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-brand-700 hover:bg-brand-50">
                See all results for “{term.trim()}”
              </button>
            </li>
          </ul>
        ) : (
          <p className="px-3 py-3 text-sm text-ink-500">No prospects match “{debounced}”.</p>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function NotificationBell() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: qk.notifications,
    queryFn: notificationService.list,
    refetchInterval: 60_000,
  })
  const unread = data?.unread_count ?? 0

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.notifications })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="!size-5" />
          {unread > 0 && (
            <span className="tabular absolute top-1 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,22rem)] p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold text-ink-900">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
              onClick={async () => {
                await notificationService.markAllRead()
                void refresh()
              }}
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!data || data.results.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <BellOff className="size-6 text-ink-300" aria-hidden />
              <p className="mt-2 text-sm text-ink-500">You’re all caught up.</p>
              <p className="mt-1 text-xs text-ink-400">Reminders for follow-ups appear here. Nothing is sent by email or SMS.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cn('flex w-full gap-3 px-4 py-3 text-left hover:bg-ink-50', !item.is_read && 'bg-brand-50/40')}
                    onClick={async () => {
                      if (!item.is_read) await notificationService.markRead(item.id)
                      void refresh()
                      if (item.link) navigate(item.link)
                    }}
                  >
                    <span
                      className={cn('mt-1.5 size-2 shrink-0 rounded-full', item.is_read ? 'bg-transparent' : item.kind === 'overdue' ? 'bg-amber-500' : 'bg-brand-600')}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink-900">{item.title}</span>
                      <span className="block text-xs text-ink-500">{item.body}</span>
                      <span className="mt-1 block text-[11px] text-ink-400">{timeAgo(item.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function UserMenu({ compact }: { compact?: boolean }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded-full py-1 pr-2 pl-1 transition-colors hover:bg-ink-100"
          aria-label="Account menu"
        >
          <Avatar name={user.full_name} className="size-9 bg-brand-100 text-brand-700" />
          {!compact && (
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-sm font-semibold text-ink-900">{user.full_name}</span>
              <span className="block text-xs text-ink-500">{user.job_title || 'Advisor'}</span>
            </span>
          )}
          {!compact && <ChevronDown className="hidden size-4 text-ink-400 md:block" aria-hidden />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => navigate('/settings?tab=profile')}>
          <UserRound /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <SettingsIcon /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          tone="danger"
          onSelect={async () => {
            await logout()
            navigate('/login', { replace: true })
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
