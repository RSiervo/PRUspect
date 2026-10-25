import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/data-display/badges'
import { ErrorState } from '@/components/data-display/states'
import { FormField, FormSection } from '@/components/forms/FormField'
import { ProspectPicker } from '@/components/forms/ProspectPicker'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Skeleton, Switch } from '@/components/ui/misc'
import { useDebouncedValue } from '@/hooks'
import { ACTIVITY_META, ACTIVITY_TYPES, PRIORITIES, PRIORITY_META, STATUS_META, STATUS_ORDER } from '@/lib/constants'
import { addDaysKey, todayKey, zonedToIso } from '@/lib/datetime'
import { applyServerErrors } from '@/lib/forms'
import { invalidateCrm, qk } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { phoneDigits, prospectSchema, type ProspectFormValues } from '@/schemas'
import { prospectService } from '@/services'
import type { Prospect, ProspectWrite } from '@/types/api'

import { useProspectOptions } from './ChangeStatus'

const makeEmpty = (): ProspectFormValues => ({
  first_name: '', last_name: '', preferred_name: '', mobile: '', email: '', birth_date: '', occupation: '', company: '',
  location: '', source: '', referral_name: '', referred_by: 0, insurance_interests: [], existing_coverage: '', budget_range: '',
  priority: 'medium', status: 'new_lead', notes: '', consent_obtained: false, consent_date: '', consent_source: '',
  preferred_contact_method: 'any', do_not_contact: false, schedule_follow_up: true,
  follow_up_date: addDaysKey(todayKey(), 1), follow_up_time: '10:00', follow_up_type: 'call',
  follow_up_subject: 'Introductory call', follow_up_notes: '',
})

function fromProspect(p: Prospect): ProspectFormValues {
  return {
    ...makeEmpty(),
    first_name: p.first_name, last_name: p.last_name, preferred_name: p.preferred_name, mobile: p.mobile, email: p.email,
    birth_date: p.birth_date ?? '', occupation: p.occupation, company: p.company, location: p.location,
    source: p.source_id ? String(p.source_id) : '', referral_name: p.referral_name, referred_by: p.referred_by?.id ?? 0,
    insurance_interests: p.insurance_interests.map((i) => i.id), existing_coverage: p.existing_coverage,
    budget_range: p.budget_range, priority: p.priority, status: p.status, notes: p.notes,
    consent_obtained: p.consent_obtained, consent_date: p.consent_date ?? '', consent_source: p.consent_source,
    preferred_contact_method: p.preferred_contact_method, do_not_contact: p.do_not_contact, schedule_follow_up: false,
  }
}

function toPayload(values: ProspectFormValues, creating: boolean): ProspectWrite {
  const payload: ProspectWrite = {
    first_name: values.first_name, last_name: values.last_name, preferred_name: values.preferred_name,
    mobile: values.mobile, email: values.email, birth_date: values.birth_date || null, occupation: values.occupation,
    company: values.company, location: values.location, source: values.source ? Number(values.source) : null,
    referral_name: values.referral_name, referred_by: values.referred_by || null, insurance_interests: values.insurance_interests,
    existing_coverage: values.existing_coverage, budget_range: values.budget_range, priority: values.priority,
    notes: values.notes, consent_obtained: values.consent_obtained, consent_date: values.consent_date || null,
    consent_source: values.consent_source, preferred_contact_method: values.preferred_contact_method,
    do_not_contact: values.do_not_contact,
  }
  if (creating) {
    payload.status = values.status as ProspectWrite['status']
    payload.initial_follow_up = values.schedule_follow_up
      ? {
          activity_type: values.follow_up_type,
          subject: values.follow_up_subject,
          description: values.follow_up_notes,
          scheduled_at: zonedToIso(values.follow_up_date, values.follow_up_time),
          priority: values.priority,
        }
      : null
  }
  return payload
}

const FIELD_NAMES = Object.keys(makeEmpty())

