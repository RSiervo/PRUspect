import { CalendarClock, CheckCircle2, MoreHorizontal, Pencil, UserRound, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { PriorityBadge } from '@/components/data-display/badges'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu'
import { Badge } from '@/components/ui/misc'
import { ACTIVITY_META } from '@/lib/constants'
import { formatDateTime, formatRelativeDay } from '@/lib/datetime'
import { cn } from '@/lib/utils'
import type { FollowUp } from '@/types/api'

import { CancelFollowUpDialog, CompleteFollowUpDialog, FollowUpFormDialog, RescheduleDialog } from './dialogs'

type DialogKind = 'complete' | 'reschedule' | 'edit' | 'cancel'

/** Holds the follow-up action dialogs so any list can open them. */
export function useFollowUpDialogs() {
  const [state, setState] = useState<{ kind: DialogKind; followUp: FollowUp; date?: string } | null>(null)
  const close = (open: boolean) => {
    if (!open) setState(null)
  }
  const open = (kind: DialogKind, followUp: FollowUp, date?: string) => setState({ kind, followUp, date })
  const dialogs = (
    <>
      <CompleteFollowUpDialog followUp={state?.followUp ?? null} open={state?.kind === 'complete'} onOpenChange={close} />
      <RescheduleDialog followUp={state?.followUp ?? null} open={state?.kind === 'reschedule'} onOpenChange={close} initialDate={state?.date} />
      <CancelFollowUpDialog followUp={state?.followUp ?? null} open={state?.kind === 'cancel'} onOpenChange={close} />
      <FollowUpFormDialog followUp={state?.kind === 'edit' ? state.followUp : null} open={state?.kind === 'edit'} onOpenChange={close} />
    </>
  )
  return { open, dialogs }
}

const bucketStyle: Record<string, { label: string; className: string }> = {
  overdue: { label: 'Overdue', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  today: { label: 'Today', className: 'bg-brand-50 text-brand-700 ring-brand-200' },
  upcoming: { label: 'Upcoming', className: 'bg-sky-50 text-sky-800 ring-sky-200' },
  completed: { label: 'Completed', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  canceled: { label: 'Canceled', className: 'bg-ink-100 text-ink-500 ring-ink-200' },
}

export function FollowUpItem({
  followUp,
  onAction,
  showProspect = true,
  compact,
}: {
  followUp: FollowUp
  onAction: (kind: DialogKind, followUp: FollowUp) => void
  showProspect?: boolean
  compact?: boolean
}) {
  const navigate = useNavigate()
  const meta = ACTIVITY_META[followUp.activity_type]
  const Icon = meta.icon
  const pending = followUp.status === 'pending'
  const bucket = bucketStyle[followUp.bucket]

  return (
    <div className={cn('group flex items-start gap-3 py-3', compact ? 'px-4' : 'px-4 sm:px-5')}>
      <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-full', meta.tint)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showProspect ? (
            <Link to={`/prospects/${followUp.prospect}`} className="truncate text-sm font-semibold text-ink-900 hover:text-brand-700">
              {followUp.prospect_detail.full_name}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-ink-900">{followUp.subject}</p>
          )}
          {!compact && bucket && <Badge className={cn('h-5 text-[11px]', bucket.className)}>{bucket.label}</Badge>}
        </div>
        <p className="truncate text-sm text-ink-600">{showProspect ? followUp.subject : meta.label}</p>
        <p className={cn('mt-0.5 text-xs', followUp.bucket === 'overdue' ? 'font-medium text-amber-700' : 'text-ink-500')}>
          {followUp.status === 'completed'
            ? `Completed ${formatDateTime(followUp.completed_at)}`
            : followUp.status === 'canceled'
              ? `Canceled${followUp.cancel_reason ? ` — ${followUp.cancel_reason}` : ''}`
              : formatRelativeDay(followUp.scheduled_at)}
          {followUp.reschedules.length > 0 && pending && <span className="text-ink-400"> · rescheduled {followUp.reschedules.length}×</span>}
        </p>
        {followUp.outcome && !compact && <p className="mt-1 line-clamp-2 text-xs text-ink-500">Outcome: {followUp.outcome}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {!compact && <PriorityBadge priority={followUp.priority} className="hidden sm:inline-flex" />}
        {pending && (
          <Button variant="ghost" size="icon-sm" onClick={() => onAction('complete', followUp)} aria-label={`Complete ${followUp.subject}`} className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700">
            <CheckCircle2 />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {pending && (
              <>
                <DropdownMenuItem onSelect={() => onAction('complete', followUp)}>
                  <CheckCircle2 /> Mark completed
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAction('reschedule', followUp)}>
                  <CalendarClock /> Reschedule
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAction('edit', followUp)}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onSelect={() => navigate(`/prospects/${followUp.prospect}`)}>
              <UserRound /> Open prospect
            </DropdownMenuItem>
            {pending && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem tone="danger" onSelect={() => onAction('cancel', followUp)}>
                  <XCircle /> Cancel follow-up
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
