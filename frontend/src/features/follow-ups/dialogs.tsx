import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { CalendarClock, CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { FormField } from '@/components/forms/FormField'
import { ProspectPicker } from '@/components/forms/ProspectPicker'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/misc'
import { errorMessage } from '@/lib/api'
import { ACTIVITY_META, ACTIVITY_TYPES, PRIORITIES, PRIORITY_META, REMINDER_OPTIONS } from '@/lib/constants'
import { addDaysKey, formatDateTime, isoToZonedParts, todayKey, zonedToIso } from '@/lib/datetime'
import { applyServerErrors } from '@/lib/forms'
import { invalidateCrm } from '@/lib/queryKeys'
import {
  completeSchema,
  followUpSchema,
  rescheduleSchema,
  type CompleteFormValues,
  type FollowUpFormValues,
  type RescheduleFormValues,
} from '@/schemas'
import { followUpService } from '@/services'
import type { ActivityType, FollowUp, ProspectBrief } from '@/types/api'

const DEFAULT_SUBJECT: Record<ActivityType, string> = {
  call: 'Follow-up call',
  sms: 'Check-in message',
  email: 'Send information by email',
  online_meeting: 'Online meeting',
  in_person_meeting: 'In-person meeting',
  presentation: 'Insurance presentation',
  document: 'Collect documents',
  other: 'Follow-up',
}

// ----------------------------------------------------------- create / edit

interface FollowUpFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  followUp?: FollowUp | null
  prospect?: Pick<ProspectBrief, 'id' | 'full_name'> | null
  defaultDate?: string
  defaultType?: ActivityType
  onSaved?: (followUp: FollowUp) => void
}

