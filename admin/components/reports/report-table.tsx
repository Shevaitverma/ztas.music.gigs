'use client'

import { format } from 'date-fns'
import Link from 'next/link'
import type { AdminReport } from '@/lib/types'
import { ReportStatusPill } from './report-status-pill'
import { ReportReasonPill } from './report-reason-pill'
import { cn } from '@/lib/utils/cn'

function targetHref(report: AdminReport): string | null {
  switch (report.reported.entityType) {
    case 'USER':
      return `/users/${report.reported.entityId}`
    default:
      // Gigs/bids/reviews/applications don't have admin pages yet — render
      // the id as plain text so we don't dead-link.
      return null
  }
}

function shortId(id: string): string {
  if (id.length <= 10) return id
  return `${id.slice(0, 6)}…${id.slice(-4)}`
}

export function ReportTable({
  reports,
  isLoading,
}: {
  reports: AdminReport[]
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/40"
          />
        ))}
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-800 p-12 text-center text-sm text-zinc-500">
        No reports match the current filters.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Created</th>
            <th className="px-4 py-3 text-left font-medium">Target</th>
            <th className="px-4 py-3 text-left font-medium">Reason</th>
            <th className="px-4 py-3 text-left font-medium">Reporter</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800 bg-zinc-950/40">
          {reports.map((r) => {
            const href = targetHref(r)
            return (
              <tr key={r.id} className="hover:bg-zinc-900/40">
                <td className="whitespace-nowrap px-4 py-3 text-zinc-300">
                  {format(new Date(r.createdAt), 'dd MMM, HH:mm')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-xs uppercase tracking-wide text-zinc-500">
                      {r.reported.entityType}
                    </span>
                    {href ? (
                      <Link
                        href={href}
                        className="font-mono text-xs text-indigo-300 hover:text-indigo-200"
                      >
                        {shortId(r.reported.entityId)}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-zinc-300">
                        {shortId(r.reported.entityId)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ReportReasonPill type={r.type} />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/users/${r.reporter.id}`}
                    className="text-zinc-200 hover:text-indigo-300"
                  >
                    {r.reporter.name ?? shortId(r.reporter.id)}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <ReportStatusPill status={r.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/reports/${r.id}`}
                    className={cn(
                      'inline-flex items-center rounded-md border border-zinc-700 px-3 py-1 text-xs',
                      'text-zinc-200 hover:border-indigo-500 hover:text-indigo-300'
                    )}
                  >
                    Review
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
