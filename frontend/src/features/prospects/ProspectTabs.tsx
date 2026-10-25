import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Archive,
  CalendarPlus,
  CheckCircle2,
  CircleDot,
  FileCheck2,
  FilePlus2,
  History,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { OpportunityStageBadge } from '@/components/data-display/badges'
import { DefinitionList, Timeline, type TimelineItem } from '@/components/data-display/common'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/data-display/states'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Textarea } from '@/components/ui/input'
import { Card, CardHeader, Segmented } from '@/components/ui/misc'
import { FollowUpItem, useFollowUpDialogs } from '@/features/follow-ups/FollowUpItem'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { errorMessage } from '@/lib/api'
import { ACTIVITY_META, STATUS_META } from '@/lib/constants'
import { formatDate, formatDateTime, timeAgo } from '@/lib/datetime'
import { invalidateCrm, qk } from '@/lib/queryKeys'
import { formatMoney } from '@/lib/utils'
import { followUpService, noteService, opportunityService, prospectService } from '@/services'
import type { ActivityType, Opportunity, Prospect, ProspectNote, TimelineEvent } from '@/types/api'

import { useProspectOptions } from './ChangeStatus'
import { OpportunityDialog } from './OpportunityDialog'

// --------------------------------------------------------------- overview

export function OverviewTab({ prospect }: { prospect: Prospect }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Contact information" />
        <div className="px-5 pt-2 pb-4">
          <DefinitionList
            items={[
              { label: 'Mobile', value: prospect.mobile && <a className="hover:text-brand-700" href={`tel:${prospect.mobile}`}>{prospect.mobile}</a> },
              { label: 'Email', value: prospect.email && <a className="hover:text-brand-700" href={`mailto:${prospect.email}`}>{prospect.email}</a> },
              { label: 'Preferred name', value: prospect.preferred_name },
              { label: 'Occupation', value: prospect.occupation },
              { label: 'Company', value: prospect.company },
              { label: 'Location', value: prospect.location },
              { label: 'Birth date', value: prospect.birth_date ? formatDate(prospect.birth_date) : '' },
              { label: 'Preferred contact', value: prospect.preferred_contact_method_label },
            ]}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Qualification" />
        <div className="px-5 pt-2 pb-4">
          <DefinitionList
            items={[
              { label: 'Current status', value: STATUS_META[prospect.status].label },
              { label: 'Priority', value: prospect.priority[0]!.toUpperCase() + prospect.priority.slice(1) },
              { label: 'Source', value: prospect.source?.name },
              { label: 'Referred by', value: prospect.referral_name },
              { label: 'Insurance interest', value: prospect.insurance_interests.map((i) => i.name).join(', ') },
              { label: 'Existing coverage', value: prospect.existing_coverage },
              { label: 'Affordable premium', value: prospect.budget_range_label },
              { label: 'Last contact', value: prospect.last_contacted_at ? `${formatDateTime(prospect.last_contacted_at)} (${timeAgo(prospect.last_contacted_at)})` : 'Not yet contacted' },
            ]}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Consent & privacy" />
        <div className="px-5 pt-2 pb-4">
          <DefinitionList
            items={[
              { label: 'Consent obtained', value: prospect.consent_obtained ? 'Yes' : <span className="text-amber-700">Not recorded</span> },
              { label: 'Consent date', value: prospect.consent_date ? formatDate(prospect.consent_date) : '' },
              { label: 'How consent was given', value: prospect.consent_source },
              { label: 'Do not contact', value: prospect.do_not_contact ? <span className="font-medium text-amber-700">Yes</span> : 'No' },
            ]}
          />
        </div>
      </Card>
      <Card>
        <CardHeader title="Summary notes" />
        <p className="px-5 pt-3 pb-5 text-sm leading-relaxed whitespace-pre-line text-ink-700">{prospect.notes || <span className="text-ink-400">No summary yet.</span>}</p>
        <div className="border-t border-line px-5 py-3">
          <DefinitionList
            items={[
              { label: 'Added', value: formatDateTime(prospect.created_at) },
              { label: 'Qualified', value: prospect.qualified_at ? formatDate(prospect.qualified_at) : '' },
              { label: 'Application submitted', value: prospect.application_submitted_at ? formatDate(prospect.application_submitted_at) : '' },
              { label: 'Policy issued', value: prospect.policy_issued_at ? formatDate(prospect.policy_issued_at) : '' },
            ]}
          />
        </div>
      </Card>
    </div>
  )
}

