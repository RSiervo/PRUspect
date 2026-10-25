import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FlaskConical, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { ErrorState, ListSkeleton } from '@/components/data-display/states'
import { FormField } from '@/components/forms/FormField'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input, Select } from '@/components/ui/input'
import { Card, CardHeader, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { useAuth } from '@/features/auth/AuthProvider'
import { InstallAppDialog } from '@/features/install/InstallApp'
import { useInstallApp } from '@/lib/pwa'
import { errorMessage } from '@/lib/api'
import { REMINDER_OPTIONS } from '@/lib/constants'
import { COMMON_TIME_ZONES, setTimeZone } from '@/lib/datetime'
import { applyServerErrors } from '@/lib/forms'
import { invalidateCrm, qk } from '@/lib/queryKeys'
import { passwordSchema, setPasswordSchema, type PasswordValues } from '@/schemas'

import { CalendarSyncCard } from './CalendarSyncCard'
import { PushCard } from './PushCard'
import { TwoFactorCard } from './TwoFactorCard'
import { TemplatesTab } from './TemplatesTab'
import { authService, prospectService, settingsService } from '@/services'
import type { ProspectSource, UserSettings } from '@/types/api'

function ProfileTab() {
  const { user, setUser } = useAuth()
  const [form, setForm] = useState({ first_name: user?.first_name ?? '', last_name: user?.last_name ?? '', job_title: user?.job_title ?? '' })
  const save = useMutation({
    mutationFn: () => authService.updateMe(form),
    onSuccess: (u) => {
      setUser(u)
      toast.success('Profile saved')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const hasPassword = user?.has_password ?? true
  const pw = useForm<PasswordValues>({
    resolver: zodResolver(hasPassword ? passwordSchema : setPasswordSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })
  const changePw = useMutation({
    mutationFn: (v: PasswordValues) => authService.changePassword(v.current_password, v.new_password),
    onSuccess: () => {
      toast.success(hasPassword ? 'Password changed' : 'Password set', {
        description: hasPassword ? 'Other signed-in sessions were signed out.' : 'You can now also sign in with your email and password.',
      })
      pw.reset()
      if (user && !hasPassword) setUser({ ...user, has_password: true })
    },
    onError: (e) => applyServerErrors(e, pw.setError, {}, ['current_password', 'new_password']),
  })

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Profile"
          description={user?.email}
          action={user?.google_linked ? <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 ring-1 ring-sky-200">Signed in with Google</span> : undefined}
        />
        <form className="grid gap-4 p-5" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="First name"><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></FormField>
            <FormField label="Last name"><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></FormField>
          </div>
          <FormField label="Job title"><Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></FormField>
          <div className="flex justify-end"><Button type="submit" loading={save.isPending}>Save profile</Button></div>
          {user?.manager && (
            <p className="rounded-xl bg-ink-50 p-3 text-xs leading-relaxed text-ink-600">
              Your manager <strong>{user.manager.full_name}</strong> can see your totals (prospect counts, follow-ups, appointments, policies). They can’t see your prospects’ names or details.
            </p>
          )}
        </form>
      </Card>
      <Card>
        <CardHeader
          title={hasPassword ? 'Change password' : 'Set a password'}
          description={hasPassword ? 'At least 10 characters. Avoid common passwords.' : 'Optional: lets you sign in with email and password as well as Google.'}
        />
        <form className="grid gap-4 p-5" onSubmit={pw.handleSubmit((v) => changePw.mutate(v))} noValidate>
          {hasPassword && (
            <FormField label="Current password" error={pw.formState.errors.current_password?.message}><Input type="password" autoComplete="current-password" {...pw.register('current_password')} /></FormField>
          )}
          <FormField label="New password" error={pw.formState.errors.new_password?.message}><Input type="password" autoComplete="new-password" {...pw.register('new_password')} /></FormField>
          <FormField label="Confirm new password" error={pw.formState.errors.confirm_password?.message}><Input type="password" autoComplete="new-password" {...pw.register('confirm_password')} /></FormField>
          <div className="flex justify-end"><Button type="submit" loading={changePw.isPending}>{hasPassword ? 'Change password' : 'Set password'}</Button></div>
        </form>
      </Card>
      <TwoFactorCard />
    </div>
  )
}

function InstallCard() {
  const { state } = useInstallApp()
  const [open, setOpen] = useState(false)
  return (
    <Card className="max-w-2xl">
      <CardHeader title="Install the app" description="Add PRUspect to your phone’s home screen or your computer’s apps." />
      <div className="flex items-center justify-between gap-3 p-5">
        <p className="text-sm text-ink-600">
          {state === 'installed' ? 'You’re using the installed app on this device.' : state === 'ios' ? 'On iPhone/iPad: Share → Add to Home Screen.' : 'Works in Chrome and Edge on Android and desktop, and Safari on iPhone.'}
        </p>
        {state !== 'installed' && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            <Download /> Install
          </Button>
        )}
      </div>
      <InstallAppDialog open={open} onOpenChange={setOpen} />
    </Card>
  )
}

function PreferencesTab() {
  const { user, setUser } = useAuth()
  const { data, isLoading, error, refetch } = useQuery({ queryKey: qk.settings, queryFn: settingsService.get })
  const [form, setForm] = useState<Partial<UserSettings>>({})
  useEffect(() => { if (data) setForm(data) }, [data])
  const save = useMutation({
    mutationFn: () => settingsService.update({ time_zone: form.time_zone, currency: form.currency, default_reminder_minutes: form.default_reminder_minutes, archive_retention_days: form.archive_retention_days }),
    onSuccess: (s) => {
      setTimeZone(s.time_zone)
      if (user) setUser({ ...user, time_zone: s.time_zone })
      invalidateCrm()
      toast.success('Preferences saved')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  if (error) return <Card><ErrorState error={error} onRetry={refetch} /></Card>
  if (isLoading || !data) return <Card><ListSkeleton rows={3} /></Card>
  const zones = !form.time_zone || COMMON_TIME_ZONES.includes(form.time_zone) ? COMMON_TIME_ZONES : [form.time_zone, ...COMMON_TIME_ZONES]
  return (
    <Card className="max-w-2xl">
      <CardHeader title="Preferences" />
      <form className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate() }}>
        <FormField label="Display timezone" hint="Dates, “today” and “overdue” use this timezone.">
          <Select value={form.time_zone} onChange={(e) => setForm({ ...form, time_zone: e.target.value })}>
            {zones.map((z) => <option key={z} value={z}>{z.replace('_', ' ')}{z === 'Asia/Manila' ? ' (Philippine Time)' : ''}</option>)}
          </Select>
        </FormField>
        <FormField label="Default currency"><Input maxLength={3} value={form.currency ?? ''} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></FormField>
        <FormField label="Default follow-up reminder" hint="In-app only.">
          <Select value={String(form.default_reminder_minutes ?? 30)} onChange={(e) => setForm({ ...form, default_reminder_minutes: Number(e.target.value || 0) })}>
            {REMINDER_OPTIONS.filter((o) => o.value !== '').map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Archived record retention target (days)" hint="0 = keep until you delete. Informational; see Data & Privacy.">
          <Input type="number" min={0} value={form.archive_retention_days ?? 0} onChange={(e) => setForm({ ...form, archive_retention_days: Math.max(0, Number(e.target.value)) })} />
        </FormField>
        <div className="flex justify-end sm:col-span-2"><Button type="submit" loading={save.isPending}>Save preferences</Button></div>
      </form>
    </Card>
  )
}

function ChoiceList({ kind }: { kind: 'sources' | 'categories' }) {
  const queryClient = useQueryClient()
  const key = ['settings', kind]
  const { data, isLoading, error, refetch } = useQuery({ queryKey: key, queryFn: kind === 'sources' ? settingsService.sources : settingsService.categories })
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<ProspectSource | null>(null)
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key })
    void queryClient.invalidateQueries({ queryKey: qk.prospectOptions })
  }
  const add = useMutation({
    mutationFn: () => (kind === 'sources' ? settingsService.createSource({ name, sort_order: (data?.length ?? 0) + 1 }) : settingsService.createCategory({ name, sort_order: (data?.length ?? 0) + 1 })),
    onSuccess: () => { setName(''); refresh(); toast.success('Added') },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const toggle = useMutation({
    mutationFn: (item: ProspectSource) => (kind === 'sources' ? settingsService.updateSource(item.id, { is_active: !item.is_active }) : settingsService.updateCategory(item.id, { is_active: !item.is_active })),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: number) => (kind === 'sources' ? settingsService.deleteSource(id) : settingsService.deleteCategory(id)),
    onSuccess: () => { setDeleting(null); refresh(); toast.success('Deleted') },
    onError: (e) => { setDeleting(null); toast.error(errorMessage(e)) },
  })
  const label = kind === 'sources' ? 'prospect source' : 'insurance interest category'
  return (
    <Card className="max-w-2xl">
      <CardHeader
        title={kind === 'sources' ? 'Prospect sources' : 'Insurance interest categories'}
        description={kind === 'sources' ? 'Where your prospects come from.' : 'Generic interest areas. Confirm actual product availability through authorized company sources.'}
      />
      <form className="flex gap-2 p-5 pb-3" onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate() }}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${label}`} aria-label={`New ${label}`} maxLength={80} />
        <Button type="submit" loading={add.isPending} disabled={!name.trim()}><Plus /> Add</Button>
      </form>
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <ListSkeleton rows={4} /> : (
        <ul className="divide-y divide-line px-5 pb-3">
          {data?.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <span className={item.is_active ? 'flex-1 text-sm text-ink-900' : 'flex-1 text-sm text-ink-400 line-through'}>{item.name}</span>
              <label className="flex items-center gap-2 text-xs text-ink-500">
                Active
                <Switch checked={item.is_active} onCheckedChange={() => toggle.mutate(item)} aria-label={`${item.name} active`} />
              </label>
              <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(item)} aria-label={`Delete ${item.name}`}><Trash2 /></Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="Options already used by prospects can’t be deleted — deactivate them instead so existing records stay intact."
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </Card>
  )
}

function PrivacyTab() {
  const { data } = useQuery({ queryKey: ['settings', 'demo'], queryFn: settingsService.demoData })
  const [confirm, setConfirm] = useState(false)
  const removeDemo = useMutation({
    mutationFn: settingsService.removeDemoData,
    onSuccess: (r) => { toast.success(`Removed ${r.deleted} demo prospects`); setConfirm(false); invalidateCrm() },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const exportAll = useMutation({
    mutationFn: () => prospectService.exportCsv({ archived: 'all' }),
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <div className="grid max-w-4xl grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader title="How your prospect data is handled" />
        <ul className="space-y-2.5 p-5 text-sm text-ink-700">
          {[
            'Only you can see your records. Every API request checks ownership on the server.',
            'Collect only what prospecting needs. Don’t store government IDs, bank details, passwords or detailed medical information.',
            'Archiving hides a prospect everywhere but keeps their history. Permanent deletion (for erasure requests) is available on an archived prospect’s profile and cannot be undone.',
            'Correction requests: edit the prospect — every change is recorded in the History tab.',
            'Exports and configuration changes are recorded in the audit log.',
            'Before importing real prospect data, confirm this tool is authorized under the Data Privacy Act of 2012 and your company’s data-handling policies.',
          ].map((t) => (
            <li key={t} className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />{t}</li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Export your records" description="CSV of all prospects, including archived." />
        <div className="p-5"><Button variant="secondary" onClick={() => exportAll.mutate()} loading={exportAll.isPending}><Download /> Export all prospects</Button></div>
      </Card>
      <Card>
        <CardHeader title="Demo data" description="Sample records created with the seed_demo command." />
        <div className="flex items-center justify-between gap-3 p-5">
          <p className="flex items-center gap-2 text-sm text-ink-700"><FlaskConical className="size-4 text-indigo-600" aria-hidden />{data ? `${data.demo_prospects} demo prospects` : '…'}</p>
          <Button variant="danger" size="sm" disabled={!data?.demo_prospects} onClick={() => setConfirm(true)}><Trash2 /> Remove demo data</Button>
        </div>
      </Card>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Remove all demo data?"
        description="All prospects marked Demo — with their follow-ups, notes and opportunities — are permanently deleted. Your real records are not affected."
        confirmLabel="Remove demo data"
        tone="danger"
        loading={removeDemo.isPending}
        onConfirm={() => removeDemo.mutate()}
      />
    </div>
  )
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'preferences'
  return (
    <div>
      <PageHeader title="Settings" description="Your account, preferences, choice lists and privacy controls." />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList className="mb-4">
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
          <TabsTrigger value="profile">Profile & security</TabsTrigger>
          <TabsTrigger value="sources">Sources</TabsTrigger>
          <TabsTrigger value="categories">Insurance interests</TabsTrigger>
          <TabsTrigger value="templates">Message templates</TabsTrigger>
          <TabsTrigger value="privacy">Data & privacy</TabsTrigger>
        </TabsList>
        <TabsContent value="preferences" className="space-y-4"><PreferencesTab /><PushCard /><CalendarSyncCard /><InstallCard /></TabsContent>
        <TabsContent value="profile"><ProfileTab /></TabsContent>
        <TabsContent value="sources"><ChoiceList kind="sources" /></TabsContent>
        <TabsContent value="categories"><ChoiceList kind="categories" /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        <TabsContent value="privacy"><PrivacyTab /></TabsContent>
      </Tabs>
    </div>
  )
}
