import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { forwardRef, useState } from 'react'

import { Avatar } from '@/components/data-display/common'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu'
import { useDebouncedValue } from '@/hooks'
import { cn } from '@/lib/utils'
import { prospectService } from '@/services'
import type { ProspectBrief, ProspectListItem } from '@/types/api'

interface ProspectPickerProps {
  value: number | undefined
  onChange: (id: number, prospect: ProspectListItem) => void
  initial?: Pick<ProspectBrief, 'id' | 'full_name'> | null
  disabled?: boolean
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/** Searchable combobox over the user's active prospects. */
export const ProspectPicker = forwardRef<HTMLButtonElement, ProspectPickerProps>(function ProspectPicker(
  { value, onChange, initial, disabled, ...aria },
  ref,
) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [selectedName, setSelectedName] = useState(initial?.full_name ?? '')
  const debounced = useDebouncedValue(term.trim(), 200)

  const { data, isLoading } = useQuery({
    queryKey: ['prospect-picker', debounced],
    queryFn: ({ signal }) => prospectService.list({ search: debounced, page_size: 8, ordering: 'name' }, signal),
    enabled: open,
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          ref={ref}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={value ? `Prospect: ${selectedName || value}` : 'Choose a prospect'}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-line bg-white px-3.5 text-left text-sm shadow-xs hover:border-ink-300 disabled:cursor-not-allowed disabled:bg-ink-50 aria-[invalid=true]:border-brand-500"
          {...aria}
        >
          <span className={cn('truncate', !value && 'text-ink-400')}>{value ? selectedName || `Prospect #${value}` : 'Choose a prospect…'}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-ink-400" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-1.5">
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search by name or phone"
            aria-label="Search prospects"
            className="h-9 w-full rounded-lg border border-line pr-3 pl-9 text-sm focus:border-brand-300 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
        </div>
        <ul role="listbox" className="max-h-64 overflow-y-auto">
          {isLoading && <li className="px-3 py-2 text-sm text-ink-500">Loading…</li>}
          {data?.results.length === 0 && <li className="px-3 py-2 text-sm text-ink-500">No matching prospects.</li>}
          {data?.results.map((prospect) => (
            <li key={prospect.id} role="option" aria-selected={prospect.id === value}>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-ink-50"
                onClick={() => {
                  setSelectedName(prospect.full_name)
                  onChange(prospect.id, prospect)
                  setOpen(false)
                }}
              >
                <Avatar name={prospect.full_name} className="size-7 text-[10px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink-900">{prospect.full_name}</span>
                  <span className="block truncate text-xs text-ink-500">{prospect.mobile || prospect.email}</span>
                </span>
                {prospect.id === value && <Check className="size-4 text-brand-600" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
})
