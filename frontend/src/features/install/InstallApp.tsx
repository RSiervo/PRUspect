import { CheckCircle2, Download, MonitorSmartphone, PlusSquare, Share, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { LogoMark } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useLocalPreference } from '@/hooks'
import { useInstallApp } from '@/lib/pwa'

const BENEFITS = ['Opens full-screen from your home screen or desktop', 'Starts faster, like a native app', 'Shortcuts to Add prospect and today’s follow-ups']

function IosSteps() {
  return (
    <ol className="space-y-3 text-sm text-ink-700">
      <li className="flex items-start gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">1</span>
        <span>
          Open this page in <strong>Safari</strong> and tap the <Share className="inline size-4 align-[-3px] text-sky-600" aria-label="Share" /> <strong>Share</strong> button.
        </span>
      </li>
      <li className="flex items-start gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">2</span>
        <span>
          Scroll down and choose <PlusSquare className="inline size-4 align-[-3px]" aria-hidden /> <strong>Add to Home Screen</strong>.
        </span>
      </li>
      <li className="flex items-start gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">3</span>
        <span>
          Tap <strong>Add</strong>. PRUspect appears on your home screen.
        </span>
      </li>
    </ol>
  )
}

/** Explains and performs installation for the current device. */
export function InstallAppDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, install } = useInstallApp()
  const [busy, setBusy] = useState(false)

  const onInstall = async () => {
    setBusy(true)
    try {
      const accepted = await install()
      if (accepted) {
        toast.success('PRUspect installed', { description: 'Open it from your home screen or apps list.' })
        onOpenChange(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title="Install PRUspect"
        description="Use PRUspect like an app on this device."
        footer={
          state === 'available' ? (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Not now
              </Button>
              <Button onClick={onInstall} loading={busy}>
                <Download /> Install
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )
        }
      >
        <div className="flex items-center gap-3">
          <LogoMark className="size-12" />
          <div>
            <p className="font-semibold text-ink-900">PRUspect</p>
            <p className="text-xs text-ink-500">pruspect.vercel.app</p>
          </div>
        </div>

        {state === 'installed' ? (
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> You’re already using the installed app.
          </p>
        ) : (
          <>
            <ul className="mt-5 space-y-2">
              {BENEFITS.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-ink-700">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-line pt-5">
              {state === 'ios' ? (
                <IosSteps />
              ) : state === 'unsupported' ? (
                <p className="flex items-start gap-2 text-sm text-ink-600">
                  <MonitorSmartphone className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
                  Open PRUspect in <strong>Chrome</strong> or <strong>Edge</strong> (computer or Android), or <strong>Safari</strong> on iPhone, then use Install app. In Chrome you can also click the install icon at the right of the address bar.
                </p>
              ) : (
                <p className="text-sm text-ink-600">Tap <strong>Install</strong> and confirm. It takes a few seconds and uses very little space.</p>
              )}
            </div>
            <p className="mt-4 text-xs text-ink-400">Your prospect data stays on the server. The app only stores its own files on this device.</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Small dismissible prompt for phones, shown until installed or dismissed. */
export function InstallBanner() {
  const { state } = useInstallApp()
  const [dismissed, setDismissed] = useLocalPreference<boolean>('install-banner-dismissed', false)
  const [open, setOpen] = useState(false)
  if (dismissed || (state !== 'available' && state !== 'ios')) return null
  return (
    <>
      <div className="card flex items-center gap-3 p-3 md:hidden" role="region" aria-label="Install the app">
        <LogoMark className="size-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink-900">Install PRUspect</p>
          <p className="truncate text-xs text-ink-500">Open it from your home screen like an app.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          Install
        </Button>
        <button type="button" onClick={() => setDismissed(true)} className="rounded-md p-1 text-ink-400 hover:text-ink-700" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      </div>
      <InstallAppDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
