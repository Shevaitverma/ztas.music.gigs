import { cn } from '@/lib/utils/cn'
import type { UserRole } from '@/lib/types'

const ROLE_STYLES: Record<UserRole, { label: string; className: string }> = {
  artist: {
    label: 'Artist',
    className: 'bg-indigo-500/10 text-indigo-300 ring-indigo-500/30',
  },
  client: {
    label: 'Client',
    className: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  },
  admin: {
    label: 'Admin',
    className: 'bg-fuchsia-500/10 text-fuchsia-300 ring-fuchsia-500/30',
  },
}

export function UserRolePill({ role, className }: { role: UserRole; className?: string }) {
  const style = ROLE_STYLES[role] ?? {
    label: role,
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
