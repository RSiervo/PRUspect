import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { messageLink, renderTemplate } from '@/lib/messaging'
import { activityService } from '@/services'

import { renderWithProviders } from './utils'

vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { full_name: 'John Mendoza' } }) }))
const { OutcomeDialog, useContactTracker } = await import('@/features/contact/ContactFlow')

describe('message templates', () => {
  it('fills placeholders and falls back to the first name', () => {
    const text = renderTemplate('Hi {preferred_name}, this is {advisor_name}. {unknown}', { first_name: 'Maria', last_name: 'Santos', advisor_name: 'John' })
    expect(text).toBe('Hi Maria, this is John. {unknown}')
  })

  it('builds links for each app with the message encoded', () => {
    const to = { mobile: '0917 123 4567', email: 'maria@example.com' }
    expect(messageLink('sms', to, 'Hi & hello')).toBe('sms:+639171234567?&body=Hi%20%26%20hello')
    expect(messageLink('whatsapp', to, 'Hi')).toBe('https://wa.me/639171234567?text=Hi')
    expect(messageLink('email', to, 'Body', 'Subj')).toBe('mailto:maria%40example.com?subject=Subj&body=Body')
    expect(messageLink('email', { mobile: '0917' }, 'x')).toBeNull()
  })
})

function Harness() {
  const tracker = useContactTracker()
  return (
    <>
      <a href="#" onClick={(e) => { e.preventDefault(); tracker.track({ id: 5, full_name: 'Maria Santos', first_name: 'Maria', last_name: 'Santos' }, 'call') }}>
        Call Maria
      </a>
      <OutcomeDialog contact={tracker.asking} onClose={tracker.close} />
    </>
  )
}

describe('"How did it go?" after a call', () => {
  it('asks when the user comes back and logs the activity', async () => {
    const create = vi.spyOn(activityService, 'create').mockResolvedValue({} as never)
    const now = vi.spyOn(Date, 'now')
    renderWithProviders(<Harness />)
    now.mockReturnValue(1_000_000)
    await userEvent.click(screen.getByText('Call Maria'))
    act(() => { window.dispatchEvent(new Event('blur')) })
    now.mockReturnValue(1_000_000 + 60_000) // back after a minute
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(await screen.findByText('How did the call with Maria go?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Interested' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ prospect: 5, activity_type: 'call', outcome: 'Interested' })))
    now.mockRestore()
  })

  it('does not ask after a quick flicker', async () => {
    const now = vi.spyOn(Date, 'now')
    renderWithProviders(<Harness />)
    now.mockReturnValue(2_000_000)
    await userEvent.click(screen.getByText('Call Maria'))
    act(() => { window.dispatchEvent(new Event('blur')) })
    now.mockReturnValue(2_000_000 + 500)
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(screen.queryByText(/How did the call/)).not.toBeInTheDocument()
    now.mockRestore()
  })
})
