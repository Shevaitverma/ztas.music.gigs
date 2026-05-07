'use client'

import { format, formatDistanceToNow } from 'date-fns'
import { Activity } from 'lucide-react'
import type { ActivityLogEntry } from '@/lib/types'

interface ActivityLogListProps {
  entries: ActivityLogEntry[]
  loading?: boolean
}

function safeRelative(input: string) {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return ''
  return formatDistanceToNow(d, { addSuffix: true })
}

function safeAbsolute(input: string) {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return input
  return format(d, 'MMM d, yyyy HH:mm')
}

export function ActivityLogList({ entries, loading }: ActivityLogListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
          >
            <div className="h-8 w-8 animate-pulse rounded-full bg-zinc-800" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-40 animate-pulse rounded bg-zinc-800" />
              <div className="h-3 w-64 animate-pulse rounded bg-zinc-800/70" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!entries.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
        No activity recorded for this user.
      </div>
    )
  }

  return (
    <ol className="space-y-2">
      {entries.map((e, i) => {
        const key = e.id ?? e._id ?? `${e.action}-${e.createdAt}-${i}`
        return (
          <li
            key={key}
            className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-300">
              <Activity className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-zinc-100">{e.action}</span>
                <span className="text-xs text-zinc-500">{e.category}</span>
                <span
                  className="ml-auto text-xs text-zinc-500"
                  title={safeAbsolute(e.createdAt)}
                >
                  {safeRelative(e.createdAt)}
                </span>
              </div>
              {e.description && (
                <div className="mt-1 text-sm text-zinc-400">{e.description}</div>
              )}
              {e.metadata && Object.keys(e.metadata).length > 0 && (
                <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-zinc-950 p-2 text-[11px] leading-relaxed text-zinc-500">
                  {JSON.stringify(e.metadata, null, 2)}
                </pre>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
