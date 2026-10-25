import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { NavLink } from 'react-router'

import { Tooltip } from '@/components/ui/menu'
import { useAuth } from '@/features/auth/AuthProvider'
import { qk } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { followUpService } from '@/services'

import { Logo, LogoMark, Mountains } from './Logo'
import { navItemsFor, type NavItem } from './nav'

export function useFollowUpBadge() {
  const { data } = useQuery({ queryKey: qk.followUpSummary, queryFn: followUpService.summary, refetchInterval: 120_000 })
  return data ? data.overdue + data.today : 0
}

const EXPANDED = 232
const COLLAPSED = 68

function SidebarLink({ item, collapsed, count }: { item: NavItem; collapsed: boolean; count: number }) {
  const Icon = item.icon
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex h-9 items-center gap-3 rounded-lg text-[13px] font-medium transition-colors',
          collapsed ? 'mx-auto w-10 justify-center' : 'px-2.5',
          isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-100/70 hover:text-ink-900',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && <span className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-brand-600" aria-hidden />}
          <Icon className={cn('size-[17px] shrink-0', isActive ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-600')} aria-hidden />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {count > 0 && (
            <span
              className={cn(
                'tabular grid place-items-center rounded-full bg-brand-600 font-semibold text-white',
                collapsed ? 'absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] ring-2 ring-white' : 'ml-auto h-[18px] min-w-[18px] px-1.5 text-[10.5px]',
              )}
              aria-label={`${count} due or overdue`}
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
  // Wrap in a div: the tooltip trigger must not replace NavLink's className function.
  return collapsed ? (
    <Tooltip content={item.label}>
      <div>{link}</div>
    </Tooltip>
  ) : (
    link
  )
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const reduce = useReducedMotion()
  const badge = useFollowUpBadge()
  const { user } = useAuth()
  const items = navItemsFor(Boolean(user?.is_staff), (user?.team_size ?? 0) > 0)
  const main = items.filter((i) => !i.staffOnly && !i.teamOnly && i.to !== '/settings')
  const secondary = items.filter((i) => i.staffOnly || i.teamOnly || i.to === '/settings')

  return (
    <motion.aside
      className="sticky top-0 z-40 hidden h-dvh shrink-0 flex-col border-r border-line bg-white lg:flex"
      animate={{ width: collapsed ? COLLAPSED : EXPANDED }}
      initial={false}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 40 }}
      aria-label="Main navigation"
    >
      <div className={cn('flex h-14 shrink-0 items-center border-b border-line/70', collapsed ? 'justify-center' : 'px-4')}>
        {collapsed ? <LogoMark className="size-8" /> : <Logo className="[&_svg]:size-8" />}
      </div>

      {/* Edge toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="absolute top-[18px] -right-3 z-10 grid size-6 place-items-center rounded-full border border-line bg-white text-ink-500 shadow-sm transition hover:border-ink-300 hover:text-ink-900"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
      >
        <ChevronLeft className={cn('size-3.5 transition-transform', collapsed && 'rotate-180')} />
      </button>

      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="space-y-0.5">
          {main.map((item) => (
            <SidebarLink key={item.to} item={item} collapsed={collapsed} count={item.badge === 'follow-ups' ? badge : 0} />
          ))}
        </div>
        <div className={cn('mt-4 space-y-0.5 border-t border-line/70 pt-3', collapsed && 'mx-1')}>
          {secondary.map((item) => (
            <SidebarLink key={item.to} item={item} collapsed={collapsed} count={0} />
          ))}
        </div>

        {!collapsed && (
          <div className="relative mt-auto overflow-hidden rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 px-3.5 pt-3 pb-9 text-white">
            <p className="relative z-10 text-[11.5px] leading-snug font-semibold">
              More conversations. More protection.
              <span className="block font-normal text-white/80">A brighter tomorrow.</span>
            </p>
            <Mountains className="absolute inset-x-0 bottom-0 h-10 w-full" />
          </div>
        )}
      </nav>
    </motion.aside>
  )
}
