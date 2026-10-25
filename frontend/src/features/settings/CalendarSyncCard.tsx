import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarSync, Copy, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, Skeleton, Switch } from '@/components/ui/misc'
import { api, errorMessage } from '@/lib/api'

interface FeedInfo {
  enabled: boolean
  url: string | null
  webcal_url: string | null
  show_names: boolean
}

const feedService = {
  get: () => api.get<FeedInfo>('/settings/calendar-feed/'),
  enable: (show_names: boolean) => api.post<FeedInfo>('/settings/calendar-feed/', { show_names }),
  update: (show_names: boolean) => api.patch<FeedInfo>('/settings/calendar-feed/', { show_names }),
  disable: () => api.delete<FeedInfo>('/settings/calendar-feed/'),
}

/** Private iCal link so PRUspect appointments appear in Google/Apple/Outlook calendars. */
export function CalendarSyncCard() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['calendar-feed'], queryFn: feedService.get })
  const [confirm, setConfirm] = useState<'replace' | 'off' | null>(null)
  const onSaved = (info: FeedInfo) => queryClient.setQueryData(['calendar-feed'], info)
  const enable = useMutation({ mutationFn: () => feedService.enable(data?.show_names ?? true), onSuccess: (i) => { onSaved(i); setConfirm(null) }, onError: (e) => toast.error(errorMessage(e)) })
  const toggleNames = useMutation({ mutationFn: (v: boolean) => feedService.update(v), onSuccess: onSaved, onError: (e) => toast.error(errorMessage(e)) })
  const disable = useMutation({ mutationFn: feedService.disable, onSuccess: (i) => { onSaved(i); setConfirm(null); toast.success('Calendar link turned off') }, onError: (e) => toast.error(errorMessage(e)) })

  const copy = async () => {
    if (!data?.url) return
    try {
      await navigator.clipboard.writeText(data.url)
      toast.success('Link copied')
    } catch {
      toast.message('Select the link and copy it')
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader title="Calendar sync" description="See your PRUspect appointments in Google Calendar, Apple Calendar or Outlook." />
      <div className="space-y-4 p-5">
        {isLoading || !data ? (
          <Skeleton className="h-10" />
        ) : !data.enabled ? (
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-start gap-2 text-sm text-ink-600">
              <CalendarSync className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
              Create a private link your calendar app can subscribe to. It updates automatically.
            </p>
            <Button onClick={() => enable.mutate()} loading={enable.isPending}>
              Create link
            </Button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <Input readOnly value={data.url ?? ''} aria-label="Calendar link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button variant="secondary" onClick={copy} aria-label="Copy link">
                <Copy />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" asChild>
                <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(data.webcal_url ?? '')}`} target="_blank" rel="noreferrer">
                  Add to Google Calendar
                </a>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <a href={data.webcal_url ?? '#'}>Subscribe on iPhone / Mac</a>
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-ink-500">
              Outlook: Add calendar → Subscribe from web → paste the link. Calendar apps refresh subscriptions on their own schedule (Google can take several hours).
            </p>
            <label className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 p-3">
              <span>
                <span className="block text-sm text-ink-800">Show prospect names in the calendar</span>
                <span className="block text-xs text-ink-500">Turn off if others can see your calendar.</span>
              </span>
              <Switch checked={data.show_names} onCheckedChange={(v) => toggleNames.mutate(v)} aria-label="Show prospect names in the calendar" />
            </label>
            <p className="text-xs text-amber-800">Keep this link private — anyone with it can see these appointments.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirm('replace')}>
                <RefreshCw /> Replace link
              </Button>
              <Button variant="ghost" size="sm" className="text-brand-700" onClick={() => setConfirm('off')}>
                Turn off
              </Button>
            </div>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'replace' ? 'Replace the calendar link?' : 'Turn off the calendar link?'}
        description={confirm === 'replace' ? 'The old link stops working. You’ll need to subscribe again with the new one.' : 'Calendars subscribed with this link stop receiving updates.'}
        confirmLabel={confirm === 'replace' ? 'Replace' : 'Turn off'}
        tone="danger"
        loading={enable.isPending || disable.isPending}
        onConfirm={() => (confirm === 'replace' ? enable.mutate() : disable.mutate())}
      />
    </Card>
  )
}
