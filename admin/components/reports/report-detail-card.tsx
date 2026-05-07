'use client'

import { format } from 'date-fns'
import Link from 'next/link'
import type { AdminReport } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { ReportReasonPill } from './report-reason-pill'
import { ReportStatusPill } from './report-status-pill'

function shortId(id: string): string {
  if (id.length <= 12) return id
  return `${id.slice(0, 6)}…${id.slice(-4)}`
}

function targetHref(report: AdminReport): string | null {
  return report.reported.entityType === 'USER'
    ? `/users/${report.reported.entityId}`
    : null
}

export function ReportDetailCard({ report }: { report: AdminReport }) {
  const href = targetHref(report)
  return (
    <Card>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ReportStatusPill status={report.status} />
              <ReportReasonPill type={report.type} />
              <span className="text-xs text-zinc-500">
                Priority: <span className="text-zinc-300">{report.priority}</span>
              </span>
            </div>
            <div className="font-mono text-xs text-zinc-500">#{report.id}</div>
          </div>
          <div className="text-right text-xs text-zinc-500">
            <div>Created {format(new Date(report.createdAt), 'PPp')}</div>
            <div>Updated {format(new Date(report.updatedAt), 'PPp')}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Reporter
            </div>
            <Link
              href={`/users/${report.reporter.id}`}
              className="text-sm text-zinc-100 hover:text-indigo-300"
            >
              {report.reporter.name ?? shortId(report.reporter.id)}
            </Link>
            <div className="font-mono text-xs text-zinc-500">{report.reporter.id}</div>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Target
            </div>
            <div className="text-xs uppercase tracking-wide text-zinc-400">
              {report.reported.entityType}
            </div>
            {href ? (
              <Link
                href={href}
                className="font-mono text-sm text-indigo-300 hover:text-indigo-200"
              >
                {report.reported.entityId}
              </Link>
            ) : (
              <div className="font-mono text-sm text-zinc-300">
                {report.reported.entityId}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Description
          </div>
          <p className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-200">
            {report.description}
          </p>
        </div>

        {report.evidence.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Evidence
            </div>
            <ul className="space-y-1">
              {report.evidence.map((url, i) => (
                <li key={i} className="text-sm">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="break-all text-indigo-300 hover:text-indigo-200"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.assignedTo && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Assigned to
            </div>
            <div className="text-sm text-zinc-200">
              {report.assignedTo.name ?? shortId(report.assignedTo.id)}
            </div>
          </div>
        )}

        {report.adminNotes && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Internal admin notes
            </div>
            <p className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-300">
              {report.adminNotes}
            </p>
          </div>
        )}

        {report.resolution && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Resolution
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
              <div className="mb-1 text-zinc-200">
                <span className="font-medium">{report.resolution.action}</span>
                <span className="ml-2 text-xs text-zinc-500">
                  by {shortId(report.resolution.resolvedBy)} on{' '}
                  {format(new Date(report.resolution.resolvedAt), 'PPp')}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-zinc-300">{report.resolution.notes}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
