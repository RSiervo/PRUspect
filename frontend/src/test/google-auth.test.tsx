import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authService } from '@/services'

import { renderRoutes } from './utils'

const auth = vi.hoisted(() => ({ value: { status: 'anonymous', user: null, login: vi.fn(), loginWithGoogle: vi.fn(), logout: vi.fn(), setUser: vi.fn() } }))
vi.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => auth.value }))

const { LoginPage } = await import('@/features/auth/LoginPage')
const { SignupPage } = await import('@/features/auth/SignupPage')

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
]

beforeEach(() => {
  auth.value = { status: 'anonymous', user: null, login: vi.fn(), loginWithGoogle: vi.fn(), logout: vi.fn(), setUser: vi.fn() }
})

describe('Google sign-in and sign-up', () => {
  it('shows the Google button and a sign-up link when Google is configured', async () => {
    vi.spyOn(authService, 'config').mockResolvedValue({ google_client_id: 'abc.apps.googleusercontent.com', google_signup_enabled: true, google_allowed_domains: [] })
    renderRoutes(routes, '/login')
    expect(await screen.findByTestId('google-button')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup')
    // Google's script is requested only once the feature is configured.
    expect(document.querySelector('script[src="https://accounts.google.com/gsi/client"]')).not.toBeNull()
  })

  it('keeps password sign-in only when Google is not configured', async () => {
    vi.spyOn(authService, 'config').mockResolvedValue({ google_client_id: null, google_signup_enabled: false, google_allowed_domains: [] })
    renderRoutes(routes, '/login')
    expect(await screen.findByText(/Accounts are created by the administrator/)).toBeInTheDocument()
    expect(screen.queryByTestId('google-button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create an account' })).not.toBeInTheDocument()
  })

  it('offers Google sign-up on the sign-up page and lists allowed domains', async () => {
    vi.spyOn(authService, 'config').mockResolvedValue({ google_client_id: 'abc.apps.googleusercontent.com', google_signup_enabled: true, google_allowed_domains: ['mycompany.com'] })
    renderRoutes(routes, '/signup')
    expect(await screen.findByTestId('google-button')).toBeInTheDocument()
    expect(screen.getByText('Available for @mycompany.com accounts.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('explains when sign-up is closed', async () => {
    vi.spyOn(authService, 'config').mockResolvedValue({ google_client_id: 'abc.apps.googleusercontent.com', google_signup_enabled: false, google_allowed_domains: [] })
    renderRoutes(routes, '/signup')
    expect(await screen.findByText(/Sign-up isn’t open right now/)).toBeInTheDocument()
    expect(screen.queryByTestId('google-button')).not.toBeInTheDocument()
  })
})
