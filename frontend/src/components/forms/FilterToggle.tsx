import { SlidersHorizontal } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Phones: filters hide behind a "Filters" button so lists stay clean.
 * Tablets/desktop (md+): filters are always visible and the button is hidden.
 */
export function useFilterToggle(initiallyOpen = false) {
  const [open, setOpen] = useState(initiallyOpen)
  return { open, toggle: () => setOpen((v) => !v) }
}

export function FilterToggleButton({
  open,
  onToggle,
  activeCount = 0,
  controls,
  className,
}: {
  open: boolean
  onToggle: () => void
  activeCount?: number
  controls: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium transition-colors md:hidden',
        open || activeCount > 0 ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-line bg-white text-ink-700',
        className,
      )}
    >
      <SlidersHorizontal className="size-4" aria-hidden />
      Filters
      {activeCount > 0 && <span className="tabular rounded-full bg-brand-600 px-1.5 text-[11px] text-white">{activeCount}</span>}
    </button>
  )
}

/** Wraps filter controls: collapsible on phones, always shown from md up. */
export function FilterPanel({ id, open, className, children }: { id: string; open: boolean; className?: string; children: ReactNode }) {
  return (
    <div id={id} className={cn(open ? 'flex' : 'hidden', 'md:flex', className)}>
      {children}
    </div>
  )
}
