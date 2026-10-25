import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardHeader, Skeleton } from '@/components/ui/misc'
import { api, errorMessage } from '@/lib/api'
import { isIos, isStandalone } from '@/lib/pwa'

interface PushConfig {
  enabled: boolean
  public_key: string | null
  devices: number
}

const pushService = {
  config: () => api.get<PushConfig>('/push/config/'),
  subscribe: (subscription: PushSubscriptionJSON) => api.post('/push/subscribe/', { subscription }),
  unsubscribe: (endpoint: string) => api.delete('/push/subscribe/', { endpoint }),
  test: () => api.post<{ delivered: number }>('/push/test/'),
}

function urlBase64ToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** Turn phone/desktop notifications on or off for this device. */
export function PushCard() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['push-config'], queryFn: pushService.config })
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [checked, setChecked] = useState(!supported)

  useEffect(() => {
    if (!supported) return
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then(setSubscription)
      .catch(() => setSubscription(null))
      .finally(() => setChecked(true))
  }, [])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['push-config'] })

  const turnOn = useMutation({
    mutationFn: async () => {
      if (!data?.public_key) throw new Error('Notifications aren’t set up on the server yet.')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in your browser or phone settings.')
      const reg = await navigator.serviceWorker.ready
      let sub: PushSubscription
      try {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.public_key) })
      } catch {
        throw new Error('This browser couldn’t turn on notifications. Try Chrome, Edge or the installed app, and check that notifications are allowed.')
      }
      await pushService.subscribe(sub.toJSON())
      return sub
    },
    onSuccess: (sub) => {
      setSubscription(sub)
      void refresh()
      toast.success('Notifications are on for this device')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const turnOff = useMutation({
    mutationFn: async () => {
      if (!subscription) return
      await pushService.unsubscribe(subscription.endpoint).catch(() => undefined)
      await subscription.unsubscribe()
    },
    onSuccess: () => {
      setSubscription(null)
      void refresh()
      toast.success('Notifications are off for this device')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const test = useMutation({
    mutationFn: pushService.test,
    onSuccess: (r) => (r.delivered ? toast.success('Test sent — check your notifications') : toast.message('No device received it. Try turning notifications off and on again.')),
    onError: (e) => toast.error(errorMessage(e)),
  })

  let body: React.ReactNode
  if (isLoading || !checked) {
    body = <Skeleton className="h-10" />
  } else if (!data?.enabled) {
    body = <p className="text-sm text-ink-600">Notifications aren’t set up on the server yet. In-app reminders still work.</p>
  } else if (!supported) {
    body = (
      <p className="text-sm text-ink-600">
        {isIos() && !isStandalone()
          ? 'On iPhone/iPad, first install the app (Share → Add to Home Screen), then open it from your home screen and turn notifications on here.'
          : 'This browser doesn’t support notifications.'}
      </p>
    )
  } else if (subscription) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <BellRing className="size-4" aria-hidden /> On for this device
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => test.mutate()} loading={test.isPending}>
            Send a test
          </Button>
          <Button variant="ghost" size="sm" onClick={() => turnOff.mutate()} loading={turnOff.isPending}>
            Turn off
          </Button>
        </div>
      </div>
    )
  } else {
    body = (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-600">Get reminders for overdue follow-ups, upcoming appointments and client dates.</p>
        <Button onClick={() => turnOn.mutate()} loading={turnOn.isPending}>
          Turn on
        </Button>
      </div>
    )
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader
        title="Phone notifications"
        description={data?.devices ? `Turned on for ${data.devices} device${data.devices === 1 ? '' : 's'}.` : 'Reminders on your phone or computer, even when PRUspect is closed.'}
      />
      <div className="space-y-3 p-5">
        {body}
        <p className="text-xs text-ink-500">Notifications show only a short reminder. Open PRUspect to see the details.</p>
      </div>
    </Card>
  )
}
