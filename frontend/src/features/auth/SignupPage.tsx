import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Skeleton } from '@/components/ui/misc'
import { errorMessage } from '@/lib/api'

import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { GoogleButton, useAuthConfig } from './GoogleButton'

const PERKS = [
  'Your own private workspace — no one else can see your prospects',
  'Track follow-ups, appointments and your sales pipeline',
  'Free to start; sign in any time with the same Google account',
]

export function SignupPage() {
  const { loginWithGoogle, status } = useAuth()
  const navigate = useNavigate()
  const { data: config, isLoading } = useAuthConfig()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'authenticated') return <Navigate to="/" replace />

  const onGoogle = async (credential: string) => {
    setError(null)
    setBusy(true)
    try {
      const created = await loginWithGoogle(credential)
      toast.success(created ? 'Welcome to PRUspect!' : 'Welcome back!', {
        description: created ? 'Your account is ready. Add your first prospect to get started.' : 'You already had an account, so we signed you in.',
      })
      navigate('/', { replace: true })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout mobileTitle="Create your account" mobileSubtitle="Start managing your prospects in minutes.">
      <h2 className="text-xl font-semibold text-ink-900">Create your account</h2>
      <p className="mt-1 text-sm text-ink-500">Sign up with your Google account — no new password to remember.</p>

      <ul className="mt-5 space-y-2.5">
        {PERKS.map((perk) => (
          <li key={perk} className="flex items-start gap-2 text-sm text-ink-700">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
            {perk}
          </li>
        ))}
      </ul>

      <div className="mt-6" aria-busy={busy}>
        {isLoading ? (
          <Skeleton className="h-11 rounded-full" />
        ) : config?.google_client_id && config.google_signup_enabled ? (
          <GoogleButton clientId={config.google_client_id} mode="signup" onCredential={onGoogle} onError={setError} />
        ) : (
          <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-sm text-ink-600">
            Sign-up isn’t open right now. Ask the administrator to create an account for you.
          </p>
        )}
      </div>
      {config?.google_allowed_domains && config.google_allowed_domains.length > 0 && (
        <p className="mt-2 text-center text-xs text-ink-500">Available for {config.google_allowed_domains.map((d) => `@${d}`).join(', ')} accounts.</p>
      )}
      {busy && <p className="mt-3 text-center text-sm text-ink-500" role="status">Setting up your account…</p>}
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-800">
          {error}
        </p>
      )}

      <p className="mt-6 text-center text-sm text-ink-600">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-ink-500">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        We only receive your name and email address from Google. You’re responsible for having permission to store your prospects’ information.
      </p>
    </AuthLayout>
  )
}
