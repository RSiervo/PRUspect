import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { navItemsFor } from '@/components/layout/nav'
import { teamService } from '@/services'

import { renderWithProviders } from './utils'

const { TeamPage } = await import('@/features/team/TeamPage')

describe('team view', () => {
  it('shows the Team menu item only to managers', () => {
    expect(navItemsFor(false, false).some((i) => i.to === '/team')).toBe(false)
    expect(navItemsFor(false, true).some((i) => i.to === '/team')).toBe(true)
  })

  it('lists members with totals only', async () => {
    vi.spyOn(teamService, 'get').mockResolvedValue({
      members: [{ id: 2, full_name: 'Ana Reyes', email: 'ana@example.com', last_login: null, prospects: 14, new_this_month: 3, follow_ups_today: 2, overdue: 1, appointments_week: 4, policies_this_month: 1, issued_premium_this_month: '36000.00', conversion_rate: 12.5 }],
      totals: { prospects: 14, new_this_month: 3, follow_ups_today: 2, overdue: 1, appointments_week: 4, policies_this_month: 1 },
      note: 'Totals only.',
    })
    renderWithProviders(<TeamPage />)
    expect((await screen.findAllByText('Ana Reyes')).length).toBeGreaterThan(0)
    expect(screen.getByText(/each advisor’s prospects stay private/i)).toBeInTheDocument()
  })
})
