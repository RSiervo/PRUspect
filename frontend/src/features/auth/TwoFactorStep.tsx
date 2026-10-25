import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { FormField } from '@/components/forms/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiError, errorMessage } from '@/lib/api'

import { useAuth } from './AuthProvider'

/** Second sign-in step: 6-digit code from the authenticator app, or a recovery code. */
export function TwoFactorStep({ challenge, onSignedIn, onCancel }: { challenge: string; onSignedIn: () => void; onCancel: (message?: string) => void }) {
  const { verifyTwoFactor } = useAuth()
  const [useRecovery, setUseRecovery] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    try {
      const result = await verifyTwoFactor(challenge, code)
      if (result.recoveryCodeUsed) {
        toast.warning(`Recovery code used — ${result.recoveryCodesLeft} left`, {
          description: result.recoveryCodesLeft <= 3 ? 'Create new recovery codes in Settings → Profile & security.' : undefined,
        })
      }
      onSignedIn()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'challenge_expired') onCancel(err.message)
      else if (err instanceof ApiError && err.code === 'throttled') setError('Too many attempts. Please wait a minute and try again.')
      else setError(errorMessage(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <ShieldCheck className="size-5" aria-hidden />
      </div>
      <h2 className="mt-4 text-xl font-semibold text-ink-900">Two-step verification</h2>
      <p className="mt-1 text-sm text-ink-500">
        {useRecovery ? 'Enter one of the recovery codes you saved. Each code works once.' : 'Open your authenticator app and enter the 6-digit code for PRUspect.'}
      </p>
      <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
        <FormField label={useRecovery ? 'Recovery code' : 'Code'} error={error ?? undefined}>
          {useRecovery ? (
            <Input key="recovery" autoFocus autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="xxxxx-xxxxx" maxLength={11} value={code} onChange={(e) => setCode(e.target.value)} className="font-mono tracking-wider" />
          ) : (
            <Input
              key="totp"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              placeholder="123456"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="text-center font-mono text-lg tracking-[0.4em]"
            />
          )}
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={useRecovery ? code.trim().length < 10 : code.length !== 6}>
          Verify and sign in
        </Button>
      </form>
      <div className="mt-5 flex items-center justify-between text-sm">
        <button type="button" className="inline-flex items-center gap-1 text-ink-600 hover:text-ink-900" onClick={() => onCancel()}>
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
        <button
          type="button"
          className="font-medium text-brand-700 hover:underline"
          onClick={() => {
            setUseRecovery((v) => !v)
            setCode('')
            setError(null)
          }}
        >
          {useRecovery ? 'Use the app code' : 'Use a recovery code'}
        </button>
      </div>
    </div>
  )
}
