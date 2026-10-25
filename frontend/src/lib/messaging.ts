import { phoneDigits } from '@/schemas'
import type { MessageChannel } from '@/types/api'

import { formatDateTime } from './datetime'

export interface TemplateContext {
  first_name: string
  last_name: string
  preferred_name?: string
  advisor_name: string
  next_follow_up_at?: string | null
}

/** Fill {placeholders}; unknown placeholders are left as typed. */
export function renderTemplate(text: string, ctx: TemplateContext): string {
  const values: Record<string, string> = {
    first_name: ctx.first_name,
    last_name: ctx.last_name,
    preferred_name: ctx.preferred_name || ctx.first_name,
    full_name: `${ctx.first_name} ${ctx.last_name}`.trim(),
    advisor_name: ctx.advisor_name,
    next_follow_up: ctx.next_follow_up_at ? formatDateTime(ctx.next_follow_up_at, 'EEE, MMM d · h:mm a') : 'our next meeting',
  }
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}

export const CHANNEL_LABEL: Record<Exclude<MessageChannel, 'any'>, string> = {
  sms: 'Text message',
  whatsapp: 'WhatsApp',
  viber: 'Viber',
  email: 'Email',
}

/**
 * Link that opens the device's app with the message filled in. Nothing is sent
 * by PRUspect; the user reviews and sends it in their own app.
 */
export function messageLink(
  channel: Exclude<MessageChannel, 'any'>,
  to: { mobile?: string; email?: string },
  body: string,
  subject = '',
): string | null {
  const text = encodeURIComponent(body)
  if (channel === 'email') {
    if (!to.email) return null
    const params = [subject && `subject=${encodeURIComponent(subject)}`, `body=${text}`].filter(Boolean).join('&')
    return `mailto:${encodeURIComponent(to.email)}?${params}`
  }
  if (!to.mobile) return null
  const digits = phoneDigits(to.mobile)
  if (channel === 'whatsapp') return `https://wa.me/${digits}?text=${text}`
  // Viber can't prefill a message for a specific contact; open the chat and copy the text.
  if (channel === 'viber') return `viber://chat?number=%2B${digits}`
  // iOS uses "&body", Android "?body"; "?&body=" works on both.
  return `sms:+${digits}?&body=${text}`
}