// --------------------------------------------------------------- timeline

const KIND_STYLE: Record<TimelineEvent['kind'], { icon: TimelineItem['icon']; tint: string }> = {
  created: { icon: UserPlus, tint: 'bg-brand-50 text-brand-600' },
  status: { icon: RefreshCcw, tint: 'bg-violet-50 text-violet-600' },
  archive: { icon: Archive, tint: 'bg-ink-100 text-ink-600' },
  note: { icon: NotebookPen, tint: 'bg-amber-50 text-amber-700' },
  follow_up: { icon: CalendarPlus, tint: 'bg-sky-50 text-sky-600' },
  opportunity: { icon: FilePlus2, tint: 'bg-orange-50 text-orange-600' },
  activity: { icon: CheckCircle2, tint: 'bg-emerald-50 text-emerald-600' },
  milestone: { icon: FileCheck2, tint: 'bg-emerald-600 text-white' },
  other: { icon: CircleDot, tint: 'bg-ink-100 text-ink-600' },
}

export function TimelineTab({ prospectId }: { prospectId: number }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: qk.prospectTimeline(prospectId), queryFn: () => prospectService.timeline(prospectId) })
  if (error) return <Card><ErrorState error={error} onRetry={refetch} /></Card>
  if (isLoading) return <Card><ListSkeleton /></Card>
  const items: TimelineItem[] = (data ?? []).map((event) => {
    const activityType = event.meta.activity_type as ActivityType | undefined
    const style = event.kind === 'activity' && activityType ? { icon: ACTIVITY_META[activityType].icon, tint: ACTIVITY_META[activityType].tint } : KIND_STYLE[event.kind]
    const outcome = typeof event.meta.outcome === 'string' && event.meta.outcome ? event.meta.outcome : null
    const reason = typeof event.meta.reason === 'string' ? event.meta.reason : null
    return {
      id: event.id,
      icon: style.icon,
      tint: style.tint,
      title: event.title,
      description: event.description,
      meta: outcome ? `Outcome: ${outcome}` : reason ? `Reason: ${reason}` : undefined,
      time: formatDateTime(event.occurred_at),
    }
  })
  return (
    <Card className="p-5">
      {items.length ? <Timeline items={items} /> : <EmptyState compact icon={History} title="No history yet" />}
    </Card>
  )
}

// ------------------------------------------------------------- follow-ups

export function FollowUpsTab({ prospect }: { prospect: Prospect }) {
  const [bucket, setBucket] = useState<'active' | 'completed' | 'canceled'>('active')
  const { scheduleFollowUp } = useQuickActions()
  const { open, dialogs } = useFollowUpDialogs()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: qk.followUpList({ prospect: prospect.id, bucket, include_archived: true }),
    queryFn: () => followUpService.list({ prospect: prospect.id, bucket, page_size: 100, include_archived: 'true' }),
  })
  return (
    <Card>
      <CardHeader
        title="Follow-ups"
        description={bucket === 'active' ? 'Overdue and upcoming tasks' : undefined}
        action={
          !prospect.is_archived && (
            <Button size="sm" onClick={() => scheduleFollowUp({ prospect: prospect })}>
              <Plus /> Schedule
            </Button>
          )
        }
      />
      <div className="px-5 pt-3">
        <Segmented
          label="Follow-up status"
          value={bucket}
          onChange={setBucket}
          options={[
            { value: 'active', label: 'Open' },
            { value: 'completed', label: 'Completed' },
            { value: 'canceled', label: 'Canceled' },
          ]}
        />
      </div>
      <div className="pt-2 pb-2">
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <ListSkeleton rows={3} />
        ) : data?.results.length ? (
          <div className="divide-y divide-line">
            {data.results.map((f) => (
              <FollowUpItem key={f.id} followUp={f} onAction={open} showProspect={false} />
            ))}
          </div>
        ) : (
          <EmptyState compact icon={CalendarPlus} title={bucket === 'active' ? 'No open follow-ups' : `No ${bucket} follow-ups`} />
        )}
      </div>
      {dialogs}
    </Card>
  )
}

// ---------------------------------------------------------- opportunities

