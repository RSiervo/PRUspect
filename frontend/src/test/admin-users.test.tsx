import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { adminService, followUpService, notificationService } from '@/services'
import type { AdminUser } from '@/types/api'

import { renderRoutes } from './utils'

const auth = vi.hoisted(() => ({ isStaff: false }))
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'authenticated',
    user: { id: 1, email: 'admin@example.com', full_name: 'Admin', first_name: 'Admin', last_name: '', is_staff: auth.isStaff, time_zone: 'Asia/Manila' },
    login: vi.fn(), loginWithGoogle: vi.fn(), logout: vi.fn(), setUser: vi.fn(),
  }),
}))

const { AppLayout } = await import('@/components/layout/AppLayout')
const { AdminUsersPage } = await import('@/features/admin/AdminUsersPage')

const member: AdminUser = {
  id: 2, email: 'maria@gmail.com', full_name: 'Maria Santos', first_name: 'Maria', last_name: 'Santos', is_active: true,
  is_staff: false, is_superuser: false, date_joined: '2026-10-20T02:00:00Z', last_login: '2026-10-24T02:00:00Z',
  sign_in_methods: ['google'], prospect_count: 12, open_follow_up_count: 3, is_self: false,
}

beforeEach(() => {
  vi.spyOn(followUpService, 'summary').mockResolvedValue({ overdue: 0, today: 0, upcoming: 0, completed: 0, canceled: 0 })
  vi.spyOn(notificationService, 'list').mockResolvedValue({ count: 0, page: 1, page_size: 20, total_pages: 1, next: null, previous: null, results: [], unread_count: 0 })
  vi.spyOn(adminService, 'summary').mockResolvedValue({ total: 2, active: 2, inactive: 0, google: 1, new_this_week: 1, signed_in_this_week: 2 })
  vi.spyOn(adminService, 'users').mockResolvedValue({ count: 1, page: 1, page_size: 25, total_pages: 1, next: null, previous: null, results: [member] })
})

function renderLayout() {
  return renderRoutes([{ element: <AppLayout />, children: [{ path: '/', element: <p>Home</p> }] }], '/')
}

describe('admin users', () => {
  it('hides the Users menu item from non-admins', () => {
    auth.isStaff = false
    renderLayout()
    const sidebar = screen.getByRole('complementary', { name: /main navigation/i })
    expect(within(sidebar).queryByRole('link', { name: /^Users$/ })).not.toBeInTheDocument()
  })

  it('shows the Users menu item to admins', () => {
    auth.isStaff = true
    renderLayout()
    const sidebar = screen.getByRole('complementary', { name: /main navigation/i })
    expect(within(sidebar).getByRole('link', { name: /^Users$/ })).toHaveAttribute('href', '/admin/users')
  })

  it('tells non-admins the page is restricted and never calls the API', () => {
    auth.isStaff = false
    renderRoutes([{ path: '/admin/users', element: <AdminUsersPage /> }], '/admin/users')
    expect(screen.getByText('Admins only')).toBeInTheDocument()
    expect(adminService.users).not.toHaveBeenCalled()
  })

  it('lists users with counts and deactivates after confirmation', async () => {
    auth.isStaff = true
    const deactivate = vi.spyOn(adminService, 'deactivate').mockResolvedValue({ ...member, is_active: false })
    renderRoutes([{ path: '/admin/users', element: <AdminUsersPage /> }], '/admin/users')
    const row = (await screen.findAllByText('maria@gmail.com'))[0]!.closest('tr')!
    expect(within(row).getByText('12')).toBeInTheDocument()
    expect(within(row).getByText('Google')).toBeInTheDocument()
    await userEvent.click(within(row).getByRole('button', { name: /deactivate/i }))
    expect(deactivate).not.toHaveBeenCalled()
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }))
    await waitFor(() => expect(deactivate).toHaveBeenCalledWith(2))
  })
})
