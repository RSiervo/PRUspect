import { z } from 'zod'

import { todayKey } from '@/lib/datetime'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`)

export function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('0') && digits.length === 11) return `63${digits.slice(1)}`
  if (digits.startsWith('9') && digits.length === 10) return `63${digits}`
  return digits
}

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email.').regex(EMAIL_RE, 'Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
})
export type LoginValues = z.infer<typeof loginSchema>

const activityTypes = ['call', 'sms', 'email', 'online_meeting', 'in_person_meeting', 'presentation', 'document', 'other'] as const
const priorities = ['high', 'medium', 'low'] as const

export const prospectSchema = z
  .object({
    first_name: z.string().trim().min(1, 'First name is required.').max(80),
    last_name: z.string().trim().min(1, 'Last name is required.').max(80),
    preferred_name: optionalText(80),
    mobile: z
      .string()
      .trim()
      .max(32)
      .refine((v) => !v || (phoneDigits(v).length >= 7 && phoneDigits(v).length <= 15 && /^[\d\s()+-]+$/.test(v)), {
        message: 'Enter a valid phone number, e.g. 0917 123 4567.',
      }),
    email: z
      .string()
      .trim()
      .max(254)
      .refine((v) => !v || EMAIL_RE.test(v), { message: 'Enter a valid email address.' }),
    birth_date: z
      .string()
      .refine((v) => !v || v <= todayKey(), { message: 'Birth date cannot be in the future.' }),
    occupation: optionalText(120),
    company: optionalText(120),
    location: optionalText(120),
    source: z.string(),
    referral_name: optionalText(120),
    insurance_interests: z.array(z.number()),
    existing_coverage: optionalText(255),
    budget_range: z.string(),
    priority: z.enum(priorities),
    status: z.string(),
    notes: optionalText(5000),
    consent_obtained: z.boolean(),
    consent_date: z.string().refine((v) => !v || v <= todayKey(), { message: 'Consent date cannot be in the future.' }),
    consent_source: optionalText(120),
    preferred_contact_method: z.string(),
    do_not_contact: z.boolean(),
    schedule_follow_up: z.boolean(),
    follow_up_date: z.string(),
    follow_up_time: z.string(),
    follow_up_type: z.enum(activityTypes),
    follow_up_subject: optionalText(160),
    follow_up_notes: optionalText(2000),
  })
  .superRefine((values, ctx) => {
    if (!values.mobile && !values.email) {
      ctx.addIssue({ code: 'custom', path: ['mobile'], message: 'Provide a mobile number or an email address.' })
    }
    if (values.schedule_follow_up) {
      if (!values.follow_up_date) ctx.addIssue({ code: 'custom', path: ['follow_up_date'], message: 'Pick a date.' })
      if (!values.follow_up_time) ctx.addIssue({ code: 'custom', path: ['follow_up_time'], message: 'Pick a time.' })
      if (!values.follow_up_subject) {
        ctx.addIssue({ code: 'custom', path: ['follow_up_subject'], message: 'Add a short subject.' })
      }
    }
  })
export type ProspectFormValues = z.infer<typeof prospectSchema>

export const followUpSchema = z.object({
  prospect: z.number({ error: 'Choose a prospect.' }).int().positive('Choose a prospect.'),
  activity_type: z.enum(activityTypes),
  subject: z.string().trim().min(1, 'Add a short subject.').max(160),
  description: optionalText(5000),
  date: z.string().min(1, 'Pick a date.'),
  time: z.string().min(1, 'Pick a time.'),
  duration_minutes: z.number().int().min(5).max(1440),
  priority: z.enum(priorities),
  reminder_minutes: z.string(),
})
export type FollowUpFormValues = z.infer<typeof followUpSchema>

export const completeSchema = z
  .object({
    outcome: optionalText(5000),
    next_action: optionalText(255),
    schedule_next: z.boolean(),
    next_type: z.enum(activityTypes),
    next_subject: optionalText(160),
    next_date: z.string(),
    next_time: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!values.schedule_next) return
    if (!values.next_subject) ctx.addIssue({ code: 'custom', path: ['next_subject'], message: 'Add a subject.' })
    if (!values.next_date) ctx.addIssue({ code: 'custom', path: ['next_date'], message: 'Pick a date.' })
    if (!values.next_time) ctx.addIssue({ code: 'custom', path: ['next_time'], message: 'Pick a time.' })
  })
export type CompleteFormValues = z.infer<typeof completeSchema>

export const rescheduleSchema = z.object({
  date: z.string().min(1, 'Pick a date.'),
  time: z.string().min(1, 'Pick a time.'),
  reason: optionalText(255),
})
export type RescheduleFormValues = z.infer<typeof rescheduleSchema>

export const activitySchema = z.object({
  prospect: z.number({ error: 'Choose a prospect.' }).int().positive('Choose a prospect.'),
  activity_type: z.enum(activityTypes),
  subject: z.string().trim().min(1, 'Add a short subject.').max(160),
  description: optionalText(5000),
  outcome: optionalText(5000),
  date: z.string().min(1, 'Pick a date.').refine((v) => v <= todayKey(), { message: 'Logged activities must be in the past.' }),
  time: z.string().min(1, 'Pick a time.'),
})
export type ActivityFormValues = z.infer<typeof activitySchema>

const money = z
  .string()
  .trim()
  .refine((v) => !v || (/^\d+(\.\d{1,2})?$/.test(v.replace(/,/g, '')) && Number(v.replace(/,/g, '')) >= 0), {
    message: 'Enter an amount like 36000 or 36000.50.',
  })

export const opportunitySchema = z
  .object({
    name: z.string().trim().min(1, 'Name this opportunity.').max(160),
    product_category: z.string(),
    estimated_annual_premium: money,
    currency: z.string().trim().length(3, 'Use a 3-letter code.'),
    estimated_close_date: z.string(),
    stage: z.enum(['identified', 'proposal', 'application_in_progress', 'application_submitted', 'underwriting', 'issued', 'lost']),
    application_reference: optionalText(64),
    application_submitted_date: z.string(),
    policy_issued_date: z.string(),
    actual_annualized_premium: money,
    notes: optionalText(5000),
    premium_mode: z.string(),
    next_premium_due_date: z.string(),
    also_mark_won: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const submittedStages = ['application_submitted', 'underwriting', 'issued']
    const today = todayKey()
    if (submittedStages.includes(v.stage) && !v.application_submitted_date) {
      ctx.addIssue({ code: 'custom', path: ['application_submitted_date'], message: 'Required for this stage.' })
    }
    if (v.application_submitted_date && v.application_submitted_date > today) {
      ctx.addIssue({ code: 'custom', path: ['application_submitted_date'], message: 'Cannot be in the future.' })
    }
    if (v.stage === 'issued') {
      if (!v.policy_issued_date) ctx.addIssue({ code: 'custom', path: ['policy_issued_date'], message: 'Required when issued.' })
      else if (v.policy_issued_date > today) {
        ctx.addIssue({ code: 'custom', path: ['policy_issued_date'], message: 'Cannot be in the future.' })
      } else if (v.application_submitted_date && v.policy_issued_date < v.application_submitted_date) {
        ctx.addIssue({ code: 'custom', path: ['policy_issued_date'], message: 'Cannot be before submission.' })
      }
    }
  })
export type OpportunityFormValues = z.infer<typeof opportunitySchema>

export const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password.'),
    new_password: z.string().min(10, 'Use at least 10 characters.'),
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match.',
  })
export type PasswordValues = z.infer<typeof passwordSchema>

/** For Google-only accounts that have never had a password. */
export const setPasswordSchema = z
  .object({
    current_password: z.string(),
    new_password: z.string().min(10, 'Use at least 10 characters.'),
    confirm_password: z.string(),
  })
  .refine((v) => v.new_password === v.confirm_password, { path: ['confirm_password'], message: 'Passwords do not match.' })
