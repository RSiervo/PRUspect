import { CalendarDays, ClipboardCheck, Home, Menu, Users, X } from 'lucide-react'
import { Dialog as D } from 'radix-ui'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

import { useLocalPreference } from '@/hooks'
import { cn } from '@/lib/utils'
import { QuickActionsProvider } from '@/features/quick-actions/QuickActions'

import { Logo } from './Logo'
import { NAV_ITEMS } from './nav'
import { Sidebar, useFollowUpBadge } from './Sidebar'
import { GlobalSearch, NotificationBell, UserMenu } from './Topbar'

const BOTTOM_NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/prospects', label: 'Prospects', icon: Users },
  { to: '/follow-ups', label: 'Follow-ups', icon: ClipboardCheck },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
]

export function AppLayout() {
  const [collapsed, setCollapsed] = useLocalPreference<boolean>('sidebar-collapsed', false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const badge = useFollowUpBadge()

  useEffect(() => setDrawerOpen(false), [location.pathname])

  return (
    <QuickActionsProvider>
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <div className="flex min-h-dvh">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Desktop / tablet top bar */}
          <header className="sticky top-0 z-30 hidden h-16 items-center gap-4 border-b border-line bg-white/85 px-6 backdrop-blur-md md:flex">
            <button
              type="button"
              className="-ml-2 rounded-lg p-2 text-ink-500 hover:bg-ink-100 lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </button>
            <GlobalSearch className="w-full max-w-md" />
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
              <NotificationBell />
              <UserMenu compact />
            </div>
          </header>
          <div className="border-b border-line bg-white px-4 py-2.5 md:hidden">
            <GlobalSearch />
          </div>

          <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 pt-5 pb-28 sm:px-6 md:pb-10 lg:px-8 lg:pt-7">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Phone bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        aria-label="Primary"
      >
        <ul className="grid grid-cols-5">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn('relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-brand-600' : 'text-ink-500')
                  }
                >
                  <Icon className="size-5" aria-hidden />
                  {item.label}
                  {item.to === '/follow-ups' && badge > 0 && (
                    <span className="tabular absolute top-2 left-1/2 ml-2 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] text-white">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </NavLink>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-500"
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
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'flex h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium',
                        isActive ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-ink-100',
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
