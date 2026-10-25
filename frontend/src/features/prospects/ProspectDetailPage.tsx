import { useMutation, useQuery } from '@tanstack/react-query'
import { Archive, ArchiveRestore, ArrowLeft, CalendarPlus, Mail, MessageSquareText, MoreHorizontal, Pencil, PencilLine, Phone, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { DemoBadge, PriorityBadge } from '@/components/data-display/badges'
import { Avatar } from '@/components/data-display/common'
import { ErrorState } from '@/components/data-display/states'
import { FormField } from '@/components/forms/FormField'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu'
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { ApiError, errorMessage } from '@/lib/api'
import { formatDate, formatRelativeDay, timeAgo } from '@/lib/datetime'
import { invalidateCrm, qk } from '@/lib/queryKeys'
import { prospectService } from '@/services'

import { StatusChanger } from './ChangeStatus'
import { FollowUpsTab, HistoryTab, NotesTab, OpportunitiesTab, OverviewTab, TimelineTab } from './ProspectTabs'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'follow-ups', label: 'Follow-ups' },
  { value: 'opportunities', label: 'Opportunities' },
  { value: 'notes', label: 'Notes' },
  { value: 'history', label: 'History' },
]

export function ProspectDetailPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab')! : 'overview'
  const { scheduleFollowUp, logActivity } = useQuickActions()
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null)
  const [confirmName, setConfirmName] = useState('')

  const { data: prospect, isLoading, error, refetch } = useQuery({ queryKey: qk.prospect(id), queryFn: () => prospectService.get(id), enabled: Number.isFinite(id) })

  const archive = useMutation({
    mutationFn: () => (prospect!.is_archived ? prospectService.restore(id) : prospectService.archive(id)),
    onSuccess: (p) => {
      toast.success(p.is_archived ? 'Prospect archived' : 'Prospect restored')
      invalidateCrm()
      setConfirm(null)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: () => prospectService.remove(id, confirmName),
    onSuccess: () => {
      toast.success('Prospect permanently deleted')
      invalidateCrm()
      navigate('/prospects?archived=archived', { replace: true })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (error) {
    return (
      <div className="card">
        <ErrorState error={error instanceof ApiError && error.status === 404 ? new Error('This prospect does not exist or you do not have access to it.') : error} onRetry={refetch} />
      </div>
    )
  }
  if (isLoading || !prospect) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading prospect">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  const ref = { id: prospect.id, full_name: prospect.full_name }

  return (
    <div>
      <Link to="/prospects" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="size-4" /> Prospects
      </Link>

      {prospect.is_archived && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-ink-200 bg-ink-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-700">
            <Archive className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
            Archived {formatDate(prospect.archived_at)}. It’s hidden from lists and metrics; history is kept.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => archive.mutate()} loading={archive.isPending}>
              <ArchiveRestore /> Restore
            </Button>
            <Button variant="ghost" size="sm" className="text-brand-700" onClick={() => setConfirm('delete')}>
              <Trash2 /> Delete permanently
            </Button>
          </div>
        </div>
      )}

      <section className="card mb-5 overflow-hidden">
        <div className="h-12 bg-gradient-to-r from-brand-600 to-brand-800 sm:h-14" aria-hidden />
        <div className="px-5 pb-5 sm:px-6">
          <div className="-mt-6 flex flex-col gap-4 sm:-mt-7 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-start gap-4">
              <Avatar name={prospect.full_name} className="size-16 border-4 border-white text-lg shadow-sm sm:size-[72px]" />
              <div className="min-w-0 pt-8 sm:pt-9">
                <h1 className="truncate text-lg font-semibold text-ink-900 sm:text-xl">{prospect.full_name}</h1>
                <p className="truncate text-[13px] text-ink-500">
                  {[prospect.occupation, prospect.company].filter(Boolean).join(' · ') || 'No occupation recorded'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => navigate(`/prospects/${id}/edit`)} disabled={prospect.is_archived}>
                <Pencil /> Edit prospect
              </Button>
              <Button onClick={() => scheduleFollowUp({ prospect: ref })} disabled={prospect.is_archived}>
                <CalendarPlus /> Follow-up
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusChanger prospectId={prospect.id} prospectName={prospect.full_name} status={prospect.status} disabled={prospect.is_archived} />
            <PriorityBadge priority={prospect.priority} />
            {prospect.is_demo && <DemoBadge />}
            {prospect.do_not_contact && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">Do not contact</span>}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {prospect.mobile && (
              <Button variant="soft" size="sm" asChild>
                <a href={`tel:${prospect.mobile}`}><Phone /> Call</a>
              </Button>
            )}
            {prospect.mobile && (
              <Button variant="soft" size="sm" asChild>
                <a href={`sms:${prospect.mobile}`}><MessageSquareText /> Text</a>
              </Button>
            )}
            {prospect.email && (
              <Button variant="soft" size="sm" asChild>
                <a href={`mailto:${prospect.email}`}><Mail /> Email</a>
              </Button>
            )}
            <Button variant="soft" size="sm" onClick={() => logActivity({ prospect: ref })} disabled={prospect.is_archived}>
              <PencilLine /> Log activity
            </Button>
            <div className="ml-auto flex items-center gap-4 text-xs text-ink-500">
              <span>Last contact: <span className="text-ink-700">{timeAgo(prospect.last_contacted_at)}</span></span>
              <span className="hidden sm:inline">Next: <span className="text-ink-700">{prospect.next_follow_up_at ? formatRelativeDay(prospect.next_follow_up_at) : 'None'}</span></span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="More actions"><MoreHorizontal /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {prospect.is_archived ? (
                    <>
                      <DropdownMenuItem onSelect={() => archive.mutate()}><ArchiveRestore /> Restore</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem tone="danger" onSelect={() => setConfirm('delete')}><Trash2 /> Delete permanently</DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem tone="danger" onSelect={() => setConfirm('archive')}><Archive /> Archive</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </section>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList className="mb-4">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview"><OverviewTab prospect={prospect} /></TabsContent>
        <TabsContent value="timeline"><TimelineTab prospectId={id} /></TabsContent>
        <TabsContent value="follow-ups"><FollowUpsTab prospect={prospect} /></TabsContent>
        <TabsContent value="opportunities"><OpportunitiesTab prospect={prospect} /></TabsContent>
        <TabsContent value="notes"><NotesTab prospect={prospect} /></TabsContent>
        <TabsContent value="history"><HistoryTab prospectId={id} /></TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirm === 'archive'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Archive ${prospect.full_name}?`}
        description="Archived prospects are hidden from lists, pipeline, calendar and metrics. Their history is kept, and you can restore them any time."
        confirmLabel="Archive"
        tone="danger"
        loading={archive.isPending}
        onConfirm={() => archive.mutate()}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => { if (!o) { setConfirm(null); setConfirmName('') } }}
        title="Permanently delete this prospect?"
        description="Use this for data-deletion requests. All notes, follow-ups, activities and opportunities for this prospect are erased and cannot be recovered. The audit log keeps only the record number."
        confirmLabel="Delete permanently"
        tone="danger"
        loading={remove.isPending}
        confirmDisabled={confirmName.trim().toLowerCase() !== prospect.full_name.toLowerCase()}
        onConfirm={() => remove.mutate()}
      >
        <FormField label={`Type “${prospect.full_name}” to confirm`}>
          <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
        </FormField>
      </ConfirmDialog>
    </div>
  )
}
