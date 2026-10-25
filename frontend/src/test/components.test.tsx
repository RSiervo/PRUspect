import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EmptyState, ErrorState } from '@/components/data-display/states'
import { ApiError } from '@/lib/api'
import { prospectService } from '@/services'

import { renderRoutes, renderWithProviders } from './utils'

const auth = vi.hoisted(() => ({ value: { status: 'anonymous' as string, user: null as unknown, login: vi.fn(), logout: vi.fn(), setUser: vi.fn() } }))
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => auth.value }))

const { RequireAuth } = await import('@/features/auth/RequireAuth')
const { LoginPage } = await import('@/features/auth/LoginPage')
const { StatusChanger } = await import('@/features/prospects/ChangeStatus')

beforeEach(() => {
  auth.value = { status: 'anonymous', user: null, login: vi.fn(), logout: vi.fn(), setUser: vi.fn() }
})

describe('protected routes', () => {
  const routes = [
    { path: '/login', element: <p>Login screen</p> },
    { element: <RequireAuth />, children: [{ path: '/', element: <p>Secret dashboard</p> }] },
  ]

  it('redirects anonymous users to the login page', async () => {
    renderRoutes(routes, '/')
    expect(await screen.findByText('Login screen')).toBeInTheDocument()
    expect(screen.queryByText('Secret dashboard')).not.toBeInTheDocument()
  })

  it('shows a loading state while the session is restored', () => {
    auth.value.status = 'loading'
    renderRoutes(routes, '/')
    expect(screen.getByRole('status', { name: /loading your workspace/i })).toBeInTheDocument()
  })

  it('renders the page for signed-in users', async () => {
    auth.value.status = 'authenticated'
    renderRoutes(routes, '/')
    expect(await screen.findByText('Secret dashboard')).toBeInTheDocument()
  })
})

describe('login page', () => {
  it('validates fields before calling the API', async () => {
    renderWithProviders(<LoginPage />, '/login')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText('Enter your email.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(auth.value.login).not.toHaveBeenCalled()
  })

  it('shows the server error for wrong credentials', async () => {
    auth.value.login = vi.fn().mockRejectedValue(new ApiError(401, { detail: 'Incorrect email or password.', code: 'invalid_credentials', errors: {} }, ''))
    renderWithProviders(<LoginPage />, '/login')
    await userEvent.type(screen.getByLabelText(/email/i), 'a@example.com')
    await userEvent.type(screen.getByLabelText(/^password/i), 'wrong-pass')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
  })
})

describe('status changes', () => {
  it('applies an active stage directly', async () => {
    const spy = vi.spyOn(prospectService, 'changeStatus').mockResolvedValue({ status: 'contacted' } as never)
    renderWithProviders(<StatusChanger prospectId={7} prospectName="Maria Santos" status="new_lead" />)
    await userEvent.click(screen.getByRole('button', { name: /change status/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /^contacted$/i }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith(7, 'contacted', ''))
  })

  it('asks for confirmation and a reason before closing as lost', async () => {
    const spy = vi.spyOn(prospectService, 'changeStatus').mockResolvedValue({ status: 'lost' } as never)
    renderWithProviders(<StatusChanger prospectId={7} prospectName="Maria Santos" status="contacted" />)
    await userEvent.click(screen.getByRole('button', { name: /change status/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /not interested/i }))
    expect(spy).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.type(screen.getByLabelText(/reason/i), 'Budget')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith(7, 'lost', 'Budget'))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
  })
})

describe('state components', () => {
  it('renders empty state with an action', () => {
    renderWithProviders(<EmptyState title="No prospects yet" action={<button>Add</button>} />)
    expect(screen.getByText('No prospects yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })

  it('renders error state with retry', async () => {
    const retry = vi.fn()
    renderWithProviders(<ErrorState error={new Error('Server unavailable')} onRetry={retry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Server unavailable')
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(retry).toHaveBeenCalled()
  })
})
