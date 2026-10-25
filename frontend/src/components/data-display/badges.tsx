import { Ban, CheckCircle2, FlaskConical, PauseCircle } from 'lucide-react'

import { Badge } from '@/components/ui/misc'
import { OPPORTUNITY_STAGES, PRIORITY_META, STATUS_META } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { OpportunityStage, Priority, ProspectStatus } from '@/types/api'

export function StatusBadge({ status, short, className }: { status: ProspectStatus; short?: boolean; className?: string }) {
  const meta = STATUS_META[status]
  const Icon = meta.kind === 'won' ? CheckCircle2 : meta.kind === 'lost' ? Ban : meta.kind === 'paused' ? PauseCircle : null
  return (
    <Badge className={cn(meta.badge, className)} title={meta.label}>
      {Icon ? <Icon className="size-3.5" aria-hidden /> : <span className="size-1.5 rounded-full" style={{ background: meta.color }} aria-hidden />}
      {short ? meta.short : meta.label}
    </Badge>
  )
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const meta = PRIORITY_META[priority]
  return (
    <Badge className={cn(meta.badge, className)}>
      <span className="sr-only">Priority: </span>
      {meta.label}
    </Badge>
  )
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge className={cn('h-5 bg-indigo-50 px-2 text-[11px] text-indigo-700 ring-indigo-200', className)} title="Sample data from seed_demo — not a real prospect">
      <FlaskConical className="size-3" aria-hidden />
      Demo
    </Badge>
  )
}

export function OpportunityStageBadge({ stage }: { stage: OpportunityStage }) {
  const meta = OPPORTUNITY_STAGES.find((s) => s.value === stage)
  return <Badge className={meta?.badge}>{meta?.label ?? stage}</Badge>
}
