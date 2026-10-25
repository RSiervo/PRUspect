import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { FormField } from '@/components/forms/FormField'
import { Logo, Mountains } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError, errorMessage } from '@/lib/api'
import { loginSchema, type LoginValues } from '@/schemas'

import { useAuth } from './AuthProvider'

export function LoginPage() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const reduce = useReducedMotion()
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  if (status === 'authenticated') return <Navigate to={from} replace />

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values.email, values.password)
      navigate(from, { replace: true })
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.code === 'throttled'
          ? 'Too many sign-in attempts. Please wait a minute and try again.'
          : errorMessage(error),
      )
    }
  })

  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-brand-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.22),transparent_45%)]" />
        <div className="relative flex h-full flex-col p-12 text-white">
          <Logo inverted />
          <div className="mt-auto mb-56 max-w-md">
            <h1 className="text-4xl leading-tight font-bold tracking-tight">
              Your goals.
              <br />
              Your clients’ priority.
            </h1>
            <p className="mt-4 text-base text-white/80">
              Manage your prospects, keep every follow-up on time, and see your pipeline at a glance.
            </p>
          </div>
        </div>
        <Mountains className="absolute inset-x-0 bottom-0 h-56 w-full" />
      </div>

      {/* Sign-in form */}
      <div className="flex flex-col">
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-500 to-brand-800 px-6 pt-10 pb-20 text-white lg:hidden">
          <Logo inverted />
          <h1 className="mt-8 text-2xl font-bold">Your goals. Our priority.</h1>
          <p className="mt-1 text-sm text-white/80">Sign in to manage your prospects.</p>
          <Mountains className="absolute inset-x-0 bottom-0 h-20 w-full" />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 py-8 sm:px-6 lg:items-center">
          <motion.div
            className="card relative z-10 -mt-16 w-full max-w-sm p-6 sm:p-8 lg:mt-0"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-xl font-semibold text-ink-900">Welcome back</h2>
            <p className="mt-1 text-sm text-ink-500">Sign in with your account email.</p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
              <FormField label="Email" error={errors.email?.message} required>
                <Input type="email" autoComplete="username" placeholder="you@example.com" {...register('email')} />
              </FormField>
              <div className="relative">
                <FormField label="Password" error={errors.password?.message} required>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="pr-11"
                    {...register('password')}
                  />
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
              <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
                <Lock /> Sign in
              </Button>
            </form>

            <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-ink-500">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              Public sign-up is disabled. Accounts are created by the administrator.
            </p>
          </motion.div>
        </div>
        <p className="pb-6 text-center text-xs text-ink-400">Secure · Private · Always with you</p>
      </div>
    </div>
  )
}
