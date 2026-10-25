import { ClipboardCheck, Home, Menu, Plus, Search, Users, X } from 'lucide-react'
import { Dialog as D } from 'radix-ui'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'

import { useLocalPreference } from '@/hooks'
import { cn } from '@/lib/utils'
import { QuickActionsProvider } from '@/features/quick-actions/QuickActions'

import { Logo } from './Logo'
import { navItemsFor } from './nav'
import { useAuth } from '@/features/auth/AuthProvider'
import { Sidebar, useFollowUpBadge } from './Sidebar'
import { GlobalSearch, NotificationBell, UserMenu } from './Topbar'

type BottomItem = { to: string; label: string; icon: typeof Home; match: (path: string) => boolean }

// Phone bar: two items, the raised "add prospect" button, two items.
const BOTTOM_LEFT: BottomItem[] = [
  { to: '/', label: 'Home', icon: Home, match: (p) => p === '/' },
  { to: '/prospects', label: 'Prospects', icon: Users, match: (p) => p.startsWith('/prospects') && p !== '/prospects/new' },
]
const BOTTOM_RIGHT: BottomItem[] = [
  { to: '/follow-ups', label: 'Follow-ups', icon: ClipboardCheck, match: (p) => p.startsWith('/follow-ups') },
]
const NEW_PROSPECT = '/prospects/new'

export function AppLayout() {
  const [collapsed, setCollapsed] = useLocalPreference<boolean>('sidebar-collapsed', false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mobileSearch, setMobileSearch] = useState(false)
  const location = useLocation()
  const badge = useFollowUpBadge()
  const { user } = useAuth()
  const navItems = navItemsFor(Boolean(user?.is_staff))
  // "More" lights up for sections that live in the drawer (Calendar, Reports, Settings…).
  const moreActive =
    location.pathname !== NEW_PROSPECT && ![...BOTTOM_LEFT, ...BOTTOM_RIGHT].some((item) => item.match(location.pathname))

  useEffect(() => {
    setDrawerOpen(false)
    setMobileSearch(false)
  }, [location.pathname])

  return (
    <QuickActionsProvider>
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop / tablet top bar */}
          <header className="sticky top-0 z-30 hidden h-14 items-center gap-4 border-b border-line bg-white/90 px-6 backdrop-blur-md md:flex">
            <button
              type="button"
              className="-ml-2 rounded-lg p-2 text-ink-500 hover:bg-ink-100 lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </button>
            <GlobalSearch className="w-full max-w-sm" />
            <div className="ml-auto flex items-center gap-2">
              <NotificationBell />
              <span className="mx-1 h-6 w-px bg-line" aria-hidden />
              <UserMenu />
            </div>
          </header>

          {/* Phone header */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-white/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
            <Logo subtitle="" className="[&_svg]:size-8" />
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMobileSearch((v) => !v)}
                className="grid size-10 place-items-center rounded-full text-ink-500 hover:bg-ink-100"
                aria-label={mobileSearch ? 'Close search' : 'Search prospects'}
                aria-expanded={mobileSearch}
              >
                {mobileSearch ? <X className="size-[18px]" /> : <Search className="size-[18px]" />}
              </button>
              <NotificationBell />
              <UserMenu compact />
            </div>
          </header>
          {mobileSearch && (
            <div className="sticky top-14 z-20 border-b border-line bg-white px-4 py-2.5 md:hidden">
              <GlobalSearch autoFocus />
            </div>
          )}

          <main id="main" className="mx-auto w-full max-w-[1360px] flex-1 px-4 pt-4 pb-28 sm:px-6 md:pb-10 lg:px-7 lg:pt-6">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Phone bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        aria-label="Primary"
      >
        <ul className="grid h-16 grid-cols-5 items-center">
          {BOTTOM_LEFT.map((item) => (
            <li key={item.to}>
              <BottomLink item={item} active={item.match(location.pathname)} />
            </li>
          ))}
          <li className="flex justify-center">
            <Link
              to={NEW_PROSPECT}
              aria-label="Add prospect"
              aria-current={location.pathname === NEW_PROSPECT ? 'page' : undefined}
              className={cn(
                '-mt-7 grid size-14 place-items-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-900/25 ring-4 ring-white transition-transform active:scale-95',
                location.pathname === NEW_PROSPECT && 'bg-brand-700',
              )}
            >
              <Plus className="size-6" strokeWidth={2.4} aria-hidden />
            </Link>
          </li>
          {BOTTOM_RIGHT.map((item) => (
            <li key={item.to}>
              <BottomLink item={item} active={item.match(location.pathname)} badge={badge} />
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className={cn(
                'flex h-16 w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium',
                moreActive ? 'text-brand-600' : 'text-ink-500',
              )}
              aria-label="More navigation"
            >
              <Menu className="size-5" aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>

      {/* Navigation drawer (phones and tablets) */}
      <D.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 bg-ink-900/40 data-[state=open]:animate-[fade-in_150ms_ease-out] lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(84vw,300px)] flex-col bg-white shadow-[var(--shadow-pop)] outline-none data-[state=open]:animate-[drawer-in_200ms_cubic-bezier(0.16,1,0.3,1)] lg:hidden">
            <div className="flex h-16 items-center justify-between px-5">
              <Logo />
              <D.Close className="rounded-lg p-2 text-ink-400 hover:bg-ink-100" aria-label="Close navigation">
                <X className="size-5" />
              </D.Close>
            </div>
            <D.Title className="sr-only">Navigation</D.Title>
            <D.Description className="sr-only">All sections of PRUspect</D.Description>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
              {navItems.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium',
                        isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-100',
                      )
                    }
                  >
                    <Icon className="size-[18px]" aria-hidden />
                    {item.label}
                  </NavLink>
                )
              })}
            </nav>
          </D.Content>
        </D.Portal>
      </D.Root>
    </QuickActionsProvider>
  )
}

function BottomLink({ item, active, badge = 0 }: { item: BottomItem; active: boolean; badge?: number }) {
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={cn('relative flex h-16 flex-col items-center justify-center gap-1 text-[10.5px] font-medium', active ? 'text-brand-600' : 'text-ink-500')}
    >
      <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
      {item.label}
      {badge > 0 && (
        <span className="tabular absolute top-2 left-1/2 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] text-white ring-2 ring-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  )
}
