import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState, ErrorState, ListSkeleton } from '@/components/data-display/states'
import { FormField } from '@/components/forms/FormField'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Badge, Card, CardHeader } from '@/components/ui/misc'
import { errorMessage } from '@/lib/api'
import { templateService } from '@/services'
import type { MessageChannel, MessageTemplate } from '@/types/api'

const CHANNELS: { value: MessageChannel; label: string }[] = [
  { value: 'any', label: 'Any channel' },
  { value: 'sms', label: 'Text message' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'viber', label: 'Viber' },
  { value: 'email', label: 'Email' },
]
const PLACEHOLDERS = ['{first_name}', '{preferred_name}', '{full_name}', '{advisor_name}', '{next_follow_up}']

function TemplateDialog({ template, onClose }: { template: MessageTemplate | null | undefined; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: '', channel: 'any' as MessageChannel, subject: '', body: '' })
  useEffect(() => {
    if (template !== undefined) {
      setForm(template ? { name: template.name, channel: template.channel, subject: template.subject, body: template.body } : { name: '', channel: 'any', subject: '', body: '' })
    }
  }, [template])
  const save = useMutation({
    mutationFn: () => (template ? templateService.update(template.id, form) : templateService.create(form)),
    onSuccess: () => {
      toast.success(template ? 'Template saved' : 'Template added')
      void queryClient.invalidateQueries({ queryKey: ['message-templates'] })
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  if (template === undefined) return null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={template ? 'Edit template' : 'New template'}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!form.name.trim() || !form.body.trim()}>
              Save
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Name" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} />
          </FormField>
          <FormField label="Channel">
            <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as MessageChannel })}>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </FormField>
          {(form.channel === 'email' || form.channel === 'any') && (
            <FormField label="Email subject" optional className="sm:col-span-2">
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={160} />
            </FormField>
          )}
          <FormField label="Message" required className="sm:col-span-2" hint="Placeholders are replaced with the prospect’s details when you send.">
            <Textarea rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={2000} />
          </FormField>
          <div className="flex flex-wrap gap-1.5 sm:col-span-2">
            {PLACEHOLDERS.map((ph) => (
              <button key={ph} type="button" onClick={() => setForm((f) => ({ ...f, body: `${f.body}${f.body && !f.body.endsWith(' ') ? ' ' : ''}${ph}` }))} className="rounded-md bg-ink-100 px-2 py-1 font-mono text-[11px] text-ink-700 hover:bg-ink-200">
                {ph}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function TemplatesTab() {
  const queryClient = useQueryClient()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['message-templates'], queryFn: templateService.list })
  const [editing, setEditing] = useState<MessageTemplate | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<MessageTemplate | null>(null)
  const remove = useMutation({
    mutationFn: (id: number) => templateService.remove(id),
    onSuccess: () => {
      toast.success('Template deleted')
      setDeleting(null)
      void queryClient.invalidateQueries({ queryKey: ['message-templates'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Card className="max-w-3xl">
      <CardHeader
        title="Message templates"
        description="Used by the Message button on a prospect’s profile. PRUspect opens your own app to send — nothing is sent automatically."
        action={
          <Button size="sm" onClick={() => setEditing(null)}>
            <Plus /> New
          </Button>
        }
      />
      <div className="py-2">
        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <ListSkeleton rows={3} />
        ) : !data?.length ? (
          <EmptyState compact icon={MessageSquareText} title="No templates yet" />
        ) : (
          <ul className="divide-y divide-line">
            {data.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13px] font-medium text-ink-900">
                    {t.name}
                    <Badge className="h-5 bg-ink-100 text-[10.5px] text-ink-600 ring-ink-200">{CHANNELS.find((c) => c.value === t.channel)?.label}</Badge>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{t.body}</p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(t)} aria-label={`Delete ${t.name}`}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <TemplateDialog template={editing} onClose={() => setEditing(undefined)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </Card>
  )
}
