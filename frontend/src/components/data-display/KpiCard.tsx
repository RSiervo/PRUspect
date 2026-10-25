import { ArrowUpRight, Info } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { Skeleton } from '@/components/ui/misc'
import { Tooltip } from '@/components/ui/menu'
import { cn } from '@/lib/utils'

const tones = {
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  green: 'bg-emerald-50 text-emerald-600',
  violet: 'bg-violet-50 text-violet-600',
  brand: 'bg-brand-50 text-brand-600',
  slate: 'bg-ink-100 text-ink-600',
  teal: 'bg-teal-50 text-teal-600',
  orange: 'bg-orange-50 text-orange-600',
}

interface KpiCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon: LucideIcon
  tone?: keyof typeof tones
  to?: string
  definition?: string
  loading?: boolean
  index?: number
}

export function KpiCard({ label, value, hint, icon: Icon, tone = 'blue', to, definition, loading, index = 0 }: KpiCardProps) {
  const reduce = useReducedMotion()
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className={cn('grid size-10 shrink-0 place-items-center rounded-full', tones[tone])}>
          <Icon className="size-5" aria-hidden />
        </div>
        {to && <ArrowUpRight className="size-4 text-ink-300 transition group-hover:text-brand-600" aria-hidden />}
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <p className="text-[13px] text-ink-500">{label}</p>
        {definition && (
          <Tooltip content={definition}>
            <button type="button" className="text-ink-300 hover:text-ink-500" aria-label={`How ${label} is calculated`} onClick={(e) => e.preventDefault()}>
              <Info className="size-3.5" />
            </button>
          </Tooltip>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className="tabular mt-1 text-2xl font-semibold tracking-tight text-ink-900">{value}</p>
      )}
      {hint && !loading && <p className="mt-1 truncate text-xs text-ink-500">{hint}</p>}
    </>
  )
  const className =
    'card group block h-full p-4 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] sm:p-5'
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
    >
      {to ? (
        <Link to={to} className={className}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </motion.div>
  )
}
