import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { format } from 'date-fns'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { FormField } from '@/components/forms/FormField'
import { ProspectPicker } from '@/components/forms/ProspectPicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Select, Textarea } from '@/components/ui/input'
import { ACTIVITY_META, ACTIVITY_TYPES } from '@/lib/constants'
import { nowInZone, todayKey, zonedToIso } from '@/lib/datetime'
import { applyServerErrors } from '@/lib/forms'
import { invalidateCrm } from '@/lib/queryKeys'
import { activitySchema, type ActivityFormValues } from '@/schemas'
import { activityService } from '@/services'
import type { ProspectBrief } from '@/types/api'

/** Record an interaction that already happened (it goes straight to the timeline). */
export function LogActivityDialog({
  open,
  onOpenChange,
  prospect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prospect?: Pick<ProspectBrief, 'id' | 'full_name'> | null
}) {
  const defaults = (): ActivityFormValues => ({
    prospect: prospect?.id ?? 0,
    activity_type: 'call',
    subject: '',
    description: '',
    outcome: '',
    date: todayKey(),
    time: format(nowInZone(), 'HH:mm'),
  })
  const { register, handleSubmit, control, reset, setError, formState: { errors } } = useForm<ActivityFormValues>({
    resolver: zodResolver(activitySchema),
    defaultValues: defaults(),
  })

  useEffect(() => {
    if (open) reset(defaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prospect?.id])

  const mutation = useMutation({
    mutationFn: (values: ActivityFormValues) =>
      activityService.create({
        prospect: values.prospect,
        activity_type: values.activity_type,
        subject: values.subject,
        description: values.description,
        outcome: values.outcome,
        occurred_at: zonedToIso(values.date, values.time),
      }),
    onSuccess: (activity) => {
      toast.success('Activity logged', {
        description: activity.counts_as_contact ? 'Last contact date updated.' : 'Added to the timeline.',
      })
      invalidateCrm()
      onOpenChange(false)
    },
    onError: (error) => applyServerErrors(error, setError, { occurred_at: 'date' }, ['prospect', 'subject', 'outcome', 'description', 'activity_type']),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Log activity"
        description="Record a call, message or meeting that already happened."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button form="activity-form" type="submit" loading={mutation.isPending}>
              Log activity
            </Button>
          </>
        }
      >
        <form id="activity-form" className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate>
          <FormField label="Prospect" required error={errors.prospect?.message} className="sm:col-span-2">
            <Controller
              control={control}
              name="prospect"
              render={({ field }) => (
                <ProspectPicker value={field.value || undefined} onChange={(id) => field.onChange(id)} initial={prospect} disabled={Boolean(prospect)} />
              )}
            />
          </FormField>
          <FormField label="Type" required>
            <Select {...register('activity_type')}>
              {ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACTIVITY_META[type].label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Subject" required error={errors.subject?.message}>
            <Input placeholder="e.g. Called about proposal" {...register('subject')} />
          </FormField>
          <FormField label="Date" required error={errors.date?.message}>
            <Input type="date" max={todayKey()} {...register('date')} />
          </FormField>
          <FormField label="Time" required error={errors.time?.message}>
            <Input type="time" {...register('time')} />
          </FormField>
          <FormField label="Outcome" optional className="sm:col-span-2" error={errors.outcome?.message}>
            <Textarea placeholder="What was the result?" {...register('outcome')} />
          </FormField>
          <FormField label="Details" optional className="sm:col-span-2" error={errors.description?.message}>
            <Textarea rows={2} {...register('description')} />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  )
}
