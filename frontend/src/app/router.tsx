import { Compass } from 'lucide-react'
import { createBrowserRouter, Link } from 'react-router'

import { EmptyState } from '@/components/data-display/states'
import { AppLayout } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { ActivitiesPage } from '@/features/activities/ActivitiesPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RequireAuth } from '@/features/auth/RequireAuth'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { FollowUpsPage } from '@/features/follow-ups/FollowUpsPage'
import { PipelinePage } from '@/features/pipeline/PipelinePage'
import { ProspectDetailPage } from '@/features/prospects/ProspectDetailPage'
import { ProspectFormPage } from '@/features/prospects/ProspectFormPage'
import { ProspectsPage } from '@/features/prospects/ProspectsPage'
import { ReportsPage } from '@/features/reports/ReportsPage'
import { SettingsPage } from '@/features/settings/SettingsPage'

function NotFound() {
  return (
    <div className="card">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you’re looking for doesn’t exist."
        action={
          <Button asChild variant="secondary">
            <Link to="/">Back to dashboard</Link>
          </Button>
        }
      />
    </div>
  )
}

export const routes = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'prospects', element: <ProspectsPage /> },
          { path: 'prospects/new', element: <ProspectFormPage /> },
          { path: 'prospects/:id', element: <ProspectDetailPage /> },
          { path: 'prospects/:id/edit', element: <ProspectFormPage /> },
          { path: 'follow-ups', element: <FollowUpsPage /> },
          { path: 'calendar', element: <CalendarPage /> },
          { path: 'activities', element: <ActivitiesPage /> },
          { path: 'pipeline', element: <PipelinePage /> },
          { path: 'reports', element: <ReportsPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(routes)
