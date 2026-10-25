import { describe, expect, it } from 'vitest'

import { opportunitySchema, phoneDigits, prospectSchema, type OpportunityFormValues, type ProspectFormValues } from '@/schemas'

const base: ProspectFormValues = {
  first_name: 'Maria', last_name: 'Santos', preferred_name: '', mobile: '0917 123 4567', email: '', birth_date: '',
  occupation: '', company: '', location: '', source: '', referral_name: '', insurance_interests: [],
  existing_coverage: '', budget_range: '', priority: 'medium', status: 'new_lead', notes: '', consent_obtained: false,
  consent_date: '', consent_source: '', preferred_contact_method: 'any', do_not_contact: false,
  schedule_follow_up: false, follow_up_date: '', follow_up_time: '', follow_up_type: 'call', follow_up_subject: '',
  follow_up_notes: '',
}

function errorsOf(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.success ? [] : (result.error?.issues ?? []).map((i) => String(i.path[0]))
}

describe('prospect form validation', () => {
  it('accepts a minimal valid prospect', () => {
    expect(prospectSchema.safeParse(base).success).toBe(true)
  })

  it('requires first and last name', () => {
    expect(errorsOf(prospectSchema.safeParse({ ...base, first_name: '  ', last_name: '' }))).toEqual(
      expect.arrayContaining(['first_name', 'last_name']),
    )
  })

  it('requires a mobile number or an email', () => {
    expect(errorsOf(prospectSchema.safeParse({ ...base, mobile: '', email: '' }))).toContain('mobile')
    expect(prospectSchema.safeParse({ ...base, mobile: '', email: 'maria@example.com' }).success).toBe(true)
  })

  it('rejects malformed phone numbers and emails', () => {
    expect(errorsOf(prospectSchema.safeParse({ ...base, mobile: '12ab' }))).toContain('mobile')
    expect(errorsOf(prospectSchema.safeParse({ ...base, email: 'not-an-email' }))).toContain('email')
  })

  it('rejects a future birth date', () => {
    expect(errorsOf(prospectSchema.safeParse({ ...base, birth_date: '2999-01-01' }))).toContain('birth_date')
  })

  it('requires date, time and subject when scheduling a follow-up', () => {
    const errors = errorsOf(prospectSchema.safeParse({ ...base, schedule_follow_up: true }))
    expect(errors).toEqual(expect.arrayContaining(['follow_up_date', 'follow_up_time', 'follow_up_subject']))
  })

  it('normalizes Philippine phone formats the same way as the server', () => {
    expect(new Set(['09171234567', '+63 917 123 4567', '9171234567'].map(phoneDigits))).toEqual(new Set(['639171234567']))
  })
})

describe('opportunity validation', () => {
  const opp: OpportunityFormValues = {
    name: 'Family plan', product_category: '', estimated_annual_premium: '36000', currency: 'PHP',
    estimated_close_date: '', stage: 'identified', application_reference: '', application_submitted_date: '',
    policy_issued_date: '', actual_annualized_premium: '', notes: '', also_mark_won: false,
  }

  it('accepts an open opportunity with an estimate', () => {
    expect(opportunitySchema.safeParse(opp).success).toBe(true)
  })

  it('requires submission and issuance dates for an issued policy', () => {
    const errors = errorsOf(opportunitySchema.safeParse({ ...opp, stage: 'issued' }))
    expect(errors).toEqual(expect.arrayContaining(['application_submitted_date', 'policy_issued_date']))
  })

  it('rejects issuance before submission and invalid amounts', () => {
    const errors = errorsOf(
      opportunitySchema.safeParse({ ...opp, stage: 'issued', application_submitted_date: '2026-05-10', policy_issued_date: '2026-05-01', estimated_annual_premium: '12abc' }),
    )
    expect(errors).toEqual(expect.arrayContaining(['policy_issued_date', 'estimated_annual_premium']))
  })
})
