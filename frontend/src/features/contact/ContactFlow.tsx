import { useMutation, useQuery } from '@tanstack/react-query'
import { MessageSquareText } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { FormField } from '@/components/forms/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/misc'
import { useAuth } from '@/features/auth/AuthProvider'
import { errorMessage } from '@/lib/api'
import { addDaysKey, todayKey, zonedToIso } from '@/lib/datetime'
import { CHANNEL_LABEL, messageLink, renderTemplate } from '@/lib/messaging'
import { invalidateCrm } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { activityService, followUpService, templateService } from '@/services'
import type { ActivityType, MessageChannel } from '@/types/api'

export type ContactKind = 'call' | 'sms' | 'email' | 'whatsapp' | 'viber'

export interface ContactProspect {
  id: number
  full_name: string
  first_name: string
  last_name: string
  preferred_name?: string
  mobile?: string
  email?: string
  next_follow_up_at?: string | null
}

const KIND_LABEL: Record<ContactKind, string> = { call: 'call', sms: 'text', email: 'email', whatsapp: 'WhatsApp message', viber: 'Viber message' }
const KIND_ACTIVITY: Record<ContactKind, ActivityType> = { call: 'call', sms: 'sms', email: 'email', whatsapp: 'sms', viber: 'sms' }
const OUTCOMES = ['Interested', 'Call back later', 'Sent information', 'No answer', 'Not interested']

interface PendingContact {
  prospect: ContactProspect
  kind: ContactKind
  startedAt: number
}

/**
 * Remembers that the user left to call/text someone and, when they come back to
 * the app, asks how it went so the activity log stays complete.
 */
export function useContactTracker() {
  const pending = useRef<PendingContact | null>(null)
  const [asking, setAsking] = useState<PendingContact | null>(null)

  useEffect(() => {
    let leftAt = 0
    const left = () => {
      if (pending.current) leftAt = Date.now()
    }
    const back = () => {
      const current = pending.current
      if (!current || !leftAt) return
      // Ignore quick flickers (e.g. a permission prompt).
      if (Date.now() - leftAt < 2500) return
      pending.current = null
      leftAt = 0
      setAsking(current)
    }
    const onVisibility = () => (document.visibilityState === 'hidden' ? left() : back())
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', left)
    window.addEventListener('focus', back)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', left)
      window.removeEventListener('focus', back)
    }
  }, [])

  const track = useCallback((prospect: ContactProspect, kind: ContactKind) => {
    pending.current = { prospect, kind, startedAt: Date.now() }
  }, [])
  const close = useCallback(() => setAsking(null), [])
  return { track, asking, close }
}

