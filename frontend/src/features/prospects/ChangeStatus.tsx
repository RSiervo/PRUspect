import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/data-display/badges'
import { FormField } from '@/components/forms/FormField'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Textarea } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu'
import { errorMessage } from '@/lib/api'
import { CLOSED_LOST, STATUS_META, STATUS_ORDER } from '@/lib/constants'
import { invalidateCrm, qk } from '@/lib/queryKeys'
import { prospectService } from '@/services'
import type { ProspectStatus } from '@/types/api'

// eslint-disable-next-line react-refresh/only-export-components
export function useProspectOptions() {
  return useQuery({ queryKey: qk.prospectOptions, queryFn: prospectService.options, staleTime: 5 * 60_000 })
}

interface Pending {
  to: ProspectStatus
}

/** Decide whether a transition needs confirmation and/or a reason. */
function transitionInfo(from: ProspectStatus, to: ProspectStatus) {
  const reopen = CLOSED_LOST.includes(from) && !CLOSED_LOST.includes(to)
  const closingLost = CLOSED_LOST.includes(to)
  const won = to === 'won'
  return { reopen, closingLost, won, needsConfirm: reopen || closingLost || won }
}

/**
 * Status control used in the list, pipeline cards and profile. Lost, disqualified,
 * won and reopen transitions ask for confirmation (and an optional reason).
 */
export function StatusChanger({
  prospectId,
  prospectName,
  status,
  disabled,
  trigger,
  onChanged,
}: {
  prospectId: number
  prospectName: string
  status: ProspectStatus
  disabled?: boolean
  trigger?: ReactNode
  onChanged?: () => void
}) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: ({ to, why }: { to: ProspectStatus; why: string }) => prospectService.changeStatus(prospectId, to, why),
    onSuccess: (prospect) => {
      toast.success(`${prospectName} moved to ${STATUS_META[prospect.status].label}`)
      invalidateCrm()
      setPending(null)
      setReason('')
      onChanged?.()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const choose = (to: ProspectStatus) => {
    if (to === status) return
    if (transitionInfo(status, to).needsConfirm) setPending({ to })
    else mutation.mutate({ to, why: '' })
  }

  const info = pending ? transitionInfo(status, pending.to) : null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled || mutation.isPending}>
          {trigger ?? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label={`Status: ${STATUS_META[status].label}. Change status`}
            >
              <StatusBadge status={status} />
              {!disabled && <ChevronDown className="size-3.5 text-ink-400" aria-hidden />}
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Active stages</DropdownMenuLabel>
          {STATUS_ORDER.filter((s) => STATUS_META[s].kind === 'active').map((s) => (
            <DropdownMenuCheckItem key={s} checked={s === status} onSelect={() => choose(s)}>
              <span className="size-2 rounded-full" style={{ background: STATUS_META[s].color }} aria-hidden />
              {STATUS_META[s].label}
            </DropdownMenuCheckItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Closed / paused</DropdownMenuLabel>
          {STATUS_ORDER.filter((s) => STATUS_META[s].kind !== 'active').map((s) => (
            <DropdownMenuCheckItem key={s} checked={s === status} onSelect={() => choose(s)}>
              <span className="size-2 rounded-full" style={{ background: STATUS_META[s].color }} aria-hidden />
              {STATUS_META[s].label}
            </DropdownMenuCheckItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null)
            setReason('')
          }
        }}
        title={
          info?.reopen
            ? `Reopen ${prospectName}?`
            : info?.won
              ? `Mark ${prospectName} as Policy Issued — Won?`
              : `Close ${prospectName} as ${pending ? STATUS_META[pending.to].label : ''}?`
        }
        description={
          info?.reopen
            ? `This moves the prospect from ${STATUS_META[status].label} back to ${pending ? STATUS_META[pending.to].label : ''}. The reopen is recorded in the history.`
            : info?.won
              ? 'Use this once the policy is actually issued. Record the verified premium on the Opportunities tab.'
              : 'The prospect leaves your active pipeline. You can reopen it later; the change is kept in the history.'
        }
        confirmLabel={info?.reopen ? 'Reopen' : 'Confirm'}
        tone={info?.closingLost ? 'danger' : 'default'}
        loading={mutation.isPending}
        onConfirm={() => pending && mutation.mutate({ to: pending.to, why: reason })}
      >
        {(info?.reopen || info?.closingLost) && (
          <FormField label="Reason" optional>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={info.reopen ? 'e.g. Prospect reached out again' : 'e.g. Not interested at this time'} maxLength={500} />
          </FormField>
        )}
      </ConfirmDialog>
    </>
  )
}
