import { TZDate } from '@date-fns/tz'
import { addDays, differenceInCalendarDays, format, formatDistanceToNowStrict } from 'date-fns'

/**
 * All API datetimes are UTC ISO strings. Display and date-only math happen in the
 * user's chosen timezone (Settings; default Asia/Manila) — not the browser's.
 */
let currentTimeZone = 'Asia/Manila'

export function setTimeZone(tz: string | undefined | null) {
  if (tz) currentTimeZone = tz
}

export function getTimeZone() {
  return currentTimeZone
}

export function inZone(value: string | Date | number): TZDate {
  const ms = typeof value === 'string' ? new Date(value).getTime() : typeof value === 'number' ? value : value.getTime()
  return new TZDate(ms, currentTimeZone)
}

export function nowInZone(): TZDate {
  return TZDate.tz(currentTimeZone)
}

/** YYYY-MM-DD for "today" in the user's zone. */
export function todayKey(): string {
  return format(nowInZone(), 'yyyy-MM-dd')
}

export function dateKey(value: string | Date): string {
  return format(inZone(value), 'yyyy-MM-dd')
}

/** Build a UTC ISO string from a date (YYYY-MM-DD) and time (HH:mm) in the user's zone. */
export function zonedToIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = (time || '09:00').split(':').map(Number)
  const zoned = new TZDate(y ?? 1970, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, currentTimeZone)
  return new Date(zoned.getTime()).toISOString()
}

/** Split an ISO datetime into date and time input values in the user's zone. */
export function isoToZonedParts(value: string): { date: string; time: string } {
  const zoned = inZone(value)
  return { date: format(zoned, 'yyyy-MM-dd'), time: format(zoned, 'HH:mm') }
}

export function formatDate(value: string | null | undefined, pattern = 'MMM d, yyyy'): string {
  if (!value) return '—'
  // Date-only strings are calendar dates; don't shift them through timezones.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return format(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1), pattern)
  }
  return format(inZone(value), pattern)
}

export function formatDateTime(value: string | null | undefined, pattern = 'MMM d, yyyy · h:mm a'): string {
  if (!value) return '—'
  return format(inZone(value), pattern)
}

export function formatTime(value: string): string {
  return format(inZone(value), 'h:mm a')
}

/** "Today, 9:30 AM", "Tomorrow, 2:00 PM", "Mon, 3:00 PM", or "Apr 28, 9:00 AM". */
export function formatRelativeDay(value: string | null | undefined): string {
  if (!value) return '—'
  const zoned = inZone(value)
  const diff = differenceInCalendarDays(zoned, nowInZone())
  const time = format(zoned, 'h:mm a')
  if (diff === 0) return `Today, ${time}`
  if (diff === 1) return `Tomorrow, ${time}`
  if (diff === -1) return `Yesterday, ${time}`
  if (diff > 1 && diff < 7) return `${format(zoned, 'EEE')}, ${time}`
  return format(zoned, diff < 0 || diff > 300 ? 'MMM d, yyyy' : 'MMM d, h:mm a')
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return 'Never'
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true })
}

export function daysFromToday(value: string): number {
  return differenceInCalendarDays(inZone(value), nowInZone())
}

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return format(addDays(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1), days), 'yyyy-MM-dd')
}

export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export const COMMON_TIME_ZONES = [
  'Asia/Manila',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Dubai',
  'Australia/Sydney',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
]
