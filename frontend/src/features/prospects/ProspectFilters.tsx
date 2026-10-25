import { Filter, LayoutGrid, Rows3, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { FilterPanel, FilterToggleButton, useFilterToggle } from '@/components/forms/FilterToggle'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuCheckItem, DropdownMenuContent, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu'
import { useDebouncedValue } from '@/hooks'
import { PRIORITIES, PRIORITY_META, STATUS_META, STATUS_ORDER } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { ProspectOptions } from '@/types/api'

export const FILTER_DEFAULTS = {
  search: '',
  status: '',
  priority: '',
  source: '',
  interest: '',
  created_from: '',
  created_to: '',
  milestone: '',
  ordering: '-created_at',
  page: '1',
  archived: 'active',
  view: '',
}
export type FilterState = typeof FILTER_DEFAULTS

const SORTS = [
  { value: '-created_at', label: 'Newest first' },
  { value: 'created_at', label: 'Oldest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: '-name', label: 'Name Z–A' },
  { value: 'priority', label: 'Priority (high first)' },
  { value: 'next_follow_up_at', label: 'Next follow-up (soonest)' },
  { value: '-last_contacted_at', label: 'Last contact (recent)' },
  { value: 'last_contacted_at', label: 'Last contact (longest ago)' },
]

function toggle(list: string, value: string) {
  const items = list ? list.split(',') : []
  return (items.includes(value) ? items.filter((v) => v !== value) : [...items, value]).join(',')
}

function MultiFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string; dot?: string }[]
  onChange: (value: string) => void
}) {
  const selected = value ? value.split(',') : []
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className={cn('h-9', selected.length && 'border-brand-200 bg-brand-50 text-brand-800')}>
          {label}
          {selected.length > 0 && <span className="tabular rounded-full bg-brand-600 px-1.5 text-[11px] text-white">{selected.length}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {options.map((option) => (
          <DropdownMenuCheckItem
            key={option.value}
            checked={selected.includes(option.value)}
            onSelect={(event) => {
              event.preventDefault()
              onChange(toggle(value, option.value))
            }}
          >
            {option.dot && <span className="size-2 rounded-full" style={{ background: option.dot }} aria-hidden />}
            {option.label}
          </DropdownMenuCheckItem>
        ))}
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange('')} className="mt-1 w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-brand-700 hover:bg-brand-50">
            Clear {label.toLowerCase()}
          </button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ProspectFilters({
  filters,
  update,
  options,
  view,
  onViewChange,
}: {
  filters: FilterState
  update: (patch: Partial<FilterState>) => void
  options?: ProspectOptions
  view: 'table' | 'cards'
  onViewChange: (view: 'table' | 'cards') => void
}) {
  const [term, setTerm] = useState(filters.search)
  const debounced = useDebouncedValue(term, 300)

  useEffect(() => {
    if (debounced !== filters.search) update({ search: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])
  useEffect(() => setTerm(filters.search), [filters.search])

  const panel = useFilterToggle()
  const activeCount = ['status', 'priority', 'source', 'interest', 'created_from', 'created_to', 'milestone'].filter(
    (k) => filters[k as keyof FilterState],
  ).length

  return (
    <div className="flex flex-col gap-3 border-b border-line p-3 sm:px-4">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search name, mobile, email or company" aria-label="Search prospects" className="pl-10" />
          {term && (
            <button type="button" onClick={() => setTerm('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
        <FilterToggleButton open={panel.open} onToggle={panel.toggle} activeCount={activeCount} controls="prospect-filters" />
        <div className="hidden items-center gap-2 md:flex">
          <Select value={filters.ordering} onChange={(e) => update({ ordering: e.target.value })} aria-label="Sort by" className="w-52">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <div className="flex rounded-lg border border-line bg-white p-0.5" role="radiogroup" aria-label="View">
            {(['table', 'cards'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                aria-label={v === 'table' ? 'Table view' : 'Card view'}
                onClick={() => onViewChange(v)}
                className={cn('grid size-7 place-items-center rounded-md text-ink-500', view === v && 'bg-brand-50 text-brand-700')}
              >
                {v === 'table' ? <Rows3 className="size-4" /> : <LayoutGrid className="size-4" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <FilterPanel id="prospect-filters" open={panel.open} className="flex-wrap items-center gap-2">
        <div className="w-full md:hidden">
          <Select value={filters.ordering} onChange={(e) => update({ ordering: e.target.value })} aria-label="Sort by">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>
        <Filter className="hidden size-4 text-ink-400 md:block" aria-hidden />
        <MultiFilter
          label="Status"
          value={filters.status}
          onChange={(status) => update({ status })}
          options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label, dot: STATUS_META[s].color }))}
        />
        <MultiFilter label="Priority" value={filters.priority} onChange={(priority) => update({ priority })} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
        <MultiFilter label="Source" value={filters.source} onChange={(source) => update({ source })} options={(options?.sources ?? []).map((s) => ({ value: String(s.id), label: s.name }))} />
        <MultiFilter
          label="Interest"
          value={filters.interest}
          onChange={(interest) => update({ interest })}
          options={(options?.product_categories ?? []).map((c) => ({ value: String(c.id), label: c.name }))}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm" className={cn('h-9', (filters.created_from || filters.created_to) && 'border-brand-200 bg-brand-50 text-brand-800')}>
              Date added
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="created_from">From</Label>
              <Input id="created_from" type="date" value={filters.created_from} onChange={(e) => update({ created_from: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="created_to">To</Label>
              <Input id="created_to" type="date" value={filters.created_to} min={filters.created_from || undefined} onChange={(e) => update({ created_to: e.target.value })} />
            </div>
          </PopoverContent>
        </Popover>
        <Select value={filters.milestone} onChange={(e) => update({ milestone: e.target.value })} aria-label="Milestone reached" className="h-9 w-auto min-w-40 text-[13px]">
          <option value="">Any milestone</option>
          <option value="qualified">Reached qualification</option>
          <option value="application">Application submitted</option>
          <option value="won">Policy issued</option>
        </Select>
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => update({ status: '', priority: '', source: '', interest: '', created_from: '', created_to: '', milestone: '' })}
          >
            <X /> Clear filters
          </Button>
        )}
      </FilterPanel>
    </div>
  )
}
