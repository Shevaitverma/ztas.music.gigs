'use client'

import { ChevronDown, X } from 'lucide-react'
import type {
  AdminReportCategory,
  AdminReportEntityType,
  AdminReportStatus,
  AdminReportType,
} from '@/lib/types'
import { reportReasonLabels } from './report-reason-pill'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'

export interface ReportFiltersValue {
  status?: AdminReportStatus
  type?: AdminReportType
  category?: AdminReportCategory
  entityType?: AdminReportEntityType
  entityId?: string
}

const STATUS_OPTIONS: { value: AdminReportStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'NEEDS_INFO', label: 'Needs info' },
  { value: 'INVESTIGATING', label: 'Investigating' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'DISMISSED', label: 'Dismissed' },
  { value: 'ESCALATED', label: 'Escalated' },
]

const CATEGORY_OPTIONS: { value: AdminReportCategory; label: string }[] = [
  { value: 'USER_BEHAVIOR', label: 'User behavior' },
  { value: 'GIG_CONTENT', label: 'Gig content' },
  { value: 'PAYMENT', label: 'Payment' },
  { value: 'PROFILE_CONTENT', label: 'Profile content' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'SPAM', label: 'Spam' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'OTHER', label: 'Other' },
]

const ENTITY_OPTIONS: { value: AdminReportEntityType; label: string }[] = [
  { value: 'USER', label: 'User' },
  { value: 'GIG', label: 'Gig' },
  { value: 'BID', label: 'Bid' },
  { value: 'APPLICATION', label: 'Application' },
  { value: 'REVIEW', label: 'Review' },
]

function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: T | undefined
  onChange: (next: T | undefined) => void
  options: { value: T; label: string }[]
  placeholder: string
}) {
  return (
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || undefined) as T | undefined)}
        className={cn(
          'h-10 w-full appearance-none rounded-lg border border-zinc-800 bg-zinc-900 pl-3 pr-9 text-sm text-zinc-100',
          'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'
        )}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
    </div>
  )
}

export function ReportFilters({
  value,
  onChange,
}: {
  value: ReportFiltersValue
  onChange: (next: ReportFiltersValue) => void
}) {
  const hasFilters =
    !!value.status ||
    !!value.type ||
    !!value.category ||
    !!value.entityType ||
    !!value.entityId

  const reasonOptions = (Object.keys(reportReasonLabels) as AdminReportType[]).map(
    (k) => ({ value: k, label: reportReasonLabels[k] })
  )

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <Select
        value={value.status}
        onChange={(next) => onChange({ ...value, status: next })}
        options={STATUS_OPTIONS}
        placeholder="All statuses"
      />
      <Select
        value={value.type}
        onChange={(next) => onChange({ ...value, type: next })}
        options={reasonOptions}
        placeholder="All reasons"
      />
      <Select
        value={value.category}
        onChange={(next) => onChange({ ...value, category: next })}
        options={CATEGORY_OPTIONS}
        placeholder="All categories"
      />
      <Select
        value={value.entityType}
        onChange={(next) => onChange({ ...value, entityType: next })}
        options={ENTITY_OPTIONS}
        placeholder="All targets"
      />
      <Input
        value={value.entityId ?? ''}
        onChange={(e) => onChange({ ...value, entityId: e.target.value || undefined })}
        placeholder="Target ID"
        className="lg:col-span-1"
      />
      <div className="flex items-center">
        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({})}
            className="gap-1"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        ) : null}
      </div>
    </div>
  )
}
