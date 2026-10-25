import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Info } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { FormField } from '@/components/forms/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/misc'
import { OPPORTUNITY_STAGES, SUBMITTED_OPP_STAGES } from '@/lib/constants'
import { todayKey } from '@/lib/datetime'
import { applyServerErrors } from '@/lib/forms'
import { invalidateCrm } from '@/lib/queryKeys'
import { formatMoney } from '@/lib/utils'
import { opportunitySchema, type OpportunityFormValues } from '@/schemas'
import { opportunityService, prospectService } from '@/services'
import type { Opportunity, OpportunityWrite, ProductCategory, ProspectStatus } from '@/types/api'

const clean = (v: string) => (v ? v.replace(/,/g, '') : null)

export function OpportunityDialog({
  open,
  onOpenChange,
  prospectId,
  prospectStatus,
  opportunity,
  categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prospectId: number
  prospectStatus: ProspectStatus
  opportunity?: Opportunity | null
  categories: ProductCategory[]
}) {
  const defaults = (): OpportunityFormValues => ({
    name: opportunity?.name ?? '',
    product_category: opportunity?.product_category ? String(opportunity.product_category) : '',
    estimated_annual_premium: opportunity?.estimated_annual_premium ?? '',
    currency: opportunity?.currency ?? 'PHP',
    estimated_close_date: opportunity?.estimated_close_date ?? '',
    stage: opportunity?.stage ?? 'identified',
    application_reference: opportunity?.application_reference ?? '',
    application_submitted_date: opportunity?.application_submitted_date ?? '',
    policy_issued_date: opportunity?.policy_issued_date ?? '',
    actual_annualized_premium: opportunity?.actual_annualized_premium ?? '',
    notes: opportunity?.notes ?? '',
    also_mark_won: false,
  })
  const { register, handleSubmit, control, reset, setError, formState: { errors } } = useForm<OpportunityFormValues>({
    resolver: zodResolver(opportunitySchema),
    defaultValues: defaults(),
  })
  useEffect(() => {
    if (open) reset(defaults())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opportunity?.id])

  const [stage, estimate] = useWatch({ control, name: ['stage', 'estimated_annual_premium'] })
  const submitted = SUBMITTED_OPP_STAGES.includes(stage)
  const issued = stage === 'issued'
  const monthly = estimate && !Number.isNaN(Number(clean(estimate))) ? Number(clean(estimate)) / 12 : null

  const mutation = useMutation({
    mutationFn: async (values: OpportunityFormValues) => {
      const payload: OpportunityWrite = {
        prospect: prospectId,
        name: values.name,
        product_category: values.product_category ? Number(values.product_category) : null,
        estimated_annual_premium: clean(values.estimated_annual_premium),
        currency: values.currency.toUpperCase(),
        estimated_close_date: values.estimated_close_date || null,
        stage: values.stage,
        application_reference: values.application_reference,
        application_submitted_date: submitted ? values.application_submitted_date || null : values.application_submitted_date || null,
        policy_issued_date: issued ? values.policy_issued_date || null : null,
        actual_annualized_premium: issued ? clean(values.actual_annualized_premium) : null,
        notes: values.notes,
      }
      const saved = opportunity ? await opportunityService.update(opportunity.id, payload) : await opportunityService.create(payload)
      if (issued && values.also_mark_won && prospectStatus !== 'won') {
        await prospectService.changeStatus(prospectId, 'won', 'Policy issued (recorded on opportunity)')
      }
      return saved
    },
    onSuccess: (saved) => {
      toast.success(opportunity ? 'Opportunity updated' : 'Opportunity added', { description: saved.name })
      invalidateCrm()
      onOpenChange(false)
    },
    onError: (error) => applyServerErrors(error, setError, {}, Object.keys(defaults())),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={opportunity ? 'Edit opportunity' : 'Add insurance opportunity'}
        description="Estimates stay separate from verified issued-policy figures."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button form="opportunity-form" type="submit" loading={mutation.isPending}>
              Save
            </Button>
          </>
        }
      >
        <form id="opportunity-form" onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Opportunity name" required error={errors.name?.message} className="sm:col-span-2">
            <Input placeholder="e.g. Family protection plan" {...register('name')} />
          </FormField>
          <FormField label="Product interest" optional>
            <Select {...register('product_category')}>
              <option value="">Not specified</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Stage" required>
            <Select {...register('stage')}>
              {OPPORTUNITY_STAGES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Estimated annual premium" optional error={errors.estimated_annual_premium?.message} hint={monthly ? `≈ ${formatMoney(monthly)} per month (estimate)` : 'Your estimate — not confirmed revenue.'}>
            <Input inputMode="decimal" placeholder="36000" {...register('estimated_annual_premium')} />
          </FormField>
          <FormField label="Currency" error={errors.currency?.message}>
            <Input maxLength={3} className="uppercase" {...register('currency')} />
          </FormField>
          <FormField label="Estimated close date" optional>
            <Input type="date" {...register('estimated_close_date')} />
          </FormField>
          <FormField label="Application reference" optional hint="Only if authorized and necessary.">
            <Input {...register('application_reference')} />
          </FormField>
          {(submitted || stage === 'lost') && (
            <FormField label="Application submitted" required={submitted} error={errors.application_submitted_date?.message}>
              <Input type="date" max={todayKey()} {...register('application_submitted_date')} />
            </FormField>
          )}
          {issued && (
            <>
              <FormField label="Policy issued date" required error={errors.policy_issued_date?.message}>
                <Input type="date" max={todayKey()} {...register('policy_issued_date')} />
              </FormField>
              <FormField label="Actual annualized premium" optional error={errors.actual_annualized_premium?.message} hint="Enter only once verified from the issued policy.">
                <Input inputMode="decimal" {...register('actual_annualized_premium')} />
              </FormField>
              {prospectStatus !== 'won' && (
                <label className="sm:col-span-2 flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
                  <Controller control={control} name="also_mark_won" render={({ field }) => <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} className="mt-0.5" />} />
                  Also move the prospect to “Policy Issued — Won” (recorded in status history)
                </label>
              )}
            </>
          )}
          {!issued && (
            <p className="sm:col-span-2 flex items-start gap-2 text-xs text-ink-500">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Issuance date and actual premium can be recorded once the stage is “Policy Issued”.
            </p>
          )}
          <FormField label="Notes" optional className="sm:col-span-2">
            <Textarea rows={2} {...register('notes')} />
          </FormField>
        </form>
      </DialogContent>
    </Dialog>
  )
}
