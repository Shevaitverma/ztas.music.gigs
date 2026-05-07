'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { reportsApi, reportsQueryKeys } from '@/lib/api/reports'
import type { ResolveFormInput } from '@/lib/schemas/report'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/reports/confirm-dialog'
import { ReportDetailCard } from '@/components/reports/report-detail-card'
import { ReportReasonPill } from '@/components/reports/report-reason-pill'
import { ReportStatusPill } from '@/components/reports/report-status-pill'
import { ResolveDialog } from '@/components/reports/resolve-dialog'
import { format } from 'date-fns'

export default function ReportDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id
  const qc = useQueryClient()

  const [resolveOpen, setResolveOpen] = useState(false)
  const [dismissOpen, setDismissOpen] = useState(false)
  const [dismissNotes, setDismissNotes] = useState('')

  const reportQuery = useQuery({
    queryKey: id ? reportsQueryKeys.detail(id) : ['reports', 'detail', 'noop'],
    queryFn: () => {
      if (!id) throw new Error('Missing report id')
      return reportsApi.getById(id)
    },
    enabled: !!id,
  })

  const report = reportQuery.data

  const historyQuery = useQuery({
    queryKey: report
      ? reportsQueryKeys.entity(report.reported.entityType, report.reported.entityId)
      : ['reports', 'entity', 'noop'],
    queryFn: () => {
      if (!report) return Promise.resolve([])
      return reportsApi.getEntityReports(
        report.reported.entityType,
        report.reported.entityId
      )
    },
    enabled: !!report,
  })

  const resolveMutation = useMutation({
    mutationFn: (input: ResolveFormInput) => {
      if (!id) throw new Error('Missing report id')
      return reportsApi.resolve(id, input)
    },
    onSuccess: () => {
      toast.success('Report resolved')
      setResolveOpen(false)
      qc.invalidateQueries({ queryKey: reportsQueryKeys.lists() })
      if (id) qc.invalidateQueries({ queryKey: reportsQueryKeys.detail(id) })
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Failed to resolve report')
    },
  })

  const dismissMutation = useMutation({
    mutationFn: (notes: string) => {
      if (!id) throw new Error('Missing report id')
      return reportsApi.dismiss(id, notes)
    },
    onSuccess: () => {
      toast.success('Report dismissed')
      setDismissOpen(false)
      setDismissNotes('')
      qc.invalidateQueries({ queryKey: reportsQueryKeys.lists() })
      if (id) qc.invalidateQueries({ queryKey: reportsQueryKeys.detail(id) })
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Failed to dismiss report')
    },
  })

  const isTerminal =
    report?.status === 'RESOLVED' || report?.status === 'DISMISSED'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {report && !isTerminal && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDismissOpen(true)}
              disabled={dismissMutation.isPending || resolveMutation.isPending}
            >
              Dismiss
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setResolveOpen(true)}
              disabled={dismissMutation.isPending || resolveMutation.isPending}
            >
              Resolve
            </Button>
          </div>
        )}
      </div>

      {reportQuery.isLoading && (
        <div className="space-y-3">
          <div className="h-40 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
          <div className="h-24 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40" />
        </div>
      )}

      {reportQuery.isError && (
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-sm text-rose-300">
                Couldn&apos;t load this report.{' '}
                {reportQuery.error instanceof Error
                  ? reportQuery.error.message
                  : 'Unknown error.'}
              </div>
              <Button size="sm" variant="secondary" onClick={() => reportQuery.refetch()}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          <ReportDetailCard report={report} />

          <Card>
            <CardContent>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-200">
                  Other reports against this {report.reported.entityType.toLowerCase()}
                </h2>
                {historyQuery.data && (
                  <span className="text-xs text-zinc-500">
                    {historyQuery.data.length} total
                  </span>
                )}
              </div>
              {historyQuery.isLoading ? (
                <div className="h-16 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/40" />
              ) : historyQuery.isError ? (
                <p className="text-sm text-zinc-500">Couldn&apos;t load related reports.</p>
              ) : !historyQuery.data || historyQuery.data.length <= 1 ? (
                <p className="text-sm text-zinc-500">No other reports against this target.</p>
              ) : (
                <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
                  {historyQuery.data
                    .filter((r) => r.id !== report.id)
                    .map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <ReportStatusPill status={r.status} />
                          <ReportReasonPill type={r.type} />
                          <span className="text-xs text-zinc-500">
                            {format(new Date(r.createdAt), 'dd MMM yyyy')}
                          </span>
                        </div>
                        <Link
                          href={`/reports/${r.id}`}
                          className="text-xs text-indigo-300 hover:text-indigo-200"
                        >
                          Open
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ResolveDialog
        open={resolveOpen}
        loading={resolveMutation.isPending}
        onCancel={() => setResolveOpen(false)}
        onSubmit={(input) => resolveMutation.mutate(input)}
      />

      <ConfirmDialog
        open={dismissOpen}
        title="Dismiss report"
        confirmLabel="Dismiss report"
        variant="danger"
        loading={dismissMutation.isPending}
        disableConfirm={dismissNotes.trim().length < 10}
        onCancel={() => {
          if (!dismissMutation.isPending) {
            setDismissOpen(false)
            setDismissNotes('')
          }
        }}
        onConfirm={() => dismissMutation.mutate(dismissNotes.trim())}
      >
        <p className="mb-2 text-sm text-zinc-300">
          Dismiss this report as invalid / no action needed. Notes are required and visible
          to other admins.
        </p>
        <textarea
          rows={4}
          value={dismissNotes}
          onChange={(e) => setDismissNotes(e.target.value)}
          placeholder="Why is this being dismissed? (10-2000 chars)"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <div className="mt-1 text-xs text-zinc-500">
          {dismissNotes.trim().length}/2000
        </div>
      </ConfirmDialog>
    </div>
  )
}
