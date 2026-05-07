import { cn } from '@/lib/utils/cn'
import type { UserStatus } from '@/lib/types'

const STATUS_STYLES: Record<UserStatus, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
  },
  inactive: {
    label: 'Inactive',
    className: 'bg-zinc-500/10 text-zinc-300 ring-zinc-500/30',
  },
  pending: {
    label: 'Pending',
    className: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  },
  suspended: {
    label: 'Suspended',
    className: 'bg-orange-500/10 text-orange-300 ring-orange-500/30',
  },
  banned: {
    label: 'Banned',
    className: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
  },
}

export function UserStatusPill({ status, className }: { status: UserStatus; className?: string }) {
  const style = STATUS_STYLES[status] ?? {
    label: status,
    className: 'bg-zinc-500/10 text-zinc-300 ring-zinc-500/30',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        style.className,
        className
      )}
    >
      {style.label}
    </span>
  )
}
