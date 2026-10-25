import { Check, Minus } from 'lucide-react'
import { Checkbox as C, Switch as Sw, Tabs as T } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...props} />
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        className,
      )}
      {...props}
    />
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4', className)} aria-hidden />
}

export function Checkbox({
  className,
  checked,
  ...props
}: React.ComponentPropsWithoutRef<typeof C.Root>) {
  return (
    <C.Root
      checked={checked}
      className={cn(
        'grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-ink-300 bg-white transition-colors hover:border-ink-400 data-[state=checked]:border-brand-600 data-[state=checked]:bg-brand-600 data-[state=indeterminate]:border-brand-600 data-[state=indeterminate]:bg-brand-600',
        className,
      )}
      {...props}
    >
      <C.Indicator className="text-white">
        {checked === 'indeterminate' ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
      </C.Indicator>
    </C.Root>
  )
}

export function Switch({ className, ...props }: React.ComponentPropsWithoutRef<typeof Sw.Root>) {
  return (
    <Sw.Root
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full bg-ink-200 transition-colors data-[state=checked]:bg-brand-600',
        className,
      )}
      {...props}
    >
      <Sw.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </Sw.Root>
  )
}

export const Tabs = T.Root
export const TabsContent = T.Content

export function TabsList({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.List>) {
  return (
    <T.List
      className={cn(
        'flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'relative -mb-px shrink-0 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-800 data-[state=active]:border-brand-600 data-[state=active]:text-brand-700',
        className,
      )}
      {...props}
    />
  )
}

/** Pill-style segmented control (e.g. Monthly | Quarterly). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-full bg-ink-100 p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-7 rounded-full px-3 text-xs font-medium text-ink-600 transition-colors',
            value === option.value ? 'bg-brand-600 text-white shadow-sm' : 'hover:text-ink-900',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