function DuplicateWarning({ mobile, email, excludeId }: { mobile: string; email: string; excludeId?: number }) {
  const m = useDebouncedValue(phoneDigits(mobile).length >= 7 ? mobile : '', 450)
  const e = useDebouncedValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '', 450)
  const { data } = useQuery({
    queryKey: ['duplicates', m, e, excludeId],
    queryFn: () => prospectService.duplicates({ mobile: m, email: e, exclude: excludeId }),
    enabled: Boolean(m || e),
  })
  if (!data?.matches.length) return null
  return (
    <div role="status" className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <AlertTriangle className="size-4" aria-hidden /> Possible duplicate{data.matches.length > 1 ? 's' : ''}
      </p>
      <p className="mt-1 text-xs text-amber-800">You already have a record with this {data.matches[0]?.matched_on.join(' and ')}. Check it before saving — nothing is merged automatically.</p>
      <ul className="mt-3 space-y-2">
        {data.matches.map((match) => (
          <li key={match.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/70 px-3 py-2 text-sm">
            <Link to={`/prospects/${match.id}`} target="_blank" className="font-medium text-ink-900 underline-offset-2 hover:underline">
              {match.full_name}
            </Link>
            <span className="text-xs text-ink-500">{[match.mobile, match.email].filter(Boolean).join(' · ')}</span>
            <StatusBadge status={match.status} short />
            {match.is_archived && <span className="text-xs text-ink-500">(archived)</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ProspectFormPage() {
  const { id } = useParams()
  const prospectId = id ? Number(id) : undefined
  const creating = !prospectId
  const navigate = useNavigate()
  const { data: options } = useProspectOptions()
  const [loaded, setLoaded] = useState(creating)

  const existing = useQuery({
    queryKey: qk.prospect(prospectId ?? 0),
    queryFn: () => prospectService.get(prospectId!),
    enabled: !creating,
  })

  const form = useForm<ProspectFormValues>({ resolver: zodResolver(prospectSchema), defaultValues: makeEmpty(), mode: 'onTouched' })
  const { register, control, handleSubmit, reset, setError, formState: { errors, isDirty } } = form

  useEffect(() => {
    if (existing.data && !loaded) {
      reset(fromProspect(existing.data))
      setLoaded(true)
    }
  }, [existing.data, loaded, reset])

  const [mobile, email, source, scheduleFollowUp, consent] = useWatch({ control, name: ['mobile', 'email', 'source', 'schedule_follow_up', 'consent_obtained'] })
  const sourceName = options?.sources.find((s) => String(s.id) === source)?.name ?? ''

  const mutation = useMutation({
    mutationFn: (values: ProspectFormValues) =>
      creating ? prospectService.create(toPayload(values, true)) : prospectService.update(prospectId!, toPayload(values, false)),
    onSuccess: (prospect) => {
      toast.success(creating ? 'Prospect added' : 'Changes saved', { description: prospect.full_name })
      invalidateCrm()
      navigate(`/prospects/${prospect.id}`)
    },
    onError: (error) =>
      applyServerErrors(error, setError, { initial_follow_up: 'follow_up_date' }, FIELD_NAMES),
  })

  if (!creating && existing.error) return <div className="card"><ErrorState error={existing.error} onRetry={existing.refetch} /></div>
  if (!loaded) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    )
  }

  const activeSources = options?.sources.filter((s) => s.is_active || String(s.id) === source) ?? []
  const categories = options?.product_categories ?? []

  return (
    <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="mx-auto max-w-4xl pb-24 md:pb-0">
      <Link to={creating ? '/prospects' : `/prospects/${prospectId}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="size-4" /> {creating ? 'Prospects' : 'Back to profile'}
      </Link>
      <PageHeader
        title={creating ? 'Add prospect' : `Edit ${existing.data?.full_name ?? 'prospect'}`}
        description="Collect only what you need for prospecting. Don’t record government IDs, bank details or medical details here."
      />

      <div className="space-y-5">
        <FormSection title="Personal information">
          <FormField label="First name" required error={errors.first_name?.message}>
            <Input autoComplete="off" {...register('first_name')} />
          </FormField>
          <FormField label="Last name" required error={errors.last_name?.message}>
            <Input autoComplete="off" {...register('last_name')} />
          </FormField>
          <FormField label="Preferred name" optional error={errors.preferred_name?.message}>
            <Input placeholder="What they like to be called" {...register('preferred_name')} />
          </FormField>
          <FormField label="Birth date" optional hint="Only if needed for an insurance needs analysis." error={errors.birth_date?.message}>
            <Input type="date" max={todayKey()} {...register('birth_date')} />
          </FormField>
          <FormField label="Mobile number" error={errors.mobile?.message} hint="A mobile number or an email is required.">
            <Input type="tel" inputMode="tel" placeholder="0917 123 4567" {...register('mobile')} />
          </FormField>
          <FormField label="Email address" error={errors.email?.message}>
            <Input type="email" inputMode="email" placeholder="name@example.com" {...register('email')} />
          </FormField>
          <DuplicateWarning mobile={mobile} email={email} excludeId={prospectId} />
          <FormField label="Occupation" optional error={errors.occupation?.message}>
            <Input {...register('occupation')} />
          </FormField>
          <FormField label="Company or employer" optional error={errors.company?.message}>
            <Input {...register('company')} />
          </FormField>
          <FormField label="City or general location" optional hint="City or area only — no street address." error={errors.location?.message} className="sm:col-span-2">
            <Input placeholder="e.g. Makati City" {...register('location')} />
          </FormField>
        </FormSection>

        <FormSection title="Prospect qualification">
          <FormField label="Prospect source" optional>
            <Select {...register('source')}>
              <option value="">Not specified</option>
              {activeSources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Referred by (existing prospect or client)" optional hint="Links the two records and counts toward Top referrers." error={errors.referred_by?.message}>
            <Controller
              control={control}
              name="referred_by"
              render={({ field }) => (
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <ProspectPicker value={field.value || undefined} onChange={(id) => field.onChange(id)} initial={existing.data?.referred_by ?? null} />
                  </div>
                  {field.value ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange(0)}>
                      Clear
                    </Button>
                  ) : null}
                </div>
              )}
            />
          </FormField>
          <FormField label="Referral name" optional hint={sourceName === 'Referral' ? 'If the referrer isn’t in PRUspect, type their name.' : undefined} error={errors.referral_name?.message}>
            <Input {...register('referral_name')} />
          </FormField>
          <div className="sm:col-span-2">
            <p className="mb-2 text-[13px] font-medium text-ink-700">Insurance interest</p>
            <Controller
              control={control}
              name="insurance_interests"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Insurance interest">
                  {categories.filter((c) => c.is_active || field.value.includes(c.id)).map((c) => {
                    const on = field.value.includes(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        title={c.description}
                        onClick={() => field.onChange(on ? field.value.filter((v) => v !== c.id) : [...field.value, c.id])}
                        className={cn(
                          'h-9 rounded-full border px-3.5 text-sm transition-colors',
                          on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink-700 hover:border-ink-300',
                        )}
                      >
                        {c.name}
                      </button>
                    )
                  })}
                  {categories.length === 0 && <p className="text-sm text-ink-500">Add categories in Settings.</p>}
                </div>
              )}
            />
          </div>
          <FormField label="Existing insurance coverage" optional error={errors.existing_coverage?.message}>
            <Input placeholder="e.g. Company HMO only" {...register('existing_coverage')} />
          </FormField>
          <FormField label="Affordable premium range" optional>
            <Select {...register('budget_range')}>
              <option value="">Not discussed</option>
              {options?.budget_ranges.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Priority" required>
            <Select {...register('priority')}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Prospect status" required hint={creating ? undefined : 'Change status from the profile so it is recorded in the history.'}>
            <Select disabled={!creating} {...register('status')}>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Notes" optional className="sm:col-span-2" error={errors.notes?.message} hint="A short summary. Add dated notes on the profile’s Notes tab.">
            <Textarea rows={3} {...register('notes')} />
          </FormField>
        </FormSection>

        <FormSection title="Consent & communication" description="Record how the prospect agreed to be contacted (Data Privacy Act).">
          <div className="sm:col-span-2 flex items-center justify-between gap-4 rounded-xl bg-ink-50/70 p-4">
            <span className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 text-emerald-600" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-ink-900">Consent to be contacted obtained</span>
                <span className="block text-xs text-ink-500">Confirm the prospect agreed to receive follow-ups.</span>
              </span>
            </span>
            <Controller control={control} name="consent_obtained" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Consent obtained" />} />
          </div>
          {consent && (
            <>
              <FormField label="Consent date" error={errors.consent_date?.message}>
                <Input type="date" max={todayKey()} {...register('consent_date')} />
              </FormField>
              <FormField label="How consent was given" error={errors.consent_source?.message}>
                <Input placeholder="e.g. Verbal during call, signed form" {...register('consent_source')} />
              </FormField>
            </>
          )}
          <FormField label="Preferred contact method">
            <Select {...register('preferred_contact_method')}>
              {options?.contact_methods.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="flex items-end">
            <label className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-line px-3.5">
              <span className="text-sm text-ink-800">Do not contact</span>
              <Controller control={control} name="do_not_contact" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Do not contact" />} />
            </label>
          </div>
        </FormSection>

        {creating && (
          <FormSection title="Next follow-up" description="Schedule the first touchpoint now so this prospect doesn’t slip.">
            <div className="sm:col-span-2 flex items-center justify-between">
              <span className="text-sm text-ink-800">Schedule a follow-up</span>
              <Controller control={control} name="schedule_follow_up" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Schedule a follow-up" />} />
            </div>
            {scheduleFollowUp && (
              <>
                <FormField label="Follow-up type">
                  <Select {...register('follow_up_type')}>
                    {ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACTIVITY_META[t].label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Subject" required error={errors.follow_up_subject?.message}>
                  <Input {...register('follow_up_subject')} />
                </FormField>
                <FormField label="Date" required error={errors.follow_up_date?.message}>
                  <Input type="date" min={todayKey()} {...register('follow_up_date')} />
                </FormField>
                <FormField label="Time" required error={errors.follow_up_time?.message}>
                  <Input type="time" {...register('follow_up_time')} />
                </FormField>
                <FormField label="Follow-up notes" optional className="sm:col-span-2">
                  <Textarea rows={2} {...register('follow_up_notes')} />
                </FormField>
              </>
            )}
          </FormSection>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:static md:mt-6 md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-4xl justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!creating && !isDirty}>
            {creating ? 'Save prospect' : 'Save changes'}
          </Button>
        </div>
      </div>
    </form>
  )
}
