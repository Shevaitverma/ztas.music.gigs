'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  KeyRound,
  MapPin,
  PlayCircle,
  RefreshCw,
  Star,
  XCircle,
} from 'lucide-react'
import {
  Card,
  Button,
  Badge,
  StatusBadge,
  Avatar,
  GigCardSkeleton,
  ConfirmModal,
} from '@/components/ui'
import { CheckInSteps, PaymentNote } from '@/components/checkin-steps'
import { ReviewModal } from '@/components/review-modal'
import { gigsApi, bidsApi, checkinApi, reviewsApi } from '@/lib/api'
import { CHECKIN_LIVE_STATUSES } from '@/lib/api/checkin'
import { capture } from '@/lib/analytics'
import { useAuth } from '@/lib/providers'
import { formatEventDate, formatTime, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

const MAX_REGENERATIONS = 3

export default function ManageEventPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const gigId = params.id as string

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showReviewModal, setShowReviewModal] = useState(false)

  const { data: gig, isLoading: gigLoading } = useQuery({
    queryKey: ['gig', gigId],
    queryFn: () => gigsApi.getById(gigId),
    enabled: !!gigId,
  })

  const { data: bids = [] } = useQuery({
    queryKey: ['bids', 'gig', gigId],
    queryFn: () => bidsApi.getGigBids(gigId),
    enabled: !!gigId,
  })

  const {
    data: checkIn,
    isLoading: checkInLoading,
    isError: checkInError,
    error: checkInErrorObj,
    refetch: refetchCheckIn,
  } = useQuery({
    queryKey: ['checkin', gigId],
    queryFn: () => checkinApi.getStatusOrNull(gigId),
    enabled: !!gigId,
    // Poll while the event is in flight so the organizer sees the artist check
    // in without refreshing. Stops once the record is terminal.
    refetchInterval: (query) =>
      query.state.data && CHECKIN_LIVE_STATUSES.includes(query.state.data.status) ? 10_000 : false,
  })

  const { data: gigReviews = [] } = useQuery({
    queryKey: ['reviews', 'gig', gigId],
    queryFn: () => reviewsApi.getGigReviews(gigId),
    enabled: !!gigId && gig?.status === 'COMPLETED',
  })

  const acceptedBid = bids.find((b) => b.status === 'ACCEPTED')
  const artistName =
    acceptedBid?.artist?.artistProfile?.stageName || acceptedBid?.artist?.name || 'the artist'
  const alreadyReviewed = gigReviews.some((r) => r.reviewer?.id === user?.id)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['checkin', gigId] })
    queryClient.invalidateQueries({ queryKey: ['gig', gigId] })
    queryClient.invalidateQueries({ queryKey: ['gigs', 'my'] })
    queryClient.invalidateQueries({ queryKey: ['bids', 'gig', gigId] })
  }

  const generateMutation = useMutation({
    mutationFn: () => checkinApi.generateOtp(gigId),
    onSuccess: () => {
      capture('checkin_otp_generated', {
        // Regenerations are the interesting signal, not the code itself.
        is_regeneration: !!checkIn,
        regenerate_count: checkIn?.otpRegenerateCount ?? 0,
      })
      invalidate()
      toast.success('Check-in code ready. Read it out to the artist.')
    },
    onError: (error: Error) => toast.error(error.message || 'Could not generate the code'),
  })

  const startMutation = useMutation({
    mutationFn: () => checkinApi.startEvent(gigId),
    onSuccess: () => {
      capture('event_started')
      invalidate()
      toast.success('Event started.')
    },
    onError: (error: Error) => toast.error(error.message || 'Could not start the event'),
  })

  const endMutation = useMutation({
    mutationFn: () => checkinApi.endEvent(gigId),
    onSuccess: (result) => {
      capture('event_ended_confirmed', { role: 'client' })
      // EVENT_ENDED only comes back to whoever confirmed second, so the gig's
      // COMPLETED transition is captured exactly once.
      if (result.status === 'EVENT_ENDED') capture('gig_completed', { confirmed_by: 'client' })
      invalidate()
      toast.success(
        result.status === 'EVENT_ENDED'
          ? 'Event completed. You can leave a review now.'
          : 'Confirmed. Waiting for the artist to confirm too.'
      )
    },
    onError: (error: Error) => toast.error(error.message || 'Could not confirm the end'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => checkinApi.cancel(gigId),
    onSuccess: () => {
      invalidate()
      setShowCancelModal(false)
      toast.success('Booking cancelled.')
      router.push(`/client/gigs/${gigId}`)
    },
    onError: (error: Error) => {
      setShowCancelModal(false)
      toast.error(error.message || 'Could not cancel the booking')
    },
  })

  if (gigLoading) {
    return (
      <div className="max-w-3xl mx-auto">
        <GigCardSkeleton />
      </div>
    )
  }

  if (!gig) {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Gig not found</h2>
        <Button variant="primary" onClick={() => router.push('/client/gigs')}>
          Back to My Gigs
        </Button>
      </div>
    )
  }

  if (gig.status !== 'BOOKED' && gig.status !== 'COMPLETED') {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Nothing to manage yet</h2>
        <p className="text-foreground-muted mb-6">
          Event check-in opens once you accept a bid and the gig is booked.
        </p>
        <Button variant="primary" asChild>
          <Link href={`/client/gigs/${gigId}`}>Back to Gig</Link>
        </Button>
      </div>
    )
  }

  const status = checkIn?.status
  const regenerationsLeft = MAX_REGENERATIONS - (checkIn?.otpRegenerateCount ?? 0)

  // Mirrors the server's generateOtp() preconditions (checkin.service.ts):
  // gig must be BOOKED, and now must be within 30 minutes of the start time.
  // Without this the button is live from the moment a bid is accepted — weeks
  // out — and every press is a guaranteed 400.
  // ponytail: no countdown timer, so the copy tells them the unlock time and a
  // refresh re-evaluates it. Add a tick if that ever feels slow.
  const otpUnlocksAt = (() => {
    const d = new Date(gig.eventTiming.date)
    const [h, m] = gig.eventTiming.startTime.split(':').map(Number)
    d.setHours(h, m, 0, 0)
    return new Date(d.getTime() - 30 * 60 * 1000)
  })()
  const canGenerate = gig.status === 'BOOKED' && Date.now() >= otpUnlocksAt.getTime()

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href={`/client/gigs/${gigId}`}
        className="inline-flex items-center gap-2 text-foreground-muted hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Gig
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-6"
      >
        {/* Event summary */}
        <Card variant="elevated" className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-1">{gig.title}</h1>
              <p className="text-foreground-muted">Event day check-in</p>
            </div>
            <StatusBadge status={gig.status} />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-foreground-muted">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {formatEventDate(gig.eventTiming.date)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {formatTime(gig.eventTiming.startTime)} – {formatTime(gig.eventTiming.endTime)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {gig.venue.name}, {gig.venue.city}
            </span>
          </div>

          {acceptedBid?.artist && (
            <div className="flex items-center gap-3 mt-5 pt-5 border-t border-white/5">
              <Avatar
                src={acceptedBid.artist.profileImage}
                name={acceptedBid.artist.name || 'Artist'}
                size="md"
              />
              <div>
                <p className="font-medium text-foreground">{artistName}</p>
                <p className="text-sm text-foreground-muted">Booked artist</p>
              </div>
            </div>
          )}
        </Card>

        {/* Check-in state */}
        <Card variant="elevated" className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-violet-400" />
            Check-in
          </h2>

          {checkInLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-24 bg-surface rounded-xl" />
              <div className="h-4 bg-surface rounded w-2/3" />
              <div className="h-4 bg-surface rounded w-1/2" />
            </div>
          ) : checkInError ? (
            <div className="text-center py-6">
              <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
              <p className="text-foreground-muted mb-4">
                {(checkInErrorObj as Error)?.message || 'Could not load the check-in status.'}
              </p>
              <Button variant="secondary" onClick={() => refetchCheckIn()}>
                Try Again
              </Button>
            </div>
          ) : !checkIn ? (
            /* Empty state — no record yet */
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
                <KeyRound className="w-7 h-7 text-violet-400" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">No check-in code yet</h3>
              <p className="text-foreground-muted text-sm max-w-md mx-auto mb-5">
                {gig.status === 'COMPLETED'
                  ? 'This gig is already marked completed, so a check-in code can no longer be issued.'
                  : canGenerate
                    ? `Generate a 6-digit code and read it out to ${artistName}. They enter it at the venue to check in.`
                    : `Code generation unlocks 30 minutes before the start time — from ${formatDate(otpUnlocksAt.toISOString(), 'PPp')}. Come back then and read the code out to ${artistName}.`}
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={() => generateMutation.mutate()}
                isLoading={generateMutation.isPending}
                disabled={!canGenerate}
                leftIcon={<KeyRound className="w-4 h-4" />}
              >
                Generate Check-in Code
              </Button>
            </div>
          ) : status === 'CANCELLED' ? (
            <div className="p-4 rounded-xl bg-surface border border-white/5 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-foreground-muted mt-0.5 shrink-0" />
              <p className="text-sm text-foreground-muted">
                This booking was cancelled. The gig is no longer scheduled.
              </p>
            </div>
          ) : status === 'EXPIRED' ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-300">
                The check-in code expired before {artistName} checked in. A new code can&apos;t
                be issued for this event — settle it directly with the artist.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Big OTP — the organizer reads this aloud */}
              {status === 'PENDING' && checkIn.otp && (
                <div className="text-center p-6 rounded-2xl bg-gradient-to-br from-violet-600/15 to-fuchsia-600/15 border border-violet-500/20">
                  <p className="text-xs uppercase tracking-widest text-foreground-muted mb-3">
                    Read this code to {artistName}
                  </p>
                  <p className="text-5xl sm:text-6xl font-bold tracking-[0.2em] gradient-text tabular-nums">
                    {checkIn.otp}
                  </p>
                  {checkIn.otpExpiresAt && (
                    <p className="text-xs text-foreground-subtle mt-3">
                      Valid until {formatDate(checkIn.otpExpiresAt, 'PPp')}
                    </p>
                  )}
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => generateMutation.mutate()}
                      isLoading={generateMutation.isPending}
                      disabled={regenerationsLeft <= 0}
                      leftIcon={<RefreshCw className="w-4 h-4" />}
                    >
                      Regenerate
                    </Button>
                    <span className="text-xs text-foreground-subtle">
                      {regenerationsLeft > 0
                        ? `${regenerationsLeft} regeneration${regenerationsLeft === 1 ? '' : 's'} left`
                        : 'No regenerations left'}
                    </span>
                  </div>
                </div>
              )}

              <CheckInSteps checkIn={checkIn} />

              {checkIn.artistCheckedInAt && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-sm text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {artistName} checked in at {formatDate(checkIn.artistCheckedInAt, 'p')}
                </div>
              )}

              {/* Actions per state */}
              {status === 'PENDING' && (
                <p className="text-sm text-foreground-muted">
                  Waiting for {artistName} to enter the code at the venue. This page updates
                  automatically.
                </p>
              )}

              {status === 'CHECKED_IN' && (
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={() => startMutation.mutate()}
                  isLoading={startMutation.isPending}
                  leftIcon={<PlayCircle className="w-5 h-5" />}
                >
                  Start the Event
                </Button>
              )}

              {status === 'EVENT_STARTED' &&
                (checkIn.endConfirmation?.organizerConfirmed ? (
                  <div className="p-4 rounded-xl bg-surface border border-white/5">
                    <p className="text-sm text-foreground-muted">
                      You&apos;ve confirmed the event ended. Waiting for {artistName} to confirm
                      — the gig completes once you both have.
                    </p>
                  </div>
                ) : (
                  <Button
                    variant="success"
                    size="lg"
                    fullWidth
                    onClick={() => endMutation.mutate()}
                    isLoading={endMutation.isPending}
                    leftIcon={<CheckCircle2 className="w-5 h-5" />}
                  >
                    Confirm the Event Has Ended
                  </Button>
                ))}

              {status === 'EVENT_ENDED' && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-emerald-300">
                    Both parties confirmed. This gig is complete.
                  </p>
                </div>
              )}

              {/* Cancel — server only allows it before the event starts */}
              {(status === 'PENDING' || status === 'CHECKED_IN') && (
                <div className="pt-4 border-t border-white/5">
                  <Button
                    variant="ghost"
                    className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                    onClick={() => setShowCancelModal(true)}
                    leftIcon={<XCircle className="w-4 h-4" />}
                  >
                    Cancel this booking
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Review */}
        {gig.status === 'COMPLETED' && (
          <Card variant="elevated" className="p-6">
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-400" />
              Review
            </h2>
            {alreadyReviewed ? (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                You&apos;ve reviewed {artistName}. Thanks!
              </div>
            ) : (
              <>
                <p className="text-foreground-muted text-sm mb-4">
                  How did it go? Your review is public and helps other organizers choose.
                </p>
                <Button
                  variant="primary"
                  onClick={() => setShowReviewModal(true)}
                  leftIcon={<Star className="w-4 h-4" />}
                >
                  Review {artistName}
                </Button>
              </>
            )}
          </Card>
        )}

        {/* Payment — explicitly out of the beta */}
        <Card variant="default" className="p-5">
          <div className="flex items-start gap-3">
            <Badge variant="primary" size="sm">
              Payment
            </Badge>
            <PaymentNote />
          </div>
        </Card>
      </motion.div>

      <ConfirmModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancel this booking?"
        description="The gig moves out of BOOKED and the artist's accepted bid is cancelled. This can't be undone."
        confirmText="Cancel Booking"
        variant="danger"
        isLoading={cancelMutation.isPending}
      />

      <ReviewModal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        gigId={gigId}
        revieweeName={artistName}
        revieweeId={acceptedBid?.artistId}
        direction="client_to_artist"
      />
    </div>
  )
}