export function OutcomeDialog({ contact, onClose }: { contact: PendingContact | null; onClose: () => void }) {
  const [outcome, setOutcome] = useState('')
  const [scheduleNext, setScheduleNext] = useState(false)
  const [nextDate, setNextDate] = useState(addDaysKey(todayKey(), 3))
  const [nextTime, setNextTime] = useState('10:00')

  useEffect(() => {
    if (contact) {
      setOutcome('')
      setScheduleNext(false)
      setNextDate(addDaysKey(todayKey(), 3))
    }
  }, [contact])

  const save = useMutation({
    mutationFn: async () => {
      if (!contact) return
      const label = KIND_LABEL[contact.kind]
      await activityService.create({
        prospect: contact.prospect.id,
        activity_type: KIND_ACTIVITY[contact.kind],
        subject: `${label[0]!.toUpperCase()}${label.slice(1)} with ${contact.prospect.full_name}`,
        outcome,
        occurred_at: new Date(contact.startedAt).toISOString(),
      })
      if (scheduleNext) {
        await followUpService.create({
          prospect: contact.prospect.id,
          activity_type: 'call',
          subject: 'Follow-up call',
          scheduled_at: zonedToIso(nextDate, nextTime),
        })
      }
    },
    onSuccess: () => {
      toast.success('Logged', { description: scheduleNext ? 'Activity saved and next follow-up scheduled.' : 'Activity saved to the timeline.' })
      invalidateCrm()
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (!contact) return null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="sm"
        title={`How did the ${KIND_LABEL[contact.kind]} with ${contact.prospect.first_name} go?`}
        description="Log it now so your timeline and last-contact date stay accurate."
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Skip
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick outcomes">
            {OUTCOMES.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOutcome((current) => (current ? `${current}. ${o}` : o))}
                className="h-8 rounded-full border border-line px-3 text-[12.5px] text-ink-700 hover:border-brand-300 hover:bg-brand-50"
              >
                {o}
              </button>
            ))}
          </div>
          <FormField label="Outcome" optional>
            <Textarea rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What happened?" maxLength={5000} />
          </FormField>
          <label className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 p-3">
            <span className="text-sm text-ink-800">Schedule a follow-up call</span>
            <Switch checked={scheduleNext} onCheckedChange={setScheduleNext} aria-label="Schedule a follow-up call" />
          </label>
          {scheduleNext && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Date">
                <Input type="date" min={todayKey()} value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
              </FormField>
              <FormField label="Time">
                <Input type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} />
              </FormField>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function MessageDialog({
  prospect,
  onClose,
  onSent,
}: {
  prospect: ContactProspect | null
  onClose: () => void
  onSent: (prospect: ContactProspect, kind: ContactKind) => void
}) {
  const { user } = useAuth()
  const { data: templates = [] } = useQuery({ queryKey: ['message-templates'], queryFn: templateService.list, enabled: prospect !== null })
  const channels = useMemo(() => {
    const list: Exclude<MessageChannel, 'any'>[] = []
    if (prospect?.mobile) list.push('sms', 'whatsapp', 'viber')
    if (prospect?.email) list.push('email')
    return list
  }, [prospect])
  const [channel, setChannel] = useState<Exclude<MessageChannel, 'any'>>('sms')
  const [templateId, setTemplateId] = useState<number | ''>('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  useEffect(() => {
    if (prospect) {
      setChannel(channels[0] ?? 'sms')
      setTemplateId('')
      setSubject('')
      setBody('')
    }
  }, [prospect, channels])

  if (!prospect) return null
  const ctx = {
    first_name: prospect.first_name,
    last_name: prospect.last_name,
    preferred_name: prospect.preferred_name,
    advisor_name: user?.full_name ?? '',
    next_follow_up_at: prospect.next_follow_up_at,
  }
  const visibleTemplates = templates.filter((t) => t.channel === 'any' || t.channel === channel || (t.channel === 'sms' && channel !== 'email'))

  const pickTemplate = (id: number | '') => {
    setTemplateId(id)
    const template = templates.find((t) => t.id === id)
    if (template) {
      setBody(renderTemplate(template.body, ctx))
      setSubject(renderTemplate(template.subject, ctx))
    }
  }

  const send = async () => {
    const link = messageLink(channel, prospect, body, subject)
    if (!link) return
    if (channel === 'viber') {
      try {
        await navigator.clipboard.writeText(body)
        toast.success('Message copied', { description: 'Paste it in the Viber chat that opens.' })
      } catch {
        toast.message('Copy the message', { description: 'Viber can’t pre-fill text; copy it before switching.' })
      }
    }
    onSent(prospect, channel)
    onClose()
    if (link.startsWith('https://')) window.open(link, '_blank', 'noopener')
    else window.location.href = link
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="md"
        title={`Message ${prospect.first_name}`}
        description="Opens your own messaging or email app with the text ready. Nothing is sent by PRUspect."
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={send} disabled={!body.trim() || channels.length === 0}>
              <MessageSquareText /> Open in {CHANNEL_LABEL[channel]}
            </Button>
          </>
        }
      >
        {channels.length === 0 ? (
          <p className="text-sm text-ink-600">Add a mobile number or email to this prospect to send a message.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Channel">
              {channels.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={channel === c}
                  onClick={() => setChannel(c)}
                  className={cn('h-8 rounded-full border px-3 text-[12.5px]', channel === c ? 'border-brand-600 bg-brand-600 text-white' : 'border-line text-ink-700')}
                >
                  {CHANNEL_LABEL[c]}
                </button>
              ))}
            </div>
            <FormField label="Template">
              <Select value={templateId} onChange={(e) => pickTemplate(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Write your own…</option>
                {visibleTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </FormField>
            {channel === 'email' && (
              <FormField label="Subject">
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </FormField>
            )}
            <FormField label="Message" hint="Review before sending — you can edit anything.">
              <Textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
            </FormField>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
