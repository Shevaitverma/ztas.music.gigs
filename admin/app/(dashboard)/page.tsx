'use client'

import { useQuery } from '@tanstack/react-query'
import { FileText, ShieldCheck, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { adminQueryKeys, reportsApi, usersApi, verificationsApi } from '@/lib/api/admin'

interface StatCardProps {
  title: string
  value: ReactNode
  icon: ReactNode
  loading?: boolean
  error?: boolean
  hint?: string
}

function StatCard({ title, value, icon, loading, error, hint }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-100">
            {loading ? '—' : error ? 'n/a' : value}
          </div>
          {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
        </div>
        <div className="rounded-lg bg-zinc-800/60 p-2 text-zinc-300">{icon}</div>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const usersQuery = useQuery({
    queryKey: adminQueryKeys.users.list({ page: 1, limit: 1 }),
    queryFn: () => usersApi.list({ page: 1, limit: 1 }),
  })
  const verificationsQuery = useQuery({
    queryKey: adminQueryKeys.verifications.pending,
    queryFn: () => verificationsApi.listPending(),
  })
  const reportsQuery = useQuery({
    queryKey: adminQueryKeys.reports.all,
    queryFn: () => reportsApi.list(),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Dashboard</h1>
        <p className="text-sm text-zinc-500">Overview of platform activity.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Total users"
          value={usersQuery.data?.meta.total ?? 0}
          icon={<Users className="h-5 w-5" />}
          loading={usersQuery.isLoading}
          error={usersQuery.isError}
          hint="Across all roles"
        />
        <StatCard
          title="Pending verifications"
          value={verificationsQuery.data?.meta.total ?? verificationsQuery.data?.data.length ?? 0}
          icon={<ShieldCheck className="h-5 w-5" />}
          loading={verificationsQuery.isLoading}
          error={verificationsQuery.isError}
          hint="Awaiting review"
        />
        <StatCard
          title="Open reports"
          value={reportsQuery.data?.meta.total ?? reportsQuery.data?.data.length ?? 0}
          icon={<FileText className="h-5 w-5" />}
          loading={reportsQuery.isLoading}
          error={reportsQuery.isError}
          hint="User-submitted"
        />
      </div>

      <Card>
        <CardContent>
          <h2 className="text-sm font-semibold text-zinc-200">Welcome</h2>
          <p className="mt-2 text-sm text-zinc-400">
            This is the bare admin shell. Verification queues, user moderation tools, and report
            triage will live in their dedicated sections.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
