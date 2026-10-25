import { useMutation } from '@tanstack/react-query'
import { Archive, ArchiveRestore, CalendarPlus, Eye, MoreHorizontal, Pencil, PencilLine } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu'
import { useQuickActions } from '@/features/quick-actions/QuickActions'
import { errorMessage } from '@/lib/api'
import { invalidateCrm } from '@/lib/queryKeys'
import { prospectService } from '@/services'
import type { ProspectListItem } from '@/types/api'

export function ProspectRowActions({ prospect }: { prospect: ProspectListItem }) {
  const navigate = useNavigate()
  const { scheduleFollowUp, logActivity } = useQuickActions()
  const [confirmArchive, setConfirmArchive] = useState(false)

  const archive = useMutation({
    mutationFn: () => (prospect.is_archived ? prospectService.restore(prospect.id) : prospectService.archive(prospect.id)),
    onSuccess: () => {
      toast.success(prospect.is_archived ? `${prospect.full_name} restored` : `${prospect.full_name} archived`, {
        description: prospect.is_archived ? 'Back in your active list.' : 'Hidden from active lists. History is kept.',
      })
      invalidateCrm()
      setConfirmArchive(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const ref = { id: prospect.id, full_name: prospect.full_name }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${prospect.full_name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => navigate(`/prospects/${prospect.id}`)}>
            <Eye /> View profile
          </DropdownMenuItem>
          {!prospect.is_archived && (
            <>
              <DropdownMenuItem onSelect={() => navigate(`/prospects/${prospect.id}/edit`)}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => scheduleFollowUp({ prospect: ref })}>
                <CalendarPlus /> Schedule follow-up
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => logActivity({ prospect: ref })}>
                <PencilLine /> Log activity
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          {prospect.is_archived ? (
            <DropdownMenuItem onSelect={() => archive.mutate()}>
              <ArchiveRestore /> Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem tone="danger" onSelect={() => setConfirmArchive(true)}>
              <Archive /> Archive
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`Archive ${prospect.full_name}?`}
        description="Archived prospects are hidden from lists, the pipeline, the calendar and metrics. Their history is kept and you can restore them at any time."
        confirmLabel="Archive"
        tone="danger"
        loading={archive.isPending}
        onConfirm={() => archive.mutate()}
      />
    </>
  )
}
