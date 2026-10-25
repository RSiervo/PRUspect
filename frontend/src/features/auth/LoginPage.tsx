import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { FormField } from '@/components/forms/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError, errorMessage } from '@/lib/api'
import { loginSchema, type LoginValues } from '@/schemas'

import { AuthLayout, OrDivider } from './AuthLayout'
import { useAuth } from './AuthProvider'
import { GoogleButton, useAuthConfig } from './GoogleButton'
import { TwoFactorStep } from './TwoFactorStep'

function friendlyError(error: unknown) {
  return error instanceof ApiError && error.code === 'throttled'
    ? 'Too many sign-in attempts. Please wait a minute and try again.'
    : errorMessage(error)
}

export function LoginPage() {
  const { login, loginWithGoogle, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: config } = useAuthConfig()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)
  const state = location.state as { from?: string; challenge?: string } | null
  const from = state?.from ?? '/'
  const [challenge, setChallenge] = useState<string | null>(state?.challenge ?? null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  if (status === 'authenticated') return <Navigate to={from} replace />

  if (challenge) {
    return (
      <AuthLayout mobileTitle="Two-step verification" mobileSubtitle="One more step to keep your account safe.">
        <TwoFactorStep
          challenge={challenge}
          onSignedIn={() => navigate(from, { replace: true })}
          onCancel={(message) => {
            setChallenge(null)
            setFormError(message ?? null)
          }}
        />
      </AuthLayout>
    )
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      const result = await login(values.email, values.password)
      if (result.twoFactor) setChallenge(result.challenge)
      else navigate(from, { replace: true })
    } catch (error) {
      setFormError(friendlyError(error))
    }
  })

  const onGoogle = async (credential: string) => {
    setFormError(null)
    setGoogleBusy(true)
    try {
      const result = await loginWithGoogle(credential)
      if (result.twoFactor) {
        setChallenge(result.challenge)
        return
      }
      if (result.created) toast.success('Welcome to PRUspect!', { description: 'Your account is ready.' })
      navigate(from, { replace: true })
    } catch (error) {
      setFormError(friendlyError(error))
    } finally {
      setGoogleBusy(false)
    }
  }

  const googleClientId = config?.google_client_id

  return (
    <AuthLayout mobileTitle="Your goals. Our priority." mobileSubtitle="Sign in to manage your prospects.">
      <h2 className="text-xl font-semibold text-ink-900">Welcome back</h2>
      <p className="mt-1 text-sm text-ink-500">Sign in to your account.</p>

      {googleClientId && (
        <>
          <div className="mt-6" aria-busy={googleBusy}>
            <GoogleButton clientId={googleClientId} mode="signin" onCredential={onGoogle} onError={setFormError} />
          </div>
          <OrDivider />
        </>
      )}

      <form className={googleClientId ? 'space-y-4' : 'mt-6 space-y-4'} onSubmit={onSubmit} noValidate>
        <FormField label="Email" error={errors.email?.message} required>
          <Input type="email" autoComplete="username" placeholder="you@example.com" {...register('email')} />
        </FormField>
        <div className="relative">
          <FormField label="Password" error={errors.password?.message} required>
            <Input type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="pr-11" {...register('password')} />
          </FormField>
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute top-[27px] right-2 rounded-lg p-1.5 text-ink-400 hover:text-ink-700"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {formError && (
          <p role="alert" className="rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-800">
            {formError}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting || googleBusy}>
          <Lock /> Sign in
        </Button>
      </form>

      {config?.google_signup_enabled ? (
        <p className="mt-6 text-center text-sm text-ink-600">
          New to PRUspect?{' '}
          <Link to="/signup" className="font-medium text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>
      ) : (
        <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-ink-500">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          Accounts are created by the administrator.
        </p>
      )}
    </AuthLayout>
  )
}
