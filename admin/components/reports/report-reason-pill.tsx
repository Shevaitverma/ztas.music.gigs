import { cn } from '@/lib/utils/cn'
import type { AdminReportType } from '@/lib/types'

/** Human-readable labels for the server's `ReportType` enum. */
const REASON_LABELS: Record<AdminReportType, string> = {
  HARASSMENT: 'Harassment',
  FRAUD: 'Fraud',
  SCAM: 'Scam',
  IMPERSONATION: 'Impersonation',
  INAPPROPRIATE_CONTENT: 'Inappropriate content',
  ILLEGAL_CONTENT: 'Illegal content',
  NO_SHOW: 'No-show',
  LATE_ARRIVAL: 'Late arrival',
  UNPROFESSIONAL_BEHAVIOR: 'Unprofessional behavior',
  QUALITY_MISMATCH: 'Quality mismatch',
  FALSE_INFORMATION: 'False information',
  PAYMENT_DISPUTE: 'Payment dispute',
  SAFETY_CONCERN: 'Safety concern',
  COPYRIGHT: 'Copyright',
  SPAM: 'Spam',
  BUG: 'Bug',
  OTHER: 'Other',
}

/** A small visual hint of severity. Not shown numerically. */
const SEVERITY: Record<AdminReportType, 'high' | 'mid' | 'low'> = {
  HARASSMENT: 'high',
  FRAUD: 'high',
  SCAM: 'high',
  IMPERSONATION: 'high',
  ILLEGAL_CONTENT: 'high',
  SAFETY_CONCERN: 'high',
  INAPPROPRIATE_CONTENT: 'mid',
  NO_SHOW: 'mid',
  UNPROFESSIONAL_BEHAVIOR: 'mid',
  QUALITY_MISMATCH: 'mid',
  FALSE_INFORMATION: 'mid',
  PAYMENT_DISPUTE: 'mid',
  COPYRIGHT: 'mid',
  LATE_ARRIVAL: 'low',
  SPAM: 'low',
  BUG: 'low',
  OTHER: 'low',
}

const TONE: Record<'high' | 'mid' | 'low', string> = {
  high: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  mid: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  low: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
}

export function ReportReasonPill({
  type,
  className,
}: {
  type: AdminReportType
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE[SEVERITY[type]],
        className
      )}
    >
      {REASON_LABELS[type] ?? type}
    </span>
  )
}

export const reportReasonLabels = REASON_LABELS
