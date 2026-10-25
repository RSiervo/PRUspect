import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/input'
import { Card, CardHeader, Switch } from '@/components/ui/misc'
import { errorMessage } from '@/lib/api'
import { invalidateCrm } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { prospectService } from '@/services'
import type { ImportPreview, ImportResult, ImportValidation } from '@/types/api'

const FIELD_LABELS: Record<string, string> = {
  full_name: 'Full name (split automatically)',
  first_name: 'First name',
  last_name: 'Last name',
  preferred_name: 'Preferred name',
  mobile: 'Mobile number',
  email: 'Email',
  birth_date: 'Birth date',
  occupation: 'Occupation',
  company: 'Company',
  location: 'City / location',
  source: 'Prospect source',
  referral_name: 'Referred by',
  insurance_interests: 'Insurance interest',
  existing_coverage: 'Existing coverage',
  priority: 'Priority',
  status: 'Status',
  notes: 'Notes',
  consent_obtained: 'Consent obtained (yes/no)',
}
const CHUNK = 200

function downloadTemplate() {
  const header = 'First Name,Last Name,Mobile,Email,Occupation,Company,City,Source,Interest,Priority,Status,Notes\n'
  const sample = 'Maria,Santos,0917 123 4567,maria@example.com,Nurse,Metro Hospital,Makati City,Referral,Health; Retirement,High,Contacted,Met at seminar\n'
  const url = URL.createObjectURL(new Blob(['﻿' + header + sample], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'pruspect-import-template.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Steps({ step }: { step: number }) {
  const labels = ['Upload', 'Match columns', 'Review', 'Done']
  return (
    <ol className="mb-5 flex items-center gap-2 text-xs" aria-label="Import steps">
      {labels.map((label, i) => (
        <li key={label} className="flex items-center gap-2" aria-current={i === step ? 'step' : undefined}>
          <span className={cn('grid size-6 place-items-center rounded-full font-semibold', i < step ? 'bg-emerald-600 text-white' : i === step ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-500')}>
            {i < step ? '✓' : i + 1}
          </span>
          <span className={cn('hidden sm:inline', i === step ? 'font-medium text-ink-900' : 'text-ink-500')}>{label}</span>
          {i < labels.length - 1 && <span className="h-px w-6 bg-line sm:w-10" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}

export function ImportPage() {
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState(0)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [validation, setValidation] = useState<ImportValidation | null>(null)
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragging, setDragging] = useState(false)

  const read = useMutation({
    mutationFn: (file: File) => prospectService.importPreview(file),
    onSuccess: (data) => {
      setPreview(data)
      setMapping(data.suggested_mapping)
      setStep(1)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const check = useMutation({
    mutationFn: () => prospectService.importValidate(preview!.rows, mapping),
    onSuccess: (data) => {
      setValidation(data)
      setStep(2)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const commit = useMutation({
    mutationFn: async () => {
      const rows = preview!.rows
      const total: ImportResult = { created: 0, skipped_duplicates: 0, invalid: 0 }
      for (let i = 0; i < rows.length; i += CHUNK) {
        const part = await prospectService.importCommit(rows.slice(i, i + CHUNK), mapping, skipDuplicates)
        total.created += part.created
        total.skipped_duplicates += part.skipped_duplicates
        total.invalid += part.invalid
        setProgress(Math.round(((i + CHUNK) / rows.length) * 100))
      }
      return total
    },
    onSuccess: (data) => {
      setResult(data)
      setStep(3)
      invalidateCrm()
    },
    onError: (e) => toast.error(errorMessage(e), { description: 'Rows imported before the error were saved. Re-check the file and try again.' }),
  })

  const pick = (file: File | undefined) => file && read.mutate(file)
  const mapped = new Set(Object.values(mapping))
  const hasName = mapped.has('first_name') || mapped.has('last_name') || mapped.has('full_name')
  const hasContact = mapped.has('mobile') || mapped.has('email')
  const importable = validation ? validation.rows.filter((r) => r.valid && !(skipDuplicates && r.duplicate_of)).length : 0

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/prospects" className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="size-4" /> Prospects
      </Link>
      <PageHeader title="Import prospects" description="Bring in an existing list from Excel or a CSV file. Nothing is saved until you confirm." />
      <Steps step={step} />

      {step === 0 && (
        <Card className="p-5 sm:p-6">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              pick(e.dataTransfer.files[0])
            }}
            className={cn('flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors', dragging ? 'border-brand-400 bg-brand-50/50' : 'border-line')}
          >
            <FileSpreadsheet className="size-10 text-ink-300" aria-hidden />
            <p className="mt-3 text-sm font-medium text-ink-900">Drop your file here, or choose one</p>
            <p className="mt-1 text-xs text-ink-500">Excel (.xlsx) or CSV · up to 2,000 rows · first row must be column headings</p>
            <input ref={fileInput} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} aria-label="Choose file" />
            <Button className="mt-5" onClick={() => fileInput.current?.click()} loading={read.isPending}>
              <Upload /> Choose file
            </Button>
          </div>
          <div className="mt-4 flex flex-col gap-2 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Only import people who agreed to be contacted. Don’t include government IDs, bank or medical details.</span>
            <Button variant="link" size="sm" onClick={downloadTemplate}>
              <Download /> Download template
            </Button>
          </div>
        </Card>
      )}

      {step === 1 && preview && (
        <Card>
          <CardHeader title="Match your columns" description={`${preview.file_name} · ${preview.rows.length} rows. We guessed the matches — check them.`} />
          <div className="divide-y divide-line px-4 py-2 sm:px-5">
            {preview.headers.map((header, index) => {
              const samples = preview.rows.slice(0, 3).map((r) => r[index]).filter(Boolean)
              return (
                <div key={index} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_1fr] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink-900">{header}</p>
                    <p className="truncate text-xs text-ink-500">{samples.length ? samples.join(' · ') : 'empty'}</p>
                  </div>
                  <Select
                    aria-label={`Field for ${header}`}
                    value={mapping[String(index)] ?? ''}
                    onChange={(e) => {
                      const value = e.target.value
                      setMapping((m) => {
                        const next = Object.fromEntries(Object.entries(m).filter(([k, v]) => k !== String(index) && v !== value))
                        if (value) next[String(index)] = value
                        return next
                      })
                    }}
                  >
                    <option value="">Don’t import</option>
                    {preview.fields.map((f) => (
                      <option key={f} value={f}>
                        {FIELD_LABELS[f] ?? f}
                      </option>
                    ))}
                  </Select>
                </div>
              )
            })}
          </div>
          <div className="flex flex-col gap-3 border-t border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-ink-500">
              {!hasName ? <span className="text-brand-700">Match a name column to continue.</span> : !hasContact ? <span className="text-amber-700">No mobile or email column — rows without contact details will be rejected.</span> : 'Ready to check your rows.'}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={() => check.mutate()} loading={check.isPending} disabled={!hasName}>
                Check rows
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 2 && validation && (
        <Card>
          <CardHeader title="Review" description="Rows with problems are skipped. Fix them in your file and import again if needed." />
          <div className="grid grid-cols-3 gap-3 px-4 pt-4 sm:px-5">
            <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Ready</p><p className="tabular text-xl font-semibold text-emerald-900">{validation.summary.valid}</p></div>
            <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-700">Possible duplicates</p><p className="tabular text-xl font-semibold text-amber-900">{validation.summary.duplicates}</p></div>
            <div className="rounded-xl bg-brand-50 p-3"><p className="text-xs text-brand-700">With problems</p><p className="tabular text-xl font-semibold text-brand-900">{validation.summary.invalid}</p></div>
          </div>
          <label className="mx-4 mt-4 flex items-center justify-between gap-3 rounded-xl border border-line p-3 sm:mx-5">
            <span className="text-sm text-ink-800">Skip possible duplicates (same mobile or email)</span>
            <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} aria-label="Skip possible duplicates" />
          </label>
          <ul className="mt-3 max-h-[50vh] divide-y divide-line overflow-y-auto border-y border-line">
            {validation.rows.map((r) => (
              <li key={r.row} className="flex items-start gap-3 px-4 py-2.5 text-sm sm:px-5">
                {!r.valid ? <XCircle className="mt-0.5 size-4 shrink-0 text-brand-600" aria-label="Has problems" /> : r.duplicate_of ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Possible duplicate" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Ready" />}
                <div className="min-w-0 flex-1">
                  <p className="text-ink-900">
                    <span className="tabular mr-2 text-xs text-ink-400">Row {r.row}</span>
                    {r.name || <span className="text-ink-400">No name</span>}
                  </p>
                  {Object.entries(r.errors).map(([field, messages]) => (
                    <p key={field} className="text-xs text-brand-700">{FIELD_LABELS[field] ?? field}: {messages.join(' ')}</p>
                  ))}
                  {r.duplicate_of && (
                    <p className="text-xs text-amber-700">
                      Same {r.duplicate_of.matched_on} as{' '}
                      {r.duplicate_of.type === 'existing' ? <Link className="underline" to={`/prospects/${r.duplicate_of.prospect_id}`} target="_blank">an existing prospect</Link> : `row ${r.duplicate_of.row} in this file`}
                    </p>
                  )}
                  {r.warnings.map((w) => (
                    <p key={w} className="text-xs text-ink-500">{w}</p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            {commit.isPending ? (
              <div className="flex-1" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Import progress">
                <div className="h-1.5 rounded-full bg-ink-100"><div className="h-1.5 rounded-full bg-brand-600 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} /></div>
              </div>
            ) : (
              <p className="text-xs text-ink-500">{importable} prospect{importable === 1 ? '' : 's'} will be added.</p>
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep(1)} disabled={commit.isPending}>
                Back
              </Button>
              <Button onClick={() => commit.mutate()} loading={commit.isPending} disabled={importable === 0}>
                Import {importable}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 3 && result && (
        <Card className="p-6 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold text-ink-900">Imported {result.created} prospect{result.created === 1 ? '' : 's'}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {result.skipped_duplicates ? `${result.skipped_duplicates} duplicate${result.skipped_duplicates === 1 ? '' : 's'} skipped. ` : ''}
            {result.invalid ? `${result.invalid} row${result.invalid === 1 ? ' had' : 's had'} problems and ${result.invalid === 1 ? 'was' : 'were'} skipped.` : ''}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => { setStep(0); setPreview(null); setValidation(null); setResult(null) }}>
              Import another file
            </Button>
            <Button onClick={() => navigate('/prospects?ordering=-created_at')}>View prospects</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
