import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { CalendarClock, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import type * as React from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { PriorityBadge } from '@/components/data-display/badges'
import { EmptyState, ErrorState } from '@/components/data-display/states'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Segmented, Skeleton } from '@/components/ui/misc'
import { useFollowUpDialogs } from '@/features/follow-ups/FollowUpItem'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { useQueryState } from '@/hooks'
import { errorMessage } from '@/lib/api'
import { ACTIVITY_META } from '@/lib/constants'
import { dateKey, formatDateTime, formatTime, getTimeZone, isoToZonedParts, keyToDate, todayKey, zonedToIso } from '@/lib/datetime'
import { invalidateCrm, qk } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { calendarService, followUpService } from '@/services'
import type { CalendarEvent } from '@/types/api'

type View = 'month' | 'week' | 'agenda'
const WEEK_OPTS = { weekStartsOn: 1 as const }
const k = (d: Date) => format(d, 'yyyy-MM-dd')

function range(view: View, anchor: Date): { start: Date; end: Date } {
  if (view === 'month') return { start: startOfWeek(startOfMonth(anchor), WEEK_OPTS), end: endOfWeek(endOfMonth(anchor), WEEK_OPTS) }
  if (view === 'week') return { start: startOfWeek(anchor, WEEK_OPTS), end: endOfWeek(anchor, WEEK_OPTS) }
  return { start: anchor, end: addDays(anchor, 29) }
}

function EventChip({ event, onOpen, compact }: { event: CalendarEvent; onOpen: (e: CalendarEvent) => void; compact?: boolean }) {
  const meta = ACTIVITY_META[event.activity_type]
  const Icon = meta.icon
  const done = event.status === 'completed'
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen(event)
      }}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight transition-colors',
        done ? 'bg-ink-50 text-ink-400 line-through' : event.is_overdue ? 'bg-amber-50 text-amber-900 hover:bg-amber-100' : event.is_appointment ? 'bg-brand-50 text-brand-800 hover:bg-brand-100' : 'bg-sky-50 text-sky-900 hover:bg-sky-100',
      )}
      aria-label={`${event.title} with ${event.prospect.full_name} at ${formatTime(event.start)}${done ? ', completed' : ''}`}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="tabular shrink-0 font-medium">{formatTime(event.start).replace(':00', '')}</span>
      {!compact && <span className="truncate">{event.prospect.full_name}</span>}
    </button>
  )
}

/** Day cell that accepts dropped events (month and week views). */
function DroppableDay({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && 'bg-brand-50/70 ring-2 ring-inset ring-brand-300')}>
      {children}
    </div>
  )
}

/** Pending events can be dragged to another day; completed/canceled stay put. */
function DraggableEvent({ event, children }: { event: CalendarEvent; children: React.ReactNode }) {
  const disabled = event.status !== 'pending'
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `event-${event.id}`, data: { event }, disabled })
  return (
    <div ref={setNodeRef} {...(disabled ? {} : listeners)} {...(disabled ? {} : attributes)} role={undefined} tabIndex={undefined} className={cn(!disabled && 'cursor-grab touch-manipulation active:cursor-grabbing', isDragging && 'relative z-20 opacity-80 shadow-lg')}>
      {children}
    </div>
  )
}

