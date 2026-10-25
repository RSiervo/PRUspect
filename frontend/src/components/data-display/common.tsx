import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn, initials } from '@/lib/utils'

export function Avatar({ name, className }: { name: string; className?: string }) {
  // Stable soft color from the name so people are easy to tell apart.
  const palette = ['bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-amber-100 text-amber-800', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-teal-100 text-teal-700']
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return (
    <span
      className={cn('grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold', palette[Math.abs(hash) % palette.length], className)}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

export function Pagination({
  page,
  totalPages,
  count,
  pageSize,
  onPageChange,
}: {
  page: number
  totalPages: number
  count: number
  pageSize: number
  onPageChange: (page: number) => void
}) {
  if (count === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, count)
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm sm:px-5" aria-label="Pagination">
      <p className="text-ink-500">
        <span className="tabular font-medium text-ink-700">{from}–{to}</span> of <span className="tabular font-medium text-ink-700">{count}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="tabular px-2 text-ink-600">
          {page} / {Math.max(totalPages, 1)}
        </span>
        <Button variant="secondary" size="icon-sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <ChevronRight />
        </Button>
      </div>
    </nav>
  )
}

export interface TimelineItem {
  id: string | number
  icon: LucideIcon
  tint: string
  title: ReactNode
  description?: ReactNode
  meta?: ReactNode
  time: ReactNode
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  const reduce = useReducedMotion()
  return (
    <ol className="relative space-y-1">
      {items.map((item, index) => {
        const Icon = item.icon
        return (
          <motion.li
            key={item.id}
            className="relative flex gap-3 pb-4"
            initial={reduce ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: Math.min(index, 10) * 0.025 }}
          >
            {index < items.length - 1 && <span className="absolute top-9 bottom-0 left-[17px] w-px bg-line" aria-hidden />}
            <span className={cn('relative grid size-9 shrink-0 place-items-center rounded-full', item.tint)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-medium text-ink-900">{item.title}</p>
                <p className="text-xs text-ink-400">{item.time}</p>
              </div>
              {item.description && <div className="mt-0.5 text-sm text-ink-600">{item.description}</div>}
              {item.meta && <div className="mt-1.5 text-xs text-ink-500">{item.meta}</div>}
            </div>
          </motion.li>
        )
      })}
    </ol>
  )
}

export function DefinitionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map((item) => (
        <div key={item.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 py-2.5 text-sm">
          <dt className="text-ink-500">{item.label}</dt>
          <dd className="min-w-0 break-words text-ink-900">{item.value || <span className="text-ink-300">—</span>}</dd>
        </div>
      ))}
    </dl>
  )
}
