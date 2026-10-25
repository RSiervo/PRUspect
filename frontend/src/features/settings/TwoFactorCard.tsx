import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { FormField } from '@/components/forms/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, Skeleton } from '@/components/ui/misc'
import { useAuth } from '@/features/auth/AuthProvider'
import { errorMessage } from '@/lib/api'
import { twoFactorService } from '@/services'
import type { TwoFactorSetup } from '@/types/api'

function CodeInput({ value, onChange, allowRecovery = false }: { value: string; onChange: (v: string) => void; allowRecovery?: boolean }) {
  return (
    <Input
      autoFocus
      inputMode={allowRecovery ? 'text' : 'numeric'}
      autoComplete="one-time-code"
      placeholder={allowRecovery ? '123456 or recovery code' : '123456'}
      maxLength={allowRecovery ? 11 : 6}
      value={value}
      onChange={(e) => onChange(allowRecovery ? e.target.value : e.target.value.replace(/\D/g, ''))}
      className="font-mono tracking-widest"
    />
  )
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = `PRUspect recovery codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Recovery codes copied')
    } catch {
      toast.message('Select the codes and copy them')
    }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'pruspect-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-700">
        If you lose your phone, sign in with one of these codes. <strong>They are shown only once.</strong> Save them in a password manager or print them.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-xl bg-ink-50 p-4 font-mono text-sm text-ink-900">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={copy}><Copy /> Copy</Button>
        <Button variant="secondary" size="sm" onClick={download}><Download /> Download</Button>
        <div className="flex-1" />
        <Button size="sm" onClick={onDone}>I saved them</Button>
      </div>
    </div>
  )
}

type Step = { kind: 'setup'; data: TwoFactorSetup } | { kind: 'codes'; codes: string[] } | { kind: 'disable' } | { kind: 'renew' } | null

export function TwoFactorCard() {
  const { user, setUser } = useAuth()
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['two-factor'], queryFn: twoFactorService.status })
  const [step, setStep] = useState<Step>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = (enabled: boolean) => {
    void queryClient.invalidateQueries({ queryKey: ['two-factor'] })
    if (user) setUser({ ...user, two_factor_enabled: enabled })
  }
  const close = () => {
    setStep(null)
    setCode('')
    setError(null)
  }

  const setup = useMutation({ mutationFn: twoFactorService.setup, onSuccess: (d) => setStep({ kind: 'setup', data: d }), onError: (e) => toast.error(errorMessage(e)) })
  const confirm = useMutation({
    mutationFn: () => twoFactorService.confirm(code),
    onSuccess: (r) => {
      refresh(true)
      setCode('')
      setStep({ kind: 'codes', codes: r.recovery_codes })
      toast.success('Two-step verification is on')
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const disable = useMutation({
    mutationFn: () => twoFactorService.disable(code),
    onSuccess: () => {
      refresh(false)
      close()
      toast.success('Two-step verification is off')
    },
    onError: (e) => setError(errorMessage(e)),
  })
  const renew = useMutation({
    mutationFn: () => twoFactorService.recoveryCodes(code),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['two-factor'] })
      setCode('')
      setStep({ kind: 'codes', codes: r.recovery_codes })
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const copySecret = async (secret: string) => {
    try {
      await navigator.clipboard.writeText(secret)
      toast.success('Key copied')
    } catch {
      toast.message('Select the key and copy it')
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Two-step verification"
        description="After your password or Google, also enter a code from an authenticator app on your phone."
        action={data?.enabled ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">On</span> : undefined}
      />
      <div className="space-y-3 p-5">
        {isLoading || !data ? (
          <Skeleton className="h-10" />
        ) : data.enabled ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm text-ink-700">
              <ShieldCheck className="size-4 text-emerald-600" aria-hidden />
              {data.recovery_codes_left} recovery code{data.recovery_codes_left === 1 ? '' : 's'} left
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setStep({ kind: 'renew' })}><KeyRound /> New recovery codes</Button>
              <Button variant="ghost" size="sm" className="text-brand-700" onClick={() => setStep({ kind: 'disable' })}>Turn off</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            {data.required ? (
              <p className="flex items-start gap-2 text-sm text-amber-800">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                Required for admin accounts. Admin pages stay locked until it’s on.
              </p>
            ) : (
              <p className="text-sm text-ink-600">Works with Google Authenticator, Microsoft Authenticator, 1Password and similar apps.</p>
            )}
            <Button onClick={() => setup.mutate()} loading={setup.isPending}>Turn on</Button>
          </div>
        )}
      </div>

      <Dialog open={step !== null} onOpenChange={(o) => !o && step?.kind !== 'codes' && close()}>
        {step?.kind === 'setup' && (
          <DialogContent title="Set up two-step verification" description="Scan the QR code with your authenticator app, then enter the 6-digit code it shows.">
            <form className="space-y-4 px-5 py-5 sm:px-6" onSubmit={(e) => { e.preventDefault(); confirm.mutate() }}>
              <img src={step.data.qr_svg} alt="QR code for your authenticator app" className="mx-auto size-48 rounded-xl ring-1 ring-line" />
              <div className="rounded-xl bg-ink-50 p-3 text-xs text-ink-600">
                <p>Can’t scan? Enter this key in the app:</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 font-mono text-sm break-all text-ink-900">{step.data.secret.match(/.{1,4}/g)?.join(' ')}</code>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => copySecret(step.data.secret)} aria-label="Copy key"><Copy /></Button>
                </div>
              </div>
              <FormField label="Code from the app" error={error ?? undefined}>
                <CodeInput value={code} onChange={setCode} />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
                <Button type="submit" loading={confirm.isPending} disabled={code.length !== 6}>Turn on</Button>
              </div>
            </form>
          </DialogContent>
        )}
        {step?.kind === 'codes' && (
          <DialogContent title="Save your recovery codes" onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
            <div className="px-5 py-5 sm:px-6"><RecoveryCodes codes={step.codes} onDone={close} /></div>
          </DialogContent>
        )}
        {(step?.kind === 'disable' || step?.kind === 'renew') && (
          <DialogContent
            title={step.kind === 'disable' ? 'Turn off two-step verification?' : 'Create new recovery codes?'}
            description={step.kind === 'disable'
              ? data?.required ? 'Admin pages will be locked until you turn it on again.' : 'Your account will be protected by your password or Google only.'
              : 'Your old recovery codes will stop working.'}
          >
            <form className="space-y-4 px-5 py-5 sm:px-6" onSubmit={(e) => { e.preventDefault(); if (step.kind === 'disable') disable.mutate(); else renew.mutate() }}>
              <FormField label={step.kind === 'disable' ? 'Code from the app (or a recovery code)' : 'Code from the app'} error={error ?? undefined}>
                <CodeInput value={code} onChange={setCode} allowRecovery={step.kind === 'disable'} />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
                <Button type="submit" variant={step.kind === 'disable' ? 'danger' : 'primary'} loading={disable.isPending || renew.isPending} disabled={code.trim().length < 6}>
                  {step.kind === 'disable' ? 'Turn off' : 'Create new codes'}
                </Button>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  )
}
