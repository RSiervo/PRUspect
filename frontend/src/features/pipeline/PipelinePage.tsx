import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CalendarClock, GripVertical, Info, MoveRight, PhoneCall, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { DemoBadge, PriorityBadge } from '@/components/data-display/badges'
import { ErrorState } from '@/components/data-display/states'
import { PageHeader } from '@/components/layout/PageHeader'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input, Select } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/menu'
import { Skeleton, Switch } from '@/components/ui/misc'
import { StatusChanger } from '@/features/prospects/ChangeStatus'
import { useDebouncedValue } from '@/hooks'
import { errorMessage } from '@/lib/api'
import { CLOSED_LOST, PRIORITIES, PRIORITY_META, STATUS_META } from '@/lib/constants'
import { formatRelativeDay, timeAgo } from '@/lib/datetime'
import { invalidateCrm, qk } from '@/lib/queryKeys'
import { cn, formatMoney } from '@/lib/utils'
import { pipelineService, prospectService } from '@/services'
import type { PipelineCard, PipelineStage, ProspectStatus } from '@/types/api'

function CardBody({ card, dragging }: { card: PipelineCard; dragging?: boolean }) {
  return (
    <div className={cn('rounded-xl border border-line bg-white p-3 shadow-xs', dragging && 'rotate-1 shadow-[var(--shadow-pop)]')}>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/prospects/${card.id}`} className="min-w-0 truncate text-sm font-semibold text-ink-900 hover:text-brand-700">
          {card.full_name}
        </Link>
        <PriorityBadge priority={card.priority} className="h-5 px-2 text-[11px]" />
      </div>
      <p className="mt-0.5 truncate text-xs text-ink-500">{card.insurance_interests.join(', ') || 'No interest recorded'}</p>
      <dl className="mt-2.5 space-y-1 text-[11px] text-ink-500">
        <div className="flex items-center gap-1.5">
          <PhoneCall className="size-3" aria-hidden />
          <dt className="sr-only">Last contact</dt>
          <dd>{card.last_contacted_at ? `Contacted ${timeAgo(card.last_contacted_at)}` : 'Not contacted yet'}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <CalendarClock className="size-3" aria-hidden />
          <dt className="sr-only">Next follow-up</dt>
          <dd className={cn(card.next_follow_up_at && new Date(card.next_follow_up_at) < new Date() && 'font-medium text-amber-700')}>
            {card.next_follow_up_at ? formatRelativeDay(card.next_follow_up_at) : 'No follow-up scheduled'}
          </dd>
        </div>
      </dl>
      {(card.estimated_annual_premium || card.is_demo) && (
        <div className="mt-2.5 flex items-center justify-between border-t border-line pt-2">
          <span className="tabular text-xs text-ink-700" title="Estimated annual premium of open opportunities — not confirmed revenue">
            {card.estimated_annual_premium ? <>Est. {formatMoney(card.estimated_annual_premium)}/yr</> : ''}
          </span>
          {card.is_demo && <DemoBadge />}
        </div>
      )}
    </div>
  )
}

function DraggableCard({ card, onMoved }: { card: PipelineCard; onMoved: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, data: { card } })
  return (
    <div ref={setNodeRef} className={cn('group relative', isDragging && 'opacity-40')}>
      <CardBody card={card} />
      <div className="absolute top-9 right-2 flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <StatusChanger
          prospectId={card.id}
          prospectName={card.full_name}
          status={card.status}
          onChanged={onMoved}
          trigger={
            <button type="button" className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label={`Move ${card.full_name} to another stage`}>
              <MoveRight className="size-3.5" />
            </button>
          }
        />
        <button type="button" className="hidden cursor-grab touch-none rounded-md p-1 text-ink-300 hover:bg-ink-100 hover:text-ink-600 active:cursor-grabbing md:block" aria-label={`Drag ${card.full_name}`} {...listeners} {...attributes}>
          <GripVertical className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

function Column({ stage, onMoved }: { stage: PipelineStage; onMoved: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.value })
  const meta = STATUS_META[stage.value]
  const terminal = meta.kind !== 'active'
  return (
    <section
      ref={setNodeRef}
      aria-label={`${stage.label}, ${stage.count} prospects`}
      className={cn(
        'flex w-[82vw] max-w-72 shrink-0 snap-start flex-col rounded-2xl border p-2.5 transition-colors sm:w-72',
        terminal ? 'border-dashed border-ink-200 bg-ink-50/60' : 'border-line bg-ink-50',
        isOver && 'border-brand-300 bg-brand-50/60',
      )}
    >
      <header className="mb-2 flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink-800">
          <span className="size-2 rounded-full" style={{ background: meta.color }} aria-hidden />
          {stage.label}
        </h2>
        <span className="tabular rounded-full bg-white px-2 text-xs font-medium text-ink-600 ring-1 ring-line">{stage.count}</span>
      </header>
      <div className="flex max-h-[calc(100dvh-20rem)] min-h-24 flex-col gap-2 overflow-y-auto p-0.5">
        {stage.prospects.map((card) => (
          <DraggableCard key={card.id} card={card} onMoved={onMoved} />
        ))}
        {stage.prospects.length === 0 && <p className="py-6 text-center text-xs text-ink-400">Drop prospects here</p>}
        {stage.count > stage.prospects.length && (
          <Link to={`/prospects?status=${stage.value}`} className="py-2 text-center text-xs font-medium text-brand-700 hover:underline">
            View all {stage.count}
          </Link>
        )}
      </div>
    </section>
  )
}

export function PipelinePage() {
  const [term, setTerm] = useState('')
  const [priority, setPriority] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const search = useDebouncedValue(term, 300)
  const [activeCard, setActiveCard] = useState<PipelineCard | null>(null)
  const [pending, setPending] = useState<{ card: PipelineCard; to: ProspectStatus } | null>(null)
  const [reason, setReason] = useState('')

  const params = { search, priority }
  const { data, isLoading, error, refetch } = useQuery({ queryKey: [...qk.pipeline, params], queryFn: () => pipelineService.board(params) })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }))

  const move = useMutation({
    mutationFn: ({ card, to, why }: { card: PipelineCard; to: ProspectStatus; why: string }) => prospectService.changeStatus(card.id, to, why),
    onSuccess: (p) => {
      toast.success(`${p.full_name} moved to ${STATUS_META[p.status].label}`)
      setPending(null)
      setReason('')
      invalidateCrm()
    },
    onError: (e) => {
      toast.error(errorMessage(e))
      void refetch()
    },
  })

  const onDragEnd = (event: DragEndEvent) => {
    setActiveCard(null)
    const card = event.active.data.current?.card as PipelineCard | undefined
    const to = event.over?.id as ProspectStatus | undefined
    if (!card || !to || to === card.status) return
    const needsConfirm = to === 'won' || CLOSED_LOST.includes(to) || CLOSED_LOST.includes(card.status)
    if (needsConfirm) setPending({ card, to })
    else move.mutate({ card, to, why: '' })
  }

  const stages = (data?.stages ?? []).filter((s) => showClosed || STATUS_META[s.value].kind === 'active')
  const reopen = pending ? CLOSED_LOST.includes(pending.card.status) : false

  return (
    <div>
      <PageHeader title="Sales Pipeline" description="Drag a card to another stage, or use the move button on each card." />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs text-ink-500">
            Estimated pipeline
            <Tooltip content={data?.notes.open_estimated ?? ''}>
              <button type="button" aria-label="How this is calculated" className="text-ink-300 hover:text-ink-500"><Info className="size-3.5" /></button>
            </Tooltip>
          </p>
          {data ? <p className="tabular mt-1 text-xl font-semibold text-ink-900">{formatMoney(data.totals.open_estimated)}</p> : <Skeleton className="mt-2 h-6 w-28" />}
          <p className="text-xs text-ink-500">{data ? `${data.totals.open_count} open opportunities · estimate only` : ' '}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-ink-500">Submitted (awaiting issuance)</p>
          {data ? <p className="tabular mt-1 text-xl font-semibold text-ink-900">{formatMoney(data.totals.submitted_estimated)}</p> : <Skeleton className="mt-2 h-6 w-28" />}
          <p className="text-xs text-ink-500">Estimated premium in Submitted + Underwriting</p>
        </div>
        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs text-ink-500">
            Issued premium (verified)
            <Tooltip content={data?.notes.issued_actual ?? ''}>
              <button type="button" aria-label="How this is calculated" className="text-ink-300 hover:text-ink-500"><Info className="size-3.5" /></button>
            </Tooltip>
          </p>
          {data ? <p className="tabular mt-1 text-xl font-semibold text-emerald-700">{formatMoney(data.totals.issued_actual)}</p> : <Skeleton className="mt-2 h-6 w-28" />}
          <p className="text-xs text-ink-500">{data ? `${data.totals.issued_count} issued polic${data.totals.issued_count === 1 ? 'y' : 'ies'}${data.totals.issued_missing_actual ? ` · ${data.totals.issued_missing_actual} without verified premium` : ''}` : ' '}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Filter by name" className="pl-10" aria-label="Filter pipeline" />
        </div>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="sm:w-44" aria-label="Priority">
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{PRIORITY_META[p].label}</option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-ink-700 sm:ml-auto">
          <Switch checked={showClosed} onCheckedChange={setShowClosed} aria-label="Show closed and paused stages" />
          Show closed &amp; on-hold stages
        </label>
      </div>

      {error ? (
        <div className="card"><ErrorState error={error} onRetry={refetch} /></div>
      ) : isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-2xl" />)}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActiveCard((e.active.data.current?.card as PipelineCard) ?? null)}
          onDragCancel={() => setActiveCard(null)}
          onDragEnd={onDragEnd}
          accessibility={{ screenReaderInstructions: { draggable: 'Drag with a mouse, or use the move button on each card to change its stage.' } }}
        >
          <div className="relative -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            {stages.map((stage) => (
              <Column key={stage.value} stage={stage} onMoved={() => void refetch()} />
            ))}
          </div>
          <DragOverlay>{activeCard ? <div className="w-64"><CardBody card={activeCard} dragging /></div> : null}</DragOverlay>
        </DndContext>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => { if (!o) { setPending(null); setReason('') } }}
        title={pending ? (reopen ? `Reopen ${pending.card.full_name}?` : `Move ${pending.card.full_name} to ${STATUS_META[pending.to].label}?`) : ''}
        description={pending?.to === 'won' ? 'Use this once the policy is actually issued.' : reopen ? 'The reopen is recorded in the status history.' : 'The prospect leaves the active pipeline. You can reopen it later.'}
        tone={pending && CLOSED_LOST.includes(pending.to) ? 'danger' : 'default'}
        loading={move.isPending}
        onConfirm={() => pending && move.mutate({ card: pending.card, to: pending.to, why: reason })}
      >
        {pending && pending.to !== 'won' && (
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" aria-label="Reason" maxLength={500} />
        )}
      </ConfirmDialog>
    </div>
  )
}
