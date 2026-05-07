'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { reportsApi, reportsQueryKeys, type ListReportsParams } from '@/lib/api/reports'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ReportFilters, type ReportFiltersValue } from '@/components/reports/report-filters'
import { ReportTable } from '@/components/reports/report-table'

const PAGE_SIZE = 20

export default function ReportsPage() {
  const [filters, setFilters] = useState<ReportFiltersValue>({ status: 'PENDING' })
  const [page, setPage] = useState(1)

  const params: ListReportsParams = {
    ...filters,
    page,
    limit: PAGE_SIZE,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  }

  const query = useQuery({
    queryKey: reportsQueryKeys.list(params),
    queryFn: () => reportsApi.list(params),
    placeholderData: keepPreviousData,
  })

  if (query.isError) {
    toast.error(
      query.error instanceof Error ? query.error.message : 'Failed to load reports'
    )
  }

  const meta = query.data?.meta
  const total = meta?.total ?? 0
  const totalPages = meta?.totalPages ?? 1

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Reports</h1>
          <p className="text-sm text-zinc-500">
            Review and resolve user-submitted reports.
          </p>
        </div>
        <div className="text-xs text-zinc-500">
          {meta ? `${total} matching report${total === 1 ? '' : 's'}` : null}
        </div>
      </div>

      <Card>
        <CardContent>
          <ReportFilters
            value={filters}
            onChange={(next) => {
              setFilters(next)
              setPage(1)
            }}
          />
        </CardContent>
      </Card>

      {query.isError ? (
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-sm text-rose-300">
                Couldn&apos;t load reports.{' '}
                {query.error instanceof Error ? query.error.message : 'Unknown error.'}
              </div>
              <Button size="sm" variant="secondary" onClick={() => query.refetch()}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ReportTable
          reports={query.data?.data ?? []}
          isLoading={query.isLoading || (query.isFetching && !query.data)}
        />
      )}

      {meta && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-zinc-500">
            Page {meta.page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages || query.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
