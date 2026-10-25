import { useMutation, useQuery } from '@tanstack/react-query'
import { Pencil, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { ErrorState, ListSkeleton } from '@/components/data-display/states'
import { FormField } from '@/components/forms/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Card, CardHeader } from '@/components/ui/misc'
import { applyServerErrors } from '@/lib/forms'
import { formatDate } from '@/lib/datetime'
import { queryClient } from '@/lib/queryKeys'
import { cn, formatCompactMoney } from '@/lib/utils'
import { goalService } from '@/services'
import type { GoalField, GoalProgress } from '@/types/api'

const ROWS: { key: GoalField; label: string; money?: boolean }[] = [
  { key: 'new_prospects', label: 'New prospects' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'policies', label: 'Policies issued' },
  { key: 'issued_premium', label: 'Issued premium', money: true },
]

function GoalsDialog({ open, onClose, data }: { open: boolean; onClose: () => void; data: GoalProgress }) {
  const initial = data.has_goals ? data.targets : (data.suggested ?? data.targets)
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<Record<GoalField, string>>()
  useEffect(() => {
    if (open) reset(Object.fromEntries(ROWS.map((r) => [r.key, initial[r.key] == null ? '' : String(initial[r.key])])) as Record<GoalField, string>)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const save = useMutation({
    mutationFn: (values: Record<GoalField, string>) => goalService.save(values),
    onSuccess: (next) => {
      queryClient.setQueryData(['goals'], next)
      toast.success('Goals saved')
      onClose()
    },
    onError: (e) => applyServerErrors(e, setError, {}, ROWS.map((r) => r.key)),
  })
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title={`Goals for ${formatDate(data.month, 'MMMM yyyy')}`}
        description="Leave a field empty to skip it."
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button form="goals-form" type="submit" loading={save.isPending}>Save goals</Button>
          </>
        }
      >
        <form id="goals-form" className="grid grid-cols-2 gap-3" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
          {ROWS.map((r) => (
            <FormField key={r.key} label={r.money ? 'Issued premium (₱)' : r.label} error={errors[r.key]?.message}>
              <Input inputMode="numeric" placeholder="—" {...register(r.key)} />
            </FormField>
          ))}
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function GoalsCard() {
  const [editing, setEditing] = useState(false)
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['goals'], queryFn: goalService.current })

  return (
    <Card className="flex flex-col xl:self-start">
      <CardHeader
        title="This month’s goals"
        description={data ? `${formatDate(data.month, 'MMMM')} · ${Math.round(data.pace * 100)}% of the month gone` : undefined}
        action={data?.has_goals ? <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label="Edit goals"><Pencil /></Button> : undefined}
      />
      <div className="flex-1 px-4 pt-3 pb-4 sm:px-5">
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading || !data ? (
          <ListSkeleton rows={3} />
        ) : !data.has_goals ? (
          <div className="flex flex-col items-center py-6 text-center">
            <span className="grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Target className="size-5" aria-hidden /></span>
            <p className="mt-3 text-sm font-medium text-ink-900">Set targets for {formatDate(data.month, 'MMMM')}</p>
            <p className="mt-1 text-xs text-ink-500">{data.suggested ? 'Start from last month’s goals.' : 'New prospects, appointments, policies and premium.'}</p>
            <Button size="sm" className="mt-4" onClick={() => setEditing(true)}>Set goals</Button>
          </div>
        ) : (
          <ul className="space-y-4">
            {ROWS.filter((r) => data.targets[r.key] != null).map((r) => {
              const target = Number(data.targets[r.key])
              const actual = Number(data.actual[r.key])
              const ratio = target > 0 ? Math.min(actual / target, 1) : 0
              const behind = actual / Math.max(target, 1) < data.pace - 0.1
              return (
                <li key={r.key} title={data.definitions[r.key]}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="text-ink-700">{r.label}</span>
                    <span className="tabular text-ink-900">
                      <span className="font-semibold">{r.money ? formatCompactMoney(actual) : actual}</span>
                      <span className="text-ink-400"> / {r.money ? formatCompactMoney(target) : target}</span>
                    </span>
                  </div>
                  <div className="relative mt-1.5 h-2 rounded-full bg-ink-100" role="progressbar" aria-label={r.label} aria-valuenow={actual} aria-valuemin={0} aria-valuemax={target}>
                    <div className={cn('h-2 rounded-full transition-all', ratio >= 1 ? 'bg-emerald-600' : behind ? 'bg-amber-500' : 'bg-brand-600')} style={{ width: `${ratio * 100}%` }} />
                    <span className="absolute -top-1 h-4 w-0.5 rounded bg-ink-400" style={{ left: `${data.pace * 100}%` }} aria-hidden title="Pace for today" />
                  </div>
                </li>
              )
            })}
            <li className="text-[11px] text-ink-400">The grey marker shows where you’d be at an even pace.</li>
          </ul>
        )}
      </div>
      {data && <GoalsDialog open={editing} onClose={() => setEditing(false)} data={data} />}
    </Card>
  )
}
