'use client'

import Link from 'next/link'
import { format } from 'date-fns'
import { CheckCircle2, ExternalLink, MinusCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { UserListItem } from '@/lib/types'
import { UserRolePill } from './user-role-pill'
import { UserStatusPill } from './user-status-pill'

interface UserTableProps {
  users: UserListItem[]
  loading?: boolean
}

function safeDate(input?: string) {
  if (!input) return '—'
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return '—'
  return format(d, 'MMM d, yyyy')
}

export function UserTable({ users, loading }: UserTableProps) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <div className="grid grid-cols-12 gap-4 border-b border-zinc-800 bg-zinc-900/60 px-4 py-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
          <div className="col-span-4">User</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Verified</div>
          <div className="col-span-2">Joined</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-12 gap-4 border-b border-zinc-800/60 px-4 py-3 last:border-0"
          >
            <div className="col-span-4 flex items-center gap-3">
              <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-800" />
              <div className="h-3 w-32 animate-pulse rounded bg-zinc-800" />
            </div>
            <div className="col-span-2 flex items-center">
              <div className="h-4 w-14 animate-pulse rounded-full bg-zinc-800" />
            </div>
            <div className="col-span-2 flex items-center">
              <div className="h-4 w-16 animate-pulse rounded-full bg-zinc-800" />
            </div>
            <div className="col-span-1 flex items-center">
              <div className="h-4 w-4 animate-pulse rounded-full bg-zinc-800" />
            </div>
            <div className="col-span-2 flex items-center">
              <div className="h-3 w-20 animate-pulse rounded bg-zinc-800" />
            </div>
            <div className="col-span-1 flex items-center justify-end">
              <div className="h-3 w-10 animate-pulse rounded bg-zinc-800" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!users.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
        No users match the current filters.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <div className="grid grid-cols-12 gap-4 border-b border-zinc-800 bg-zinc-900/60 px-4 py-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
        <div className="col-span-4">User</div>
        <div className="col-span-2">Role</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-1">Verified</div>
        <div className="col-span-2">Joined</div>
        <div className="col-span-1 text-right">Actions</div>
      </div>
      {users.map((u) => {
        const initial = (u.name?.[0] || u.email?.[0] || '?').toUpperCase()
        return (
          <div
            key={u.id}
            className={cn(
              'grid grid-cols-12 items-center gap-4 border-b border-zinc-800/60 px-4 py-3 text-sm last:border-0',
              'hover:bg-zinc-900/40'
            )}
          >
            <div className="col-span-4 flex min-w-0 items-center gap-3">
              {u.profilePicture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.profilePicture}
                  alt=""
                  className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">
                  {initial}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate font-medium text-zinc-100">
                  {u.name || 'Unnamed'}
                </div>
                <div className="truncate text-xs text-zinc-500">
                  {u.email || u.phoneNumber || u.id}
                </div>
              </div>
            </div>
            <div className="col-span-2">
              <UserRolePill role={u.role} />
            </div>
            <div className="col-span-2">
              <UserStatusPill status={u.status} />
            </div>
            <div className="col-span-1">
              {u.isVerified ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-label="Verified" />
              ) : (
                <MinusCircle className="h-4 w-4 text-zinc-600" aria-label="Not verified" />
              )}
            </div>
            <div className="col-span-2 text-xs text-zinc-400">{safeDate(u.createdAt)}</div>
            <div className="col-span-1 text-right">
              <Link
                href={`/users/${u.id}`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-300 hover:bg-zinc-800 hover:text-indigo-200"
              >
                View
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )
      })}
    </div>
  )
}
