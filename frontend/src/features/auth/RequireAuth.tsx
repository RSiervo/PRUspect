import { Navigate, Outlet, useLocation } from 'react-router'

import { Logo } from '@/components/layout/Logo'

import { useAuth } from './AuthProvider'

/**
 * Route guard for the signed-in area. This only improves UX — every API
 * endpoint enforces authentication and record ownership on the server.
 */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas" role="status" aria-label="Loading your workspace">
        <div className="flex flex-col items-center gap-4">
          <Logo className="animate-pulse" />
          <div className="h-1 w-32 overflow-hidden rounded-full bg-ink-100">
            <div className="skeleton h-full w-full" />
          </div>
        </div>
      </div>
    )
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}