export function OpportunitiesTab({ prospect }: { prospect: Prospect }) {
  const { data: options } = useProspectOptions()
  const [editing, setEditing] = useState<Opportunity | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<Opportunity | null>(null)
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...qk.opportunities, prospect.id],
    queryFn: () => opportunityService.list({ prospect: prospect.id, page_size: 100 }),
  })
  const remove = useMutation({
    mutationFn: (id: number) => opportunityService.remove(id),
    onSuccess: () => {
      toast.success('Opportunity deleted')
      invalidateCrm()
      setDeleting(null)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const items = data?.results ?? []

  return (
    <Card>
      <CardHeader
        title="Insurance opportunities"
        description="Estimated premiums are not confirmed revenue. Actual premium is recorded only after issuance."
        action={
          !prospect.is_archived && (
            <Button size="sm" onClick={() => setEditing(null)}>
              <Plus /> Add
            </Button>
          )
        }
      />
      <div className="p-5 pt-4">
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <ListSkeleton rows={2} />
        ) : items.length === 0 ? (
          <EmptyState compact icon={FilePlus2} title="No opportunities yet" description="Track a product interest, estimated premium and application progress." />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {items.map((o) => (
              <li key={o.id} className="rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink-900">{o.name}</p>
                    <p className="text-xs text-ink-500">{o.product_category_name || 'No category'}</p>
                  </div>
                  <OpportunityStageBadge stage={o.stage} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <dt className="text-ink-400">Estimated annual</dt>
                    <dd className="tabular text-sm text-ink-800">{formatMoney(o.estimated_annual_premium, o.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-400">Monthly equivalent</dt>
                    <dd className="tabular text-sm text-ink-800">{formatMoney(o.estimated_monthly_premium, o.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-400">Submitted</dt>
                    <dd className="text-ink-800">{formatDate(o.application_submitted_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-400">Issued</dt>
                    <dd className="text-ink-800">{formatDate(o.policy_issued_date)}</dd>
                  </div>
                  {o.stage === 'issued' && (
                    <div className="col-span-2 rounded-lg bg-emerald-50 px-2.5 py-2">
                      <dt className="text-emerald-700">Actual annualized premium (verified)</dt>
                      <dd className="tabular text-sm font-semibold text-emerald-900">{o.actual_annualized_premium ? formatMoney(o.actual_annualized_premium, o.currency) : 'Not yet recorded'}</dd>
                    </div>
                  )}
                  {o.estimated_close_date && o.stage !== 'issued' && (
                    <div className="col-span-2">
                      <dt className="text-ink-400">Estimated close</dt>
                      <dd className="text-ink-800">{formatDate(o.estimated_close_date)}</dd>
                    </div>
                  )}
                </dl>
                {!prospect.is_archived && (
                  <div className="mt-3 flex gap-1 border-t border-line pt-3">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(o)}>
                      <Pencil /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" className="text-brand-700" onClick={() => setDeleting(o)}>
                      <Trash2 /> Delete
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <OpportunityDialog
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        prospectId={prospect.id}
        prospectStatus={prospect.status}
        opportunity={editing}
        categories={options?.product_categories ?? []}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this opportunity?"
        description={`“${deleting?.name}” will be removed. The deletion is recorded in the prospect’s history.`}
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </Card>
  )
}

// ------------------------------------------------------------------ notes

function NoteItem({ note, readOnly }: { note: ProspectNote; readOnly: boolean }) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(note.body)
  const [showHistory, setShowHistory] = useState(false)
  const save = useMutation({
    mutationFn: () => noteService.update(note.id, body),
    onSuccess: () => {
      toast.success('Note updated')
      setEditing(false)
      invalidateCrm()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <li className="rounded-xl border border-line p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
        <span>
          <span className="font-medium text-ink-700">{note.author_name}</span> · {formatDateTime(note.created_at)}
          {note.is_edited && (
            <button type="button" className="ml-1 underline-offset-2 hover:underline" onClick={() => setShowHistory((v) => !v)}>
              (edited {note.revisions.length}×)
            </button>
          )}
        </span>
        {!readOnly && !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} aria-label="Edit note" />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setBody(note.body); setEditing(false) }}>Cancel</Button>
            <Button size="sm" loading={save.isPending} disabled={!body.trim() || body === note.body} onClick={() => save.mutate()}>Save</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-relaxed whitespace-pre-line text-ink-800">{note.body}</p>
      )}
      {showHistory && note.revisions.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-line pt-3">
          {note.revisions.map((r) => (
            <li key={r.id} className="text-xs text-ink-500">
              <span className="font-medium">Before {formatDateTime(r.edited_at)}:</span> <span className="whitespace-pre-line">{r.previous_body}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export function NotesTab({ prospect }: { prospect: Prospect }) {
  const [body, setBody] = useState('')
  const { data, isLoading, error, refetch } = useQuery({ queryKey: qk.notes(prospect.id), queryFn: () => noteService.list(prospect.id) })
  const add = useMutation({
    mutationFn: () => noteService.create(prospect.id, body.trim()),
    onSuccess: () => {
      toast.success('Note added')
      setBody('')
      void refetch()
      invalidateCrm()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Card>
      <CardHeader title="Notes" description="Timestamped notes. Edits keep the previous version." />
      <div className="space-y-4 p-5">
        {!prospect.is_archived && (
          <div className="space-y-2">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a note about this prospect…" rows={3} aria-label="New note" maxLength={5000} />
            <div className="flex justify-end">
              <Button size="sm" onClick={() => add.mutate()} disabled={!body.trim()} loading={add.isPending}>
                <NotebookPen /> Add note
              </Button>
            </div>
          </div>
        )}
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <ListSkeleton rows={2} />
        ) : data?.results.length ? (
          <ul className="space-y-3">
            {data.results.map((note) => (
              <NoteItem key={note.id} note={note} readOnly={prospect.is_archived} />
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={NotebookPen} title="No notes yet" />
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- history

const FIELD_LABELS: Record<string, string> = {
  first_name: 'First name', last_name: 'Last name', preferred_name: 'Preferred name', mobile: 'Mobile', email: 'Email',
  birth_date: 'Birth date', occupation: 'Occupation', company: 'Company', location: 'Location', source: 'Source',
  referral_name: 'Referral', existing_coverage: 'Existing coverage', budget_range: 'Premium range', priority: 'Priority',
  notes: 'Summary notes', consent_obtained: 'Consent', consent_date: 'Consent date', consent_source: 'Consent source',
  preferred_contact_method: 'Contact method', do_not_contact: 'Do not contact', insurance_interests: 'Insurance interest',
  stage: 'Stage', estimated_annual_premium: 'Estimated premium', actual_annualized_premium: 'Actual premium',
  policy_issued_date: 'Issued date', application_submitted_date: 'Submitted date', name: 'Name', product_category: 'Category',
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length ? `${value.length} selected` : 'none'
  return String(value)
}

export function HistoryTab({ prospectId }: { prospectId: number }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: qk.prospectHistory(prospectId), queryFn: () => prospectService.history(prospectId) })
  if (error) return <Card><ErrorState error={error} onRetry={refetch} /></Card>
  if (isLoading || !data) return <Card><ListSkeleton /></Card>
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Status transitions" />
        <ol className="divide-y divide-line px-5 py-2">
          {data.status_history.map((h) => (
            <li key={h.id} className="py-3 text-sm">
              <p className="text-ink-900">
                {h.from_status ? (
                  <>
                    <span className="text-ink-500">{h.from_status_label}</span> → <span className="font-medium">{h.to_status_label}</span>
                  </>
                ) : (
                  <>Created as <span className="font-medium">{h.to_status_label}</span></>
                )}
                {h.is_reopen && <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">Reopened</span>}
              </p>
              {h.reason && <p className="mt-0.5 text-xs text-ink-600">Reason: {h.reason}</p>}
              <p className="mt-0.5 text-xs text-ink-400">{formatDateTime(h.changed_at)} · {h.changed_by_name}</p>
            </li>
          ))}
        </ol>
      </Card>
      <Card>
        <CardHeader title="Record changes" description="Edits, archive/restore and opportunity changes" />
        {data.changes.length === 0 ? (
          <EmptyState compact icon={History} title="No changes recorded" />
        ) : (
          <ol className="divide-y divide-line px-5 py-2">
            {data.changes.map((c) => (
              <li key={c.id} className="py-3 text-sm">
                <p className="font-medium text-ink-900">{c.action_label}</p>
                <ul className="mt-1 space-y-0.5 text-xs text-ink-600">
                  {Object.entries(c.changes)
                    .filter(([, v]) => Array.isArray(v) && v.length === 2)
                    .map(([field, v]) => {
                      const [from, to] = v as [unknown, unknown]
                      return (
                        <li key={field}>
                          {FIELD_LABELS[field] ?? field}: <span className="text-ink-400 line-through">{show(from)}</span> → {show(to)}
                        </li>
                      )
                    })}
                </ul>
                <p className="mt-1 text-xs text-ink-400">{formatDateTime(c.created_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  )
}
