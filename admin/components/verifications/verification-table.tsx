'use client'

import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { VerificationStatusBadge } from './verification-status-badge'
import type { VerificationListItem } from '@/lib/types'

interface VerificationTableProps {
  rows: VerificationListItem[]
}

function countDocuments(row: VerificationListItem): number {
  let n = 0
  if (row.identity?.documentUrl) n++
  if (row.identity?.selfieUrl) n++
  if (row.kind === 'organizer') {
    if (row.business?.registrationDocUrl) n++
    if (row.venues) n += row.venues.filter((v) => v.proofDocUrl).length
  } else if (row.kind === 'artist') {
    if (row.bankAccount?.proofDocUrl) n++
  }
  return n
}

function relativeTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return formatDistanceToNow(d, { addSuffix: true })
}

export function VerificationTable({ rows }: VerificationTableProps) {
  if (rows.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-zinc-400">No pending verifications. Inbox zero.</p>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Submitted</th>
              <th className="px-4 py-3 font-medium">Documents</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((row) => {
              const submitted =
                row.identity?.submittedAt ?? row.createdAt
              return (
                <tr key={`${row.kind}-${row.id}`} className="hover:bg-zinc-900/40">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-100">
                        {row.user?.name ?? 'Unknown user'}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {row.user?.role ?? row.kind} · {row.user?.email ?? row.userId}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-zinc-300">{row.kind}</td>
                  <td className="px-4 py-3">
                    <VerificationStatusBadge status={row.overallStatus} />
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{relativeTime(submitted)}</td>
                  <td className="px-4 py-3 tabular-nums text-zinc-300">
                    {countDocuments(row)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/verifications/${row.kind}/${row.id}`}>
                      <Button size="sm" variant="secondary">
                        Review
                      </Button>
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
