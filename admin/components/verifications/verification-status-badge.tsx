import { cn } from '@/lib/utils/cn'
import type { VerificationStatus } from '@/lib/types'

const STYLES: Record<VerificationStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  submitted: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  in_review: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
  approved: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  rejected: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  expired: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
}

const LABELS: Record<VerificationStatus, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
}

export function VerificationStatusBadge({
  status,
  className,
}: {
  status: VerificationStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        STYLES[status] ?? STYLES.pending,
        className
      )}
    >
      {LABELS[status] ?? status}
    </span>
  )
}
