'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  rejectVerificationSchema,
  type RejectVerificationInput,
  type VerificationSection,
} from '@/lib/schemas/verification'

interface RejectDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
  submitting?: boolean
  section: VerificationSection
  verificationId: string
  venueId?: string
}

export function RejectDialog({
  open,
  onClose,
  onSubmit,
  submitting,
  section,
  verificationId,
  venueId,
}: RejectDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RejectVerificationInput>({
    resolver: zodResolver(rejectVerificationSchema),
    defaultValues: { verificationId, section, venueId, reason: '' },
  })

  useEffect(() => {
    if (open) reset({ verificationId, section, venueId, reason: '' })
  }, [open, verificationId, section, venueId, reset])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form
          onSubmit={handleSubmit((values) => onSubmit(values.reason))}
          className="flex flex-col gap-4 p-5"
        >
          <div>
            <h3 className="text-base font-semibold text-zinc-100">
              Reject {section} section
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              The user will be notified. Provide a clear, actionable reason (10–500 chars).
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="rejection-reason"
              className="text-xs font-medium uppercase tracking-wider text-zinc-500"
            >
              Reason
            </label>
            <textarea
              id="rejection-reason"
              rows={4}
              autoFocus
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              placeholder="e.g. Document is blurry — please resubmit a clearer photo of your PAN card."
              {...register('reason')}
            />
            {errors.reason && (
              <span className="text-xs text-rose-400">{errors.reason.message}</span>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={submitting}>
              Reject
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
