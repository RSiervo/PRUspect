import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProspectFormPage } from '@/features/prospects/ProspectFormPage'
import { ApiError } from '@/lib/api'
import { prospectService } from '@/services'
import type { Prospect, ProspectOptions } from '@/types/api'

import { renderRoutes } from './utils'

const options: ProspectOptions = {
  statuses: [],
  priorities: [],
  budget_ranges: [{ value: '1k_3k', label: '₱1,000 – ₱2,999 / month' }],
  contact_methods: [{ value: 'any', label: 'No preference' }],
  sources: [{ id: 3, name: 'Referral', is_active: true, sort_order: 0 }],
  product_categories: [{ id: 5, name: 'Health', description: '', is_active: true, sort_order: 0 }],
}

const existing = {
  id: 9, first_name: 'Anna', last_name: 'Cruz', preferred_name: '', full_name: 'Anna Cruz', mobile: '09061112222',
  email: 'anna@example.com', occupation: 'Nurse', company: '', location: '', source: null, source_id: null,
  insurance_interests: [], status: 'contacted', status_label: 'Contacted', stage_kind: 'active', priority: 'medium',
  last_contacted_at: null, next_follow_up_at: null, created_at: '2026-10-01T00:00:00Z', is_archived: false,
  is_demo: false, do_not_contact: false, birth_date: null, referral_name: '', existing_coverage: '', budget_range: '',
  budget_range_label: '', notes: '', consent_obtained: false, consent_date: null, consent_source: '',
  preferred_contact_method: 'any', preferred_contact_method_label: '', status_changed_at: null, qualified_at: null,
  application_submitted_at: null, policy_issued_at: null, referral_asked_at: null, referred_by: null, referrals: [], archived_at: null, updated_at: '2026-10-01T00:00:00Z',
} as Prospect

const routes = [
  { path: '/prospects/new', element: <ProspectFormPage /> },
  { path: '/prospects/:id/edit', element: <ProspectFormPage /> },
  { path: '/prospects/:id', element: <p>Profile page</p> },
]

beforeEach(() => {
  vi.spyOn(prospectService, 'options').mockResolvedValue(options)
  vi.spyOn(prospectService, 'duplicates').mockResolvedValue({ matches: [] })
})

describe('prospect form', () => {
  it('creates a prospect with an initial follow-up and opens the profile', async () => {
    const create = vi.spyOn(prospectService, 'create').mockResolvedValue({ ...existing, id: 42, full_name: 'Maria Santos' })
    renderRoutes(routes, '/prospects/new')
    await userEvent.type(await screen.findByLabelText(/first name/i), 'Maria')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Santos')
    await userEvent.type(screen.getByLabelText(/mobile number/i), '0917 123 4567')
    await userEvent.click(await screen.findByRole('button', { name: 'Health' }))
    await userEvent.click(screen.getByRole('button', { name: /save prospect/i }))

    await waitFor(() => expect(create).toHaveBeenCalledOnce())
    const payload = create.mock.calls[0]![0]
    expect(payload).toMatchObject({ first_name: 'Maria', last_name: 'Santos', mobile: '0917 123 4567', insurance_interests: [5], status: 'new_lead' })
    expect(payload.initial_follow_up).toMatchObject({ activity_type: 'call', subject: 'Introductory call' })
    expect(payload.initial_follow_up?.scheduled_at).toMatch(/Z$/)
    expect(await screen.findByText('Profile page')).toBeInTheDocument()
  })

  it('shows inline validation and does not submit', async () => {
    const create = vi.spyOn(prospectService, 'create')
    renderRoutes(routes, '/prospects/new')
    await userEvent.click(await screen.findByRole('button', { name: /save prospect/i }))
    expect(await screen.findByText('First name is required.')).toBeInTheDocument()
    expect(screen.getByText('Provide a mobile number or an email address.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('maps server field errors onto the form', async () => {
    vi.spyOn(prospectService, 'create').mockRejectedValue(
      new ApiError(400, { detail: 'Please correct the highlighted fields.', code: 'validation_error', errors: { email: ['This email is not allowed.'] } }, ''),
    )
    renderRoutes(routes, '/prospects/new')
    await userEvent.type(await screen.findByLabelText(/first name/i), 'Maria')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Santos')
    await userEvent.type(screen.getByLabelText(/email address/i), 'maria@example.com')
    await userEvent.click(screen.getByRole('button', { name: /save prospect/i }))
    expect(await screen.findByText('This email is not allowed.')).toBeInTheDocument()
  })

  it('warns about possible duplicates without blocking', async () => {
    vi.mocked(prospectService.duplicates).mockResolvedValue({
      matches: [{ id: 3, full_name: 'Maria Santos', mobile: '0917 123 4567', email: '', status: 'contacted', status_label: 'Contacted', is_archived: false, matched_on: ['mobile'] }],
    })
    renderRoutes(routes, '/prospects/new')
    await userEvent.type(await screen.findByLabelText(/mobile number/i), '0917 123 4567')
    expect(await screen.findByText(/possible duplicate/i, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Maria Santos' })).toHaveAttribute('href', '/prospects/3')
  })

  it('edits an existing prospect without sending status', async () => {
    vi.spyOn(prospectService, 'get').mockResolvedValue(existing)
    const update = vi.spyOn(prospectService, 'update').mockResolvedValue({ ...existing, occupation: 'Head Nurse' })
    renderRoutes(routes, '/prospects/9/edit')
    const occupation = await screen.findByLabelText(/occupation/i)
    expect(occupation).toHaveValue('Nurse')
    await userEvent.clear(occupation)
    await userEvent.type(occupation, 'Head Nurse')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(update).toHaveBeenCalledOnce())
    const [id, payload] = update.mock.calls[0]!
    expect(id).toBe(9)
    expect(payload).toMatchObject({ occupation: 'Head Nurse' })
    expect(payload).not.toHaveProperty('status')
    expect(payload).not.toHaveProperty('initial_follow_up')
  })
})
