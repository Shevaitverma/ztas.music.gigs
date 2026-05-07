'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, X } from 'lucide-react'
import Link from 'next/link'
import { notFound, useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/verifications/confirm-dialog'
import { RejectDialog } from '@/components/verifications/reject-dialog'
import { VerificationDetailCard } from '@/components/verifications/verification-detail-card'
import { verificationQueryKeys, verificationsApi } from '@/lib/api/verifications'
import type {
  VerificationKind,
  VerificationSection,
} from '@/lib/schemas/verification'
import { verificationTypeSchema } from '@/lib/schemas/verification'
import type { VerificationDetail } from '@/lib/types'

/**
 * Server's approve/reject endpoints operate on a *section* of a verification.
 * The detail page exposes one approve and one reject action; the user picks
 * which section the action targets via the dropdown below the buttons. We
 * default to the first applicable pending section when the data loads.
 */

function applicableSections(data: VerificationDetail): VerificationSection[] {
  const sections: VerificationSection[] = []
  if (data.identity) sections.push('identity')
  if (data.kind === 'organizer') {
    if (data.business) sections.push('business')
    if (data.venues && data.venues.length > 0) sections.push('venue')
  }
  if (data.kind === 'artist') {
    if (data.bankAccount) sections.push('bank')
    if (data.professional) sections.push('professional')
  }
  return sections
}

export default function VerificationDetailPage() {
  const params = useParams<{ type: string; id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  const parsed = verificationTypeSchema.safeParse(params.type)
  if (!parsed.success) notFound()
  const type: VerificationKind = parsed.data
  const id = params.id

  const detailQuery = useQuery({
    queryKey: verificationQueryKeys.detail(id, type),
    queryFn: () => verificationsApi.getById(id, type),
  })

  const [section, setSection] = useState<VerificationSection>('identity')
  const [venueId, setVenueId] = useState<string | undefined>(undefined)
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)

  const sections = detailQuery.data ? applicableSections(detailQuery.data) : []
  const venues =
    detailQuery.data && detailQuery.data.kind === 'organizer'
      ? detailQuery.data.venues ?? []
      : []

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: verificationQueryKeys.all })
  }

  const approveMutation = useMutation({
    mutationFn: () =>
      verificationsApi.approve({
        verificationId: id,
        section,
        ...(section === 'venue' && venueId ? { venueId } : {}),
      }),
    onSuccess: () => {
      toast.success(`Approved ${section}`)
      setConfirmApprove(false)
      invalidate()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to approve')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      verificationsApi.reject({
        verificationId: id,
        section,
        ...(section === 'venue' && venueId ? { venueId } : {}),
        reason,
      }),
    onSuccess: () => {
      toast.success(`Rejected ${section}`)
      setRejectOpen(false)
      invalidate()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Failed to reject')
    },
  })

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/verifications"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back to queue
        </Link>
      </div>

      {detailQuery.isPending && (
        <Card>
          <CardContent className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-zinc-800/60" />
            ))}
          </CardContent>
        </Card>
      )}

      {detailQuery.isError && (
        <Card>
          <CardContent>
            <p className="text-sm text-rose-400">
              Failed to load verification:{' '}
              {detailQuery.error instanceof Error
                ? detailQuery.error.message
                : 'Unknown error'}
            </p>
            <Button
              className="mt-4"
              variant="secondary"
              size="sm"
              onClick={() => router.refresh()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {detailQuery.data && (
        <>
          <VerificationDetailCard data={detailQuery.data} />

          <Card>
            <CardContent className="flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Moderate</h3>
                <p className="text-xs text-zinc-500">
                  Approve or reject one section at a time. The submitter is notified on
                  rejection.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    Section
                  </label>
                  <select
                    value={section}
                    onChange={(e) => setSection(e.target.value as VerificationSection)}
                    className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                  >
                    {sections.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {section === 'venue' && venues.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      Venue
                    </label>
                    <select
                      value={venueId ?? ''}
                      onChange={(e) => setVenueId(e.target.value || undefined)}
                      className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                    >
                      <option value="">Select venue…</option>
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} — {v.city}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="primary"
                  onClick={() => setConfirmApprove(true)}
                  disabled={
                    approveMutation.isPending ||
                    (section === 'venue' && !venueId)
                  }
                >
                  <Check className="h-4 w-4" /> Approve section
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setRejectOpen(true)}
                  disabled={
                    rejectMutation.isPending || (section === 'venue' && !venueId)
                  }
                >
                  <X className="h-4 w-4" /> Reject section
                </Button>
              </div>
            </CardContent>
          </Card>

          <ConfirmDialog
            open={confirmApprove}
            title={`Approve ${section}?`}
            description="The user will be notified that this section was approved. This action can't be undone from the UI."
            confirmLabel="Approve"
            loading={approveMutation.isPending}
            onConfirm={() => approveMutation.mutate()}
            onCancel={() => setConfirmApprove(false)}
          />

          <RejectDialog
            open={rejectOpen}
            onClose={() => setRejectOpen(false)}
            onSubmit={(reason) => rejectMutation.mutate(reason)}
            submitting={rejectMutation.isPending}
            section={section}
            verificationId={id}
            venueId={section === 'venue' ? venueId : undefined}
          />
        </>
      )}
    </div>
  )
}