export function CalendarPage() {
  const [query, update] = useQueryState({ view: 'month', date: '' })
  const view = (['month', 'week', 'agenda'].includes(query.view) ? query.view : 'month') as View
  const anchor = keyToDate(query.date || todayKey())
  const today = todayKey()
  const { start, end } = range(view, anchor)
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const { scheduleFollowUp } = useQuickActions()
  const { open, dialogs } = useFollowUpDialogs()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }))

  const moveEvent = useMutation({
    mutationFn: ({ id, iso, reason }: { id: number; iso: string; reason: string }) => followUpService.reschedule(id, iso, reason),
    onSuccess: () => invalidateCrm(),
    onError: (e) => toast.error(errorMessage(e)),
  })

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const event = active.data.current?.event as CalendarEvent | undefined
    const target = over?.id as string | undefined
    if (!event || !target) return
    const from = dateKey(event.start)
    if (target === from) return
    if (target < today) {
      toast.error('Pick today or a later day.')
      return
    }
    const original = event.start
    const iso = zonedToIso(target, isoToZonedParts(event.start).time)
    moveEvent.mutate(
      { id: event.id, iso, reason: 'Moved on the calendar' },
      {
        onSuccess: () =>
          toast.success(`Moved to ${format(keyToDate(target), 'EEE, MMM d')}`, {
            description: event.title,
            action: { label: 'Undo', onClick: () => moveEvent.mutate({ id: event.id, iso: original, reason: 'Undo calendar move' }) },
          }),
      },
    )
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...qk.calendar, k(start), k(end)],
    queryFn: () => calendarService.events(k(start), k(end)),
  })

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of data?.events ?? []) {
      const key = dateKey(event.start)
      map.set(key, [...(map.get(key) ?? []), event])
    }
    return map
  }, [data])

  const openAction = useMutation({
    mutationFn: async ({ id, kind }: { id: number; kind: 'complete' | 'reschedule' }) => ({ kind, followUp: await followUpService.get(id) }),
    onSuccess: ({ kind, followUp }) => {
      setSelected(null)
      open(kind, followUp)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const move = (dir: 1 | -1) => {
    const next = view === 'month' ? addMonths(anchor, dir) : view === 'week' ? addWeeks(anchor, dir) : addDays(anchor, dir * 30)
    update({ date: k(next) }, { resetPage: false })
  }

  const title = view === 'month' ? format(anchor, 'MMMM yyyy') : `${format(start, 'MMM d')} – ${format(end, start.getFullYear() === end.getFullYear() ? 'MMM d, yyyy' : 'MMM d, yyyy')}`
  const days: Date[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)

  return (
    <div>
      <PageHeader
        title="Calendar"
        description={`Appointments, presentations and follow-ups · times shown in ${getTimeZone().replace('_', ' ')}`}
        actions={
          <Button onClick={() => scheduleFollowUp({ date: query.date && query.date >= today ? query.date : undefined })}>
            <CalendarPlus /> New event
          </Button>
        }
      />
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2">
            <h2 className="min-w-44 text-lg font-semibold text-ink-900">{title}</h2>
            <Button variant="secondary" size="icon-sm" onClick={() => move(-1)} aria-label="Previous"><ChevronLeft /></Button>
            <Button variant="secondary" size="icon-sm" onClick={() => move(1)} aria-label="Next"><ChevronRight /></Button>
            <Button variant="ghost" size="sm" onClick={() => update({ date: '' }, { resetPage: false })}>Today</Button>
          </div>
          <Segmented
            label="Calendar view"
            value={view}
            onChange={(v) => update({ view: v }, { resetPage: false })}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'agenda', label: 'Agenda' },
            ]}
          />
        </div>

        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <div className="p-5"><Skeleton className="h-96" /></div>
        ) : view === 'month' ? (
          <div>
            <div className="grid grid-cols-7 border-b border-line bg-ink-50/60 text-center text-xs font-medium text-ink-500">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="py-2">{d}</div>
              ))}
            </div>
            <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = k(day)
                const events = byDay.get(key) ?? []
                const isToday = key === today
                return (
                  <DroppableDay
                    key={key}
                    id={key}
                    className={cn('group min-h-20 border-r border-b border-line p-1 transition-colors last:border-r-0 sm:min-h-28 sm:p-1.5 [&:nth-child(7n)]:border-r-0', !isSameMonth(day, anchor) && 'bg-ink-50/40')}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => update({ view: 'week', date: key }, { resetPage: false })}
                        className={cn('tabular grid size-7 place-items-center rounded-full text-xs', isToday ? 'bg-brand-600 font-semibold text-white' : isSameMonth(day, anchor) ? 'text-ink-700 hover:bg-ink-100' : 'text-ink-300')}
                        aria-label={`${format(day, 'EEEE, MMMM d')}, ${events.length} events`}
                      >
                        {format(day, 'd')}
                      </button>
                      {key >= today && (
                        <button type="button" onClick={() => scheduleFollowUp({ date: key })} className="hidden size-6 place-items-center rounded-md text-ink-400 group-hover:grid hover:bg-ink-100 hover:text-ink-700" aria-label={`Add event on ${format(day, 'MMMM d')}`}>
                          <Plus className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-1">
                      {events.slice(0, 3).map((e) => (
                        <div key={e.id} className="hidden sm:block"><DraggableEvent event={e}><EventChip event={e} onOpen={setSelected} /></DraggableEvent></div>
                      ))}
                      {events.length > 0 && (
                        <div className="flex justify-center gap-0.5 sm:hidden" aria-hidden>
                          {events.slice(0, 4).map((e) => (
                            <span key={e.id} className={cn('size-1.5 rounded-full', e.is_overdue ? 'bg-amber-500' : e.status === 'completed' ? 'bg-ink-300' : 'bg-brand-600')} />
                          ))}
                        </div>
                      )}
                      {events.length > 3 && (
                        <button type="button" onClick={() => update({ view: 'week', date: key }, { resetPage: false })} className="hidden w-full px-1.5 text-left text-[11px] font-medium text-ink-500 hover:text-brand-700 sm:block">
                          +{events.length - 3} more
                        </button>
                      )}
                    </div>
                  </DroppableDay>
                )
              })}
            </div>
            </DndContext>
            <p className="hidden px-5 py-2 text-[11px] text-ink-400 sm:block">Tip: drag a pending event to another day to reschedule it (same time).</p>
          </div>
        ) : view === 'week' ? (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-7 md:divide-x md:divide-y-0">
            {days.map((day) => {
              const key = k(day)
              const events = byDay.get(key) ?? []
              return (
                <DroppableDay key={key} id={key} className="min-h-24 p-3 transition-colors md:min-h-96">
                  <div className="mb-2 flex items-center justify-between md:flex-col md:items-start">
                    <p className={cn('text-xs font-medium', key === today ? 'text-brand-700' : 'text-ink-500')}>
                      {format(day, 'EEE')} <span className={cn('tabular ml-1 text-base font-semibold', key === today ? 'text-brand-700' : 'text-ink-900')}>{format(day, 'd')}</span>
                    </p>
                    {key >= today && (
                      <button type="button" onClick={() => scheduleFollowUp({ date: key })} className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label={`Add event on ${format(day, 'MMMM d')}`}>
                        <Plus className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {events.length === 0 && <p className="text-xs text-ink-300">No events</p>}
                    {events.map((e) => (
                      <DraggableEvent key={e.id} event={e}>
                      <button
                        type="button"
                        onClick={() => setSelected(e)}
                        className={cn('w-full rounded-lg border-l-4 bg-white p-2 text-left shadow-xs ring-1 ring-line hover:shadow-sm', e.status === 'completed' ? 'border-l-ink-300 opacity-60' : e.is_overdue ? 'border-l-amber-500' : e.is_appointment ? 'border-l-brand-600' : 'border-l-sky-500')}
                      >
                        <p className="tabular text-[11px] text-ink-500">{formatTime(e.start)}</p>
                        <p className="truncate text-xs font-medium text-ink-900">{e.title}</p>
                        <p className="truncate text-[11px] text-ink-500">{e.prospect.full_name}</p>
                      </button>
                      </DraggableEvent>
                    ))}
                  </div>
                </DroppableDay>
              )
            })}
          </div>
          </DndContext>
        ) : (
          <div>
            {byDay.size === 0 ? (
              <EmptyState icon={CalendarPlus} title="Nothing scheduled in the next 30 days" action={<Button variant="secondary" onClick={() => scheduleFollowUp()}>Schedule follow-up</Button>} />
            ) : (
              [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, events]) => (
                <section key={key}>
                  <h3 className="border-y border-line bg-ink-50/80 px-5 py-1.5 text-xs font-semibold text-ink-500">{key === today ? 'Today' : format(keyToDate(key), 'EEEE, MMM d')}</h3>
                  <ul className="divide-y divide-line">
                    {events.map((e) => {
                      const meta = ACTIVITY_META[e.activity_type]
                      return (
                        <li key={e.id}>
                          <button type="button" onClick={() => setSelected(e)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-ink-50">
                            <span className="tabular w-16 shrink-0 text-xs text-ink-500">{formatTime(e.start)}</span>
                            <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', meta.tint)}><meta.icon className="size-4" aria-hidden /></span>
                            <span className="min-w-0 flex-1">
                              <span className={cn('block truncate text-sm font-medium text-ink-900', e.status === 'completed' && 'text-ink-400 line-through')}>{e.title}</span>
                              <span className="block truncate text-xs text-ink-500">{e.prospect.full_name}</span>
                            </span>
                            {e.is_overdue && <span className="text-xs font-medium text-amber-700">Overdue</span>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))
            )}
          </div>
        )}
      </div>

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <DialogContent
            size="sm"
            title={selected.title}
            description={`${selected.activity_type_label} · ${formatDateTime(selected.start)} – ${formatTime(selected.end)}`}
            footer={
              selected.status === 'pending' ? (
                <>
                  <Button variant="secondary" loading={openAction.isPending && openAction.variables?.kind === 'reschedule'} onClick={() => openAction.mutate({ id: selected.id, kind: 'reschedule' })}>
                    <CalendarClock /> Reschedule
                  </Button>
                  <Button loading={openAction.isPending && openAction.variables?.kind === 'complete'} onClick={() => openAction.mutate({ id: selected.id, kind: 'complete' })}>
                    <CheckCircle2 /> Complete
                  </Button>
                </>
              ) : undefined
            }
          >
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <Link to={`/prospects/${selected.prospect.id}`} className="inline-flex items-center gap-1.5 font-medium text-brand-700 hover:underline">
                  {selected.prospect.full_name} <ExternalLink className="size-3.5" />
                </Link>
                <PriorityBadge priority={selected.priority} />
              </div>
              <p className="text-ink-600">
                Status: <span className="font-medium text-ink-900">{selected.status === 'pending' ? (selected.is_overdue ? 'Overdue' : 'Scheduled') : selected.status === 'completed' ? 'Completed' : 'Canceled'}</span>
              </p>
              {selected.description && <p className="rounded-xl bg-ink-50 p-3 whitespace-pre-line text-ink-700">{selected.description}</p>}
            </div>
          </DialogContent>
        )}
      </Dialog>
      {dialogs}
    </div>
  )
}
