'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { VerificationTable } from '@/components/verifications/verification-table'
import { verificationQueryKeys, verificationsApi } from '@/lib/api/verifications'
import type { VerificationKind } from '@/lib/schemas/verification'

const TYPE_FILTERS: { value: VerificationKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'artist', label: 'Artists' },
  { value: 'organizer', label: 'Organizers' },
]

export default function VerificationsPage() {
  const [typeFilter, setTypeFilter] = useState<VerificationKind | 'all'>('all')

  const params = {
    page: 1,
    limit: 50,
    status: 'pending' as const,
    ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
  }

  const { data, isPending, isError, error } = useQuery({
    queryKey: verificationQueryKeys.pending(params),
    queryFn: () => verificationsApi.listPending(params),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Verifications</h1>
          <p className="text-sm text-zinc-500">
            Review pending KYC submissions from artists and organizers.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setTypeFilter(f.value)}
              className={
                typeFilter === f.value
                  ? 'rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-100'
                  : 'rounded-md px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200'
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isPending && (
        <Card>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-zinc-800/60" />
            ))}
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent>
            <p className="text-sm text-rose-400">
              Failed to load verifications: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </CardContent>
        </Card>
      )}

      {!isPending && !isError && data && <VerificationTable rows={data.data} />}
    </div>
  )
}
