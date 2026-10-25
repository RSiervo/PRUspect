import { useQuery } from '@tanstack/react-query'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { NavLink } from 'react-router'

import { Tooltip } from '@/components/ui/menu'
import { qk } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { followUpService } from '@/services'

import { Logo, LogoMark, Mountains } from './Logo'
import { navItemsFor } from './nav'
import { useAuth } from '@/features/auth/AuthProvider'

export function useFollowUpBadge() {
  const { data } = useQuery({ queryKey: qk.followUpSummary, queryFn: followUpService.summary, refetchInterval: 120_000 })
  return data ? data.overdue + data.today : 0
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const reduce = useReducedMotion()
  const badge = useFollowUpBadge()
  const { user } = useAuth()
  const items = navItemsFor(Boolean(user?.is_staff))

  return (
    <motion.aside
      className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-white lg:flex"
      animate={{ width: collapsed ? 80 : 264 }}
      initial={false}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 38 }}
      aria-label="Main navigation"
    >
      <div className={cn('flex h-16 items-center px-5', collapsed && 'justify-center px-0')}>
        {collapsed ? <LogoMark /> : <Logo />}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {items.map((item) => {
          const Icon = item.icon
          const count = item.badge === 'follow-ups' ? badge : 0
          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                  collapsed && 'justify-center px-0',
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm shadow-brand-900/20'
                    : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('size-[18px] shrink-0', !isActive && 'text-ink-400 group-hover:text-ink-600')} aria-hidden />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {count > 0 && (
                    <span
                      className={cn(
                        'tabular grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold',
                        collapsed ? 'absolute top-1.5 right-2.5 h-4 min-w-4 px-1 text-[10px]' : 'ml-auto h-5',
                        isActive ? 'bg-white text-brand-700' : 'bg-brand-600 text-white',
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
          return collapsed ? (
            <Tooltip key={item.to} content={item.label}>
              {link}
            </Tooltip>
          ) : (
            link
          )
        })}
      </nav>

      {!collapsed && (
        <div className="relative mx-4 mb-3 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 p-4 pb-20 text-white">
          <p className="text-sm leading-snug font-semibold">
            More conversations.
            <br />
            More protection.
            <br />A brighter tomorrow.
          </p>
          <span className="mt-3 block h-0.5 w-8 rounded bg-white/70" aria-hidden />
          <Mountains className="absolute inset-x-0 bottom-0 h-20 w-full" />
        </div>
      )}

      <div className="border-t border-line p-3">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            'flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </motion.aside>
  )
}
