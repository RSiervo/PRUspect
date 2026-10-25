import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { followUpService, notificationService } from '@/services'

import { renderRoutes } from './utils'

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    status: 'authenticated',
    user: { id: 1, email: 'john@example.com', first_name: 'John', last_name: 'Mendoza', full_name: 'John Mendoza', job_title: 'Financial Advisor', time_zone: 'Asia/Manila' },
    login: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  }),
}))

const { AppLayout } = await import('@/components/layout/AppLayout')

beforeEach(() => {
  vi.spyOn(followUpService, 'summary').mockResolvedValue({ overdue: 2, today: 3, upcoming: 1, completed: 0, canceled: 0 })
  vi.spyOn(notificationService, 'list').mockResolvedValue({ count: 0, page: 1, page_size: 20, total_pages: 1, next: null, previous: null, results: [], unread_count: 0 })
})

function renderLayout() {
  return renderRoutes([{ element: <AppLayout />, children: [{ path: '/', element: <p>Page body</p> }, { path: '/reports', element: <p>Reports body</p> }] }], '/')
}

describe('responsive navigation', () => {
  it('renders every section in the desktop sidebar with the due follow-up badge', async () => {
    renderLayout()
    const sidebar = screen.getByRole('complementary', { name: /main navigation/i })
    for (const label of ['Dashboard', 'Prospects', 'Follow-ups', 'Calendar', 'Activities', 'Sales Pipeline', 'Reports', 'Settings']) {
      expect(within(sidebar).getByRole('link', { name: new RegExp(label) })).toBeInTheDocument()
    }
    expect(await within(sidebar).findByLabelText('5 due or overdue')).toBeInTheDocument()
  })

  it('offers a bottom bar and a drawer with all sections on phones', async () => {
    renderLayout()
    const bottom = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(bottom).getByRole('link', { name: /home/i })).toHaveAttribute('href', '/')
    await userEvent.click(within(bottom).getByRole('button', { name: /more navigation/i }))
    const drawer = await screen.findByRole('dialog')
    await userEvent.click(within(drawer).getByRole('link', { name: /reports/i }))
    expect(await screen.findByText('Reports body')).toBeInTheDocument()
  })
})

describe('phone bottom bar', () => {
  it('has a center add-prospect button that becomes the active item', async () => {
    renderRoutes(
      [{ element: <AppLayout />, children: [{ path: '/', element: <p>Page body</p> }, { path: '/prospects/new', element: <p>New prospect form</p> }] }],
      '/',
    )
    const bottom = screen.getByRole('navigation', { name: 'Primary' })
    const add = within(bottom).getByRole('link', { name: 'Add prospect' })
    expect(add).toHaveAttribute('href', '/prospects/new')
    await userEvent.click(add)
    expect(await screen.findByText('New prospect form')).toBeInTheDocument()
    expect(within(bottom).getByRole('link', { name: 'Add prospect' })).toHaveAttribute('aria-current', 'page')
    expect(within(bottom).getByRole('link', { name: /prospects/i, current: false })).toBeInTheDocument()
  })
})
