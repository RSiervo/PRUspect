import { AlertDialog as A } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

import { Button } from './button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  tone?: 'default' | 'danger'
  loading?: boolean
  /** Disable the confirm button (e.g. until a confirmation phrase is typed). */
  confirmDisabled?: boolean
  onConfirm: () => void
  children?: React.ReactNode
}

/** Confirmation for significant or destructive actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'default',
  loading,
  confirmDisabled,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <A.Root open={open} onOpenChange={onOpenChange}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-[2px]" />
        <A.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-[var(--shadow-pop)]',
            'data-[state=open]:animate-[dialog-in_180ms_cubic-bezier(0.16,1,0.3,1)]',
          )}
        >
          <A.Title className="text-base font-semibold text-ink-900">{title}</A.Title>
          {description ? (
            <A.Description className="mt-2 text-sm leading-relaxed text-ink-600">{description}</A.Description>
          ) : (
            <A.Description className="sr-only">{title}</A.Description>
          )}
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <A.Cancel asChild>
              <Button variant="secondary" disabled={loading}>
                Cancel
              </Button>
            </A.Cancel>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={loading}
              disabled={confirmDisabled}
              onClick={(event) => {
                event.preventDefault()
                onConfirm()
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  )
}
