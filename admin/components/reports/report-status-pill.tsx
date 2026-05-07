import { cn } from '@/lib/utils/cn'
import type { AdminReportStatus } from '@/lib/types'

const STATUS_STYLES: Record<AdminReportStatus, string> = {
  PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  UNDER_REVIEW: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  NEEDS_INFO: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  INVESTIGATING: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  RESOLVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  DISMISSED: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  ESCALATED: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}

const STATUS_LABELS: Record<AdminReportStatus, string> = {
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under review',
  NEEDS_INFO: 'Needs info',
  INVESTIGATING: 'Investigating',
  RESOLVED: 'Resolved',
  DISMISSED: 'Dismissed',
  ESCALATED: 'Escalated',
}

export function ReportStatusPill({
  status,
  className,
}: {
  status: AdminReportStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        STATUS_STYLES[status],
        className
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
