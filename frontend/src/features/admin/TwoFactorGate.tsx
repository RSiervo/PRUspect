import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/data-display/states'
import { Button } from '@/components/ui/button'
import type { User } from '@/types/api'

export function needsTwoFactor(user: User | null): boolean {
  return Boolean(user?.is_staff && user.two_factor_required && !user.two_factor_enabled)
}

/** Shown on admin pages until the admin turns on two-step verification. */
export function TwoFactorGate() {
  return (
    <div className="card">
      <EmptyState
        icon={ShieldAlert}
        title="Turn on two-step verification"
        description="Admin pages are protected. Set up an authenticator app on your phone first — it takes about a minute."
        action={
          <Button asChild>
            <Link to="/settings?tab=profile">Set it up</Link>
          </Button>
        }
      />
    </div>
  )
}
