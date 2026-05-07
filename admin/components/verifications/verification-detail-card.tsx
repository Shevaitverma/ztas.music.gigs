'use client'

import { format } from 'date-fns'
import { ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PiiField } from './pii-field'
import { VerificationStatusBadge } from './verification-status-badge'
import type {
  ArtistVerification,
  OrganizerVerification,
  VerificationDetail,
  VerificationStatus,
} from '@/lib/types'

function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return format(d, 'PPp')
}

function DocumentLink({ label, url }: { label: string; url?: string }) {
  if (!url) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        <span className="text-sm text-zinc-500 italic">Not uploaded</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
      >
        Open document <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <span className="text-[10px] text-zinc-600">
        Presigned URL — expires within 5 minutes.
      </span>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-100">
        {value === undefined || value === null || value === '' ? (
          <span className="italic text-zinc-500">—</span>
        ) : (
          value
        )}
      </span>
    </div>
  )
}

function SectionHeader({
  title,
  status,
  rejectionReason,
  verifiedAt,
  submittedAt,
}: {
  title: string
  status?: VerificationStatus
  rejectionReason?: string
  verifiedAt?: string
  submittedAt?: string
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-zinc-800 pb-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-200">{title}</h4>
        {status && <VerificationStatusBadge status={status} />}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
        <span>Submitted: {fmtDate(submittedAt)}</span>
        <span>Verified: {fmtDate(verifiedAt)}</span>
      </div>
      {rejectionReason && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-300">
          <span className="font-semibold">Last rejection: </span>
          {rejectionReason}
        </div>
      )}
    </div>
  )
}

interface VerificationDetailCardProps {
  data: VerificationDetail
}

export function VerificationDetailCard({ data }: VerificationDetailCardProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Submitter */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Submitter</CardTitle>
          <VerificationStatusBadge status={data.overallStatus} />
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" value={data.user?.name} />
          <Field label="Email" value={data.user?.email} />
          <Field label="Phone" value={data.user?.phone} />
          <Field label="Role" value={data.user?.role ?? data.kind} />
          <Field label="User id" value={data.userId} />
          <Field label="Verification id" value={data.id} />
        </CardContent>
      </Card>

      {/* Identity (shared) */}
      {data.identity && (
        <Card>
          <CardHeader>
            <CardTitle>Identity verification</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SectionHeader
              title="Identity document"
              status={data.identity.status}
              rejectionReason={data.identity.rejectionReason}
              verifiedAt={data.identity.verifiedAt}
              submittedAt={data.identity.submittedAt}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <PiiField
                label="Document number"
                masked={data.identity.numberMasked}
                userId={data.userId}
                field="identity_number"
              />
              <DocumentLink label="ID document" url={data.identity.documentUrl} />
              <DocumentLink label="Selfie with ID" url={data.identity.selfieUrl} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Organizer-specific */}
      {data.kind === 'organizer' && (
        <OrganizerSections data={data} />
      )}

      {/* Artist-specific */}
      {data.kind === 'artist' && <ArtistSections data={data} />}
    </div>
  )
}

function OrganizerSections({ data }: { data: OrganizerVerification }) {
  return (
    <>
      {data.business && (
        <Card>
          <CardHeader>
            <CardTitle>Business verification</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SectionHeader
              title="Business details"
              status={data.business.status}
              rejectionReason={data.business.rejectionReason}
              verifiedAt={data.business.verifiedAt}
              submittedAt={data.business.submittedAt}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Business name" value={data.business.name} />
              <PiiField
                label="PAN"
                masked={data.business.panMasked}
                userId={data.userId}
                field="business_pan"
              />
              <PiiField
                label="GST"
                masked={data.business.gstMasked}
                userId={data.userId}
                field="business_gst"
              />
              <DocumentLink
                label="Registration document"
                url={data.business.registrationDocUrl}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {data.venues && data.venues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Venues ({data.venues.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {data.venues.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h5 className="text-sm font-semibold text-zinc-100">{v.name}</h5>
                    <p className="text-xs text-zinc-500">{v.city}</p>
                  </div>
                  <VerificationStatusBadge status={v.status} />
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DocumentLink label="Venue proof" url={v.proofDocUrl} />
                  <Field label="Venue id" value={v.id} />
                </div>
                {v.rejectionReason && (
                  <div className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-300">
                    <span className="font-semibold">Last rejection: </span>
                    {v.rejectionReason}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}

function ArtistSections({ data }: { data: ArtistVerification }) {
  return (
    <>
      {data.bankAccount && (
        <Card>
          <CardHeader>
            <CardTitle>Bank account verification</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SectionHeader
              title="Bank account"
              status={data.bankAccount.status}
              rejectionReason={data.bankAccount.rejectionReason}
              verifiedAt={data.bankAccount.verifiedAt}
              submittedAt={data.bankAccount.submittedAt}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Account holder" value={data.bankAccount.accountHolderName} />
              <Field label="Bank name" value={data.bankAccount.bankName} />
              <PiiField
                label="Account number"
                masked={data.bankAccount.accountNumberMasked}
                userId={data.userId}
                field="bank_account"
              />
              <PiiField
                label="IFSC"
                masked={data.bankAccount.ifscMasked}
                userId={data.userId}
                field="bank_ifsc"
              />
              <DocumentLink
                label="Cancelled cheque / statement"
                url={data.bankAccount.proofDocUrl}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {data.professional && (
        <Card>
          <CardHeader>
            <CardTitle>Professional verification</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SectionHeader
              title="Professional review"
              status={data.professional.status}
              verifiedAt={data.professional.verifiedAt}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field
                label="Portfolio reviewed"
                value={data.professional.portfolioReviewed ? 'Yes' : 'No'}
              />
              <Field
                label="Video links verified"
                value={data.professional.videoLinksVerified ? 'Yes' : 'No'}
              />
              <Field
                label="Audio samples verified"
                value={data.professional.audioSamplesVerified ? 'Yes' : 'No'}
              />
            </div>
            {data.professional.notes && (
              <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-300">
                <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Notes
                </span>
                <p className="mt-1">{data.professional.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