export function FollowUpFormDialog({ open, onOpenChange, followUp, prospect, defaultDate, defaultType, onSaved }: FollowUpFormDialogProps) {
  const editing = Boolean(followUp)
  const defaults = (): FollowUpFormValues => {
    if (followUp) {
      const parts = isoToZonedParts(followUp.scheduled_at)
      return {
        prospect: followUp.prospect,
        activity_type: followUp.activity_type,
        subject: followUp.subject,
        description: followUp.description,
        date: parts.date,
        time: parts.time,
        duration_minutes: followUp.duration_minutes,
        priority: followUp.priority,
        reminder_minutes: followUp.reminder_minutes === null ? '' : String(followUp.reminder_minutes),
      }
    }
    const type = defaultType ?? 'call'
    return {
      prospect: prospect?.id ?? 0,
      activity_type: type,
      subject: DEFAULT_SUBJECT[type],
      description: '',
      date: defaultDate ?? addDaysKey(todayKey(), 1),
      time: '10:00',
      duration_minutes: 30,
      priority: 'medium',
      reminder_minutes: '30',
    }
  }

  const form = useForm<FollowUpFormValues>({ resolver: zodResolver(followUpSchema), defaultValues: defaults() })
  const { register, handleSubmit, control, reset, setValue, setError, getValues, formState: { errors, dirtyFields } } = form

  useEffect(() => {
    if (open) reset(defaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, followUp?.id, prospect?.id, defaultDate])

  const mutation = useMutation({
    mutationFn: async (values: FollowUpFormValues) => {
      const payload = {
        activity_type: values.activity_type,
        subject: values.subject,
        description: values.description,
        duration_minutes: values.duration_minutes,
        priority: values.priority,
        reminder_minutes: values.reminder_minutes === '' ? null : Number(values.reminder_minutes),
      }
      if (followUp) return followUpService.update(followUp.id, payload)
      return followUpService.create({
        ...payload,
        prospect: values.prospect,
        scheduled_at: zonedToIso(values.date, values.time),
      })
    },
    onSuccess: (saved) => {
      toast.success(editing ? 'Follow-up updated' : 'Follow-up scheduled', {
        description: `${saved.subject} · ${formatDateTime(saved.scheduled_at)}`,
      })
      invalidateCrm()
      onSaved?.(saved)
      onOpenChange(false)
    },
    onError: (error) =>
      applyServerErrors(error, setError, { scheduled_at: 'date' }, ['prospect', 'activity_type', 'subject', 'description', 'priority']),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit follow-up' : 'Schedule follow-up'}
        description={editing ? 'To change the date or time, use Reschedule so the change is recorded.' : 'It will appear in Follow-ups and on your calendar.'}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button form="follow-up-form" type="submit" loading={mutation.isPending}>
              {editing ? 'Save changes' : 'Schedule'}
            </Button>
          </>
        }
      >
        <form id="follow-up-form" className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
          <FormField label="Prospect" required error={errors.prospect?.message} className="sm:col-span-2">
            <Controller
              control={control}
              name="prospect"
              render={({ field }) => (
                <ProspectPicker
                  value={field.value || undefined}
                  onChange={(id) => field.onChange(id)}
                  initial={followUp ? followUp.prospect_detail : prospect}
                  disabled={editing || Boolean(prospect)}
                />
              )}
            />
          </FormField>
          <FormField label="Type" required error={errors.activity_type?.message}>
            <Select
              {...register('activity_type', {
                onChange: (event) => {
                  const type = event.target.value as ActivityType
                  const current = getValues('subject')
                  if (!dirtyFields.subject || Object.values(DEFAULT_SUBJECT).includes(current)) {
                    setValue('subject', DEFAULT_SUBJECT[type])
                  }
                },
              })}
            >
              {ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACTIVITY_META[type].label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Priority" error={errors.priority?.message}>
            <Select {...register('priority')}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Subject" required error={errors.subject?.message} className="sm:col-span-2">
            <Input placeholder="e.g. Follow-up call about health coverage" {...register('subject')} />
          </FormField>
          <FormField label="Date" required error={errors.date?.message}>
            <Input type="date" disabled={editing} {...register('date')} />
          </FormField>
          <FormField label="Time" required error={errors.time?.message}>
            <Input type="time" disabled={editing} {...register('time')} />
          </FormField>
          <FormField label="Duration">
            <Select {...register('duration_minutes', { valueAsNumber: true })}>
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="In-app reminder" hint="Shown in notifications. No email or SMS is sent.">
            <Select {...register('reminder_minutes')}>
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Notes" optional className="sm:col-span-2" error={errors.description?.message}>
            <Textarea placeholder="What do you want to cover?" {...register('description')} />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- complete

export function CompleteFollowUpDialog({
  followUp,
  open,
  onOpenChange,
}: {
  followUp: FollowUp | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const form = useForm<CompleteFormValues>({
    resolver: zodResolver(completeSchema),
    defaultValues: { outcome: '', next_action: '', schedule_next: false, next_type: 'call', next_subject: 'Follow-up call', next_date: addDaysKey(todayKey(), 3), next_time: '10:00' },
  })
  const { register, handleSubmit, control, watch, reset, setError, formState: { errors } } = form
  const scheduleNext = watch('schedule_next')

  useEffect(() => {
    if (open) reset({ outcome: '', next_action: '', schedule_next: false, next_type: 'call', next_subject: 'Follow-up call', next_date: addDaysKey(todayKey(), 3), next_time: '10:00' })
  }, [open, reset])

  const mutation = useMutation({
    mutationFn: (values: CompleteFormValues) =>
      followUpService.complete(followUp!.id, {
        outcome: values.outcome,
        next_action: values.next_action,
        next_follow_up: values.schedule_next
          ? {
              activity_type: values.next_type,
              subject: values.next_subject,
              scheduled_at: zonedToIso(values.next_date, values.next_time),
              priority: followUp!.priority,
            }
          : null,
      }),
    onSuccess: (data) => {
      toast.success('Follow-up completed', {
        description: data.next_follow_up_id ? 'Next follow-up scheduled.' : `${followUp?.prospect_detail.full_name}’s timeline was updated.`,
      })
      invalidateCrm()
      onOpenChange(false)
    },
    onError: (error) => applyServerErrors(error, setError, { next_follow_up: 'next_date' }, ['outcome', 'next_action']),
  })

  if (!followUp) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Complete follow-up"
        description={`${followUp.subject} with ${followUp.prospect_detail.full_name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button form="complete-form" type="submit" loading={mutation.isPending}>
              <CheckCircle2 /> Mark completed
            </Button>
          </>
        }
      >
        <form id="complete-form" className="space-y-4" onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
          <FormField label="Outcome" optional error={errors.outcome?.message}>
            <Textarea placeholder="What happened? e.g. Interested in education plan, wants a proposal." {...register('outcome')} />
          </FormField>
          <FormField label="Next action" optional error={errors.next_action?.message}>
            <Input placeholder="e.g. Prepare proposal" {...register('next_action')} />
          </FormField>
          <div className="rounded-xl border border-line bg-ink-50/60 p-4">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-medium text-ink-900">Schedule the next follow-up</span>
                <span className="block text-xs text-ink-500">Keep the conversation going.</span>
              </span>
              <Controller control={control} name="schedule_next" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Schedule the next follow-up" />} />
            </label>
            {scheduleNext && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="Type">
                  <Select {...register('next_type')}>
                    {ACTIVITY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {ACTIVITY_META[type].label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Subject" required error={errors.next_subject?.message}>
                  <Input {...register('next_subject')} />
                </FormField>
                <FormField label="Date" required error={errors.next_date?.message}>
                  <Input type="date" min={todayKey()} {...register('next_date')} />
                </FormField>
                <FormField label="Time" required error={errors.next_time?.message}>
                  <Input type="time" {...register('next_time')} />
                </FormField>
              </div>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// -------------------------------------------------------------- reschedule

export function RescheduleDialog({
  followUp,
  open,
  onOpenChange,
  initialDate,
}: {
  followUp: FollowUp | null
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate?: string
}) {
  const form = useForm<RescheduleFormValues>({ resolver: zodResolver(rescheduleSchema), defaultValues: { date: '', time: '', reason: '' } })
  const { register, handleSubmit, reset, setError, formState: { errors } } = form

  useEffect(() => {
    if (open && followUp) {
      const parts = isoToZonedParts(followUp.scheduled_at)
      reset({ date: initialDate ?? parts.date, time: parts.time, reason: '' })
    }
  }, [open, followUp, initialDate, reset])

  const mutation = useMutation({
    mutationFn: (values: RescheduleFormValues) => followUpService.reschedule(followUp!.id, zonedToIso(values.date, values.time), values.reason),
    onSuccess: (saved) => {
      toast.success('Follow-up rescheduled', { description: formatDateTime(saved.scheduled_at) })
      invalidateCrm()
      onOpenChange(false)
    },
    onError: (error) => applyServerErrors(error, setError, { scheduled_at: 'date' }, ['reason']),
  })

  if (!followUp) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Reschedule follow-up"
        description={`Currently ${formatDateTime(followUp.scheduled_at)}. The same calendar entry moves; the old time is kept in history.`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button form="reschedule-form" type="submit" loading={mutation.isPending}>
              <CalendarClock /> Reschedule
            </Button>
          </>
        }
      >
        <form id="reschedule-form" className="grid grid-cols-2 gap-3" onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
          <FormField label="New date" required error={errors.date?.message}>
            <Input type="date" {...register('date')} />
          </FormField>
          <FormField label="New time" required error={errors.time?.message}>
            <Input type="time" {...register('time')} />
          </FormField>
          <FormField label="Reason" optional className="col-span-2" error={errors.reason?.message}>
            <Input placeholder="e.g. Client requested a later date" {...register('reason')} />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ------------------------------------------------------------------ cancel

export function CancelFollowUpDialog({
  followUp,
  open,
  onOpenChange,
}: {
  followUp: FollowUp | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => followUpService.cancel(followUp!.id, reason),
    onSuccess: () => {
      toast.success('Follow-up canceled')
      invalidateCrm()
      onOpenChange(false)
      setReason('')
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  if (!followUp) return null
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cancel this follow-up?"
      description={`“${followUp.subject}” with ${followUp.prospect_detail.full_name} will be removed from your active list and calendar. It stays in the history.`}
      confirmLabel="Cancel follow-up"
      tone="danger"
      loading={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    >
      <FormField label="Reason" optional>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Prospect unavailable" />
      </FormField>
    </ConfirmDialog>
  )
}
