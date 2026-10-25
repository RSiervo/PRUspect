import { Check } from 'lucide-react'
import { DropdownMenu as M, Popover as P, Tooltip as T } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

export const DropdownMenu = M.Root
export const DropdownMenuTrigger = M.Trigger
export const DropdownMenuGroup = M.Group
export const DropdownMenuSub = M.Sub

const panel =
  'z-50 min-w-48 overflow-hidden rounded-xl border border-line bg-white p-1 text-sm text-ink-700 shadow-[var(--shadow-pop)] data-[state=open]:animate-[pop-in_140ms_ease-out]'

export function DropdownMenuContent({
  className,
  align = 'end',
  sideOffset = 6,
  ...props
}: React.ComponentPropsWithoutRef<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={sideOffset} className={cn(panel, 'max-h-[70dvh] overflow-y-auto', className)} {...props} />
    </M.Portal>
  )
}

const itemClass =
  'relative flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-ink-100 data-[highlighted]:text-ink-900 [&_svg]:size-4 [&_svg]:text-ink-400'

export function DropdownMenuItem({
  className,
  tone,
  ...props
}: React.ComponentPropsWithoutRef<typeof M.Item> & { tone?: 'danger' }) {
  return (
    <M.Item
      className={cn(itemClass, tone === 'danger' && 'text-brand-700 data-[highlighted]:bg-brand-50 data-[highlighted]:text-brand-800 [&_svg]:text-brand-500', className)}
      {...props}
    />
  )
}

export function DropdownMenuCheckItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentPropsWithoutRef<typeof M.Item> & { checked?: boolean }) {
  return (
    <M.Item className={cn(itemClass, 'pr-8', className)} {...props}>
      {children}
      {checked && <Check className="absolute right-2.5 !text-brand-600" aria-label="Current" />}
    </M.Item>
  )
}

export function DropdownMenuSubTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof M.SubTrigger>) {
  return <M.SubTrigger className={cn(itemClass, 'data-[state=open]:bg-ink-100', className)} {...props} />
}

export function DropdownMenuSubContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof M.SubContent>) {
  return (
    <M.Portal>
      <M.SubContent sideOffset={4} className={cn(panel, 'max-h-[70dvh] overflow-y-auto', className)} {...props} />
    </M.Portal>
  )
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof M.Label>) {
  return <M.Label className={cn('px-2.5 py-1.5 text-xs font-medium text-ink-400', className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentPropsWithoutRef<typeof M.Separator>) {
  return <M.Separator className={cn('my-1 h-px bg-line', className)} {...props} />
}

export const Popover = P.Root
export const PopoverTrigger = P.Trigger
export const PopoverAnchor = P.Anchor

export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: React.ComponentPropsWithoutRef<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={sideOffset} className={cn(panel, 'p-3', className)} {...props} />
    </P.Portal>
  )
}

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={250}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content
            sideOffset={6}
            className="z-50 max-w-72 rounded-lg bg-ink-900 px-3 py-2 text-xs leading-relaxed text-white shadow-lg data-[state=delayed-open]:animate-[pop-in_120ms_ease-out]"
          >
            {content}
            <T.Arrow className="fill-ink-900" />
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  )
}
