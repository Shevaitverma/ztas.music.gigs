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
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Star,
  XCircle,
} from 'lucide-react'
import { Card, Button, Badge, StatusBadge, GigCardSkeleton } from '@/components/ui'
import { CheckInSteps, PaymentNote } from '@/components/checkin-steps'
import { ReviewModal } from '@/components/review-modal'
import { gigsApi, bidsApi, checkinApi, reviewsApi } from '@/lib/api'
import { CHECKIN_LIVE_STATUSES } from '@/lib/api/checkin'
import { ApiClientError } from '@/lib/api/client'
import { capture } from '@/lib/analytics'
import { useAuth } from '@/lib/providers'
import { formatEventDate, formatTime, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

/**
 * Resolve the device's coordinates for the check-in payload.
 *
 * The server REQUIRES `location` on POST /checkin/verify-otp and compares it to
 * the venue's geoPoint, so every failure mode here has to produce a message the
 * artist can act on rather than a silent dead end.
 */
function getCurrentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      reject(
        new Error(
          "This browser can't share your location. Open this page in Chrome or Safari on your phone to check in."
        )
      )
      return
    }

    // Browsers block geolocation outside secure contexts (https / localhost).
    if (!window.isSecureContext) {
      reject(
        new Error(
          'Location sharing needs a secure (https) connection. Open this page over https and try again.'
        )
      )
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            reject(
              new Error(
                'Location permission was denied. Allow location for this site in your browser settings (tap the lock icon in the address bar), then try again.'
              )
            )
            break
          case err.POSITION_UNAVAILABLE:
            reject(
              new Error(
                "Your location couldn't be determined. Turn on GPS / location services, step outside if you're indoors, and try again."
              )
            )
            break
          case err.TIMEOUT:
            reject(
              new Error(
                'Getting your location timed out. Check that location services are on and try again.'
              )
            )
            break
          default:
            reject(new Error('Could not get your location. Please try again.'))
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 }
    )
  })
}

/**
 * Bucket a check-in failure into an enum for analytics. The server returns
 * prose (see server/src/modules/checkin/checkin.service.ts), so this maps it —
 * the raw message must never reach the analytics payload.
 */
function otpFailureReason(error: Error): string {
  // Anything that isn't an API error failed before the request went out, and
  // getCurrentPosition is the only thing that can do that here.
  if (!(error instanceof ApiClientError)) return 'location_unavailable'
  if (error.statusCode === 429) return 'locked_out'
  if (/from the venue/i.test(error.message)) return 'too_far'
  if (/invalid otp/i.test(error.message)) return 'wrong_code'
  if (/expired/i.test(error.message)) return 'expired'
  return 'other'
}

export default function ArtistCheckInPage() {
  const params = useParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const gigId = params.id as string

  const [otp, setOtp] = useState('')
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLockedOut, setIsLockedOut] = useState(false)

  const { data: gig, isLoading: gigLoading } = useQuery({
    queryKey: ['gig', gigId],
    queryFn: () => gigsApi.getById(gigId),
    enabled: !!gigId,
  })

  // `GET /gigs/:id` doesn't return acceptedArtist, so the artist's own accepted
  // bid is what tells us this booking is theirs.
  //
  // Deliberately NOT `getAcceptedBids()` (`/bids/my/accepted`): that endpoint
  // drops any gig whose eventTiming.date (stored as UTC midnight) is in the
  // past, and any COMPLETED gig — i.e. it goes empty part-way through the event
  // day and again the moment this very page completes the gig. `/bids/my` has
  // no date or gig-status filter, so ownership stays true for the whole flow.
  const { data: acceptedBids = [], isLoading: bidsLoading } = useQuery({
    queryKey: ['bids', 'my', 'ACCEPTED'],
    queryFn: () => bidsApi.getMyBids({ status: 'ACCEPTED' }),
    enabled: !!gigId,
  })
  const myBid = acceptedBids.find((b) => b.gigId === gigId)

  const {
    data: checkIn,
    isLoading: checkInLoading,
    isError: checkInError,
    error: checkInErrorObj,
    refetch: refetchCheckIn,
    isFetching: checkInFetching,
  } = useQuery({
    queryKey: ['checkin', gigId],
    queryFn: () => checkinApi.getStatusOrNull(gigId),
    enabled: !!gigId,
    refetchInterval: (query) =>
      query.state.data && CHECKIN_LIVE_STATUSES.includes(query.state.data.status) ? 10_000 : false,
  })

  const { data: gigReviews = [] } = useQuery({
    queryKey: ['reviews', 'gig', gigId],
    queryFn: () => reviewsApi.getGigReviews(gigId),
    enabled: !!gigId && gig?.status === 'COMPLETED',
  })
  const alreadyReviewed = gigReviews.some((r) => r.reviewer?.id === user?.id)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['checkin', gigId] })
    queryClient.invalidateQueries({ queryKey: ['gig', gigId] })
    // Prefix key — covers ['bids','my','ACCEPTED'], ['bids','my','stats'], etc.
    queryClient.invalidateQueries({ queryKey: ['bids', 'my'] })
  }

  const verifyMutation = useMutation({
    mutationFn: async () => {
      // Geolocation first — the request is invalid without it.
      const location = await getCurrentPosition()
      return checkinApi.verifyOtp(gigId, otp, location)
    },
    onSuccess: () => {
      capture('checkin_otp_verified')
      setErrorMessage(null)
      setIsLockedOut(false)
      setOtp('')
      invalidate()
      toast.success("You're checked in.")
    },
    onError: (error: Error) => {
      capture('checkin_otp_failed', { reason: otpFailureReason(error) })
      setIsLockedOut(error instanceof ApiClientError && error.statusCode === 429)
      setErrorMessage(error.message || 'Check-in failed. Please try again.')
    },
  })

  const endMutation = useMutation({
    mutationFn: () => checkinApi.endEvent(gigId),
    onSuccess: (result) => {
      capture('event_ended_confirmed', { role: 'artist' })
      // See the organizer's manage page — only the second confirmer sees this,
      // so gig_completed fires once per gig.
      if (result.status === 'EVENT_ENDED') capture('gig_completed', { confirmed_by: 'artist' })
      invalidate()
      toast.success(
        result.status === 'EVENT_ENDED'
          ? 'Event completed. You can leave a review now.'
          : 'Confirmed. Waiting for the organizer to confirm too.'
      )
    },
    onError: (error: Error) => toast.error(error.message || 'Could not confirm the end'),
  })

  if (gigLoading || bidsLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <GigCardSkeleton />
      </div>
    )
  }

  if (!gig) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">Gig not found</h2>
        <Button variant="primary" onClick={() => router.push('/artist/bids')}>
          Back to My Bids
        </Button>
      </div>
    )
  }

  if (!myBid) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-2">
          You&apos;re not booked for this gig
        </h2>
        <p className="text-foreground-muted mb-6">
          Check-in is only available to the artist whose bid was accepted.
        </p>
        <Button variant="primary" asChild>
          <Link href={`/artist/gigs/${gigId}`}>View Gig</Link>
        </Button>
      </div>
    )
  }

  const status = checkIn?.status
  const organizerName = gig.postedBy?.name || 'the organizer'

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href={`/artist/bids/${myBid.id}`}
        className="inline-flex items-center gap-2 text-foreground-muted hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Bid
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
        </Card>

        {/* Check-in state */}
        <Card variant="elevated" className="p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-violet-400" />
            Check-in
          </h2>

          {checkInLoading ? (
            <div className="animate-pulse space-y-3">
              <div className="h-14 bg-surface rounded-xl" />
              <div className="h-4 bg-surface rounded w-2/3" />
              <div className="h-4 bg-surface rounded w-1/2" />
            </div>
          ) : checkInError ? (
            <div className="text-center py-6">
              <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
              <p className="text-foreground-muted mb-4">
                {(checkInErrorObj as Error)?.message || 'Could not load your check-in status.'}
              </p>
              <Button variant="secondary" onClick={() => refetchCheckIn()}>
                Try Again
              </Button>
            </div>
          ) : !checkIn ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
                <Clock className="w-7 h-7 text-violet-400" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">No code yet</h3>
              <p className="text-foreground-muted text-sm max-w-md mx-auto mb-5">
                {organizerName} generates your 6-digit code at the venue, from 30 minutes
                before the start time. Ask them for it when you arrive.
              </p>
              <Button
                variant="secondary"
                onClick={() => refetchCheckIn()}
                isLoading={checkInFetching}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Check Again
              </Button>
            </div>
          ) : status === 'CANCELLED' ? (
            <div className="p-4 rounded-xl bg-surface border border-white/5 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-foreground-muted mt-0.5 shrink-0" />
              <p className="text-sm text-foreground-muted">
                This booking was cancelled by {organizerName}.
              </p>
            </div>
          ) : status === 'EXPIRED' ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-300">
                The check-in code expired. A new one can&apos;t be issued for this event — sort
                it out directly with {organizerName}.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* OTP entry */}
              {status === 'PENDING' && (
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="checkin-otp"
                      className="block text-sm font-medium text-foreground-muted mb-2"
                    >
                      Enter the 6-digit code from {organizerName}
                    </label>
                    <input
                      id="checkin-otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="000000"
                      value={otp}
                      disabled={verifyMutation.isPending || isLockedOut}
                      onChange={(e) => {
                        setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                        setErrorMessage(null)
                      }}
                      className="w-full h-16 rounded-xl bg-surface-elevated border border-white/10 text-center text-3xl font-bold tracking-[0.4em] tabular-nums text-foreground placeholder:text-foreground-subtle focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all outline-none disabled:opacity-50"
                    />
                    <p className="mt-2 text-xs text-foreground-subtle">
                      We&apos;ll also ask your browser for your location — the organizer&apos;s
                      venue check requires it.
                    </p>
                  </div>

                  {errorMessage && (
                    <div
                      role="alert"
                      className={
                        isLockedOut
                          ? 'p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3'
                          : 'p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3'
                      }
                    >
                      {isLockedOut ? (
                        <ShieldAlert className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                      )}
                      <div>
                        {isLockedOut && (
                          <p className="font-medium text-rose-300 mb-1">Check-in locked</p>
                        )}
                        <p
                          className={`text-sm ${isLockedOut ? 'text-rose-300' : 'text-amber-300'}`}
                        >
                          {errorMessage}
                        </p>
                        {isLockedOut && (
                          <p className="text-sm text-rose-300/80 mt-1">
                            Ask {organizerName} to regenerate the code — that clears the lock
                            immediately.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onClick={() => verifyMutation.mutate()}
                    disabled={otp.length !== 6 || isLockedOut}
                    isLoading={verifyMutation.isPending}
                    leftIcon={<CheckCircle2 className="w-5 h-5" />}
                  >
                    Check In
                  </Button>

                  {verifyMutation.isPending && (
                    <p className="flex items-center justify-center gap-2 text-xs text-foreground-subtle">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Getting your location…
                    </p>
                  )}

                  {isLockedOut && (
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => {
                        setIsLockedOut(false)
                        setErrorMessage(null)
                        refetchCheckIn()
                      }}
                      leftIcon={<RefreshCw className="w-4 h-4" />}
                    >
                      I have a new code
                    </Button>
                  )}
                </div>
              )}

              <CheckInSteps checkIn={checkIn} />

              {status === 'CHECKED_IN' && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-emerald-300">
                    You&apos;re checked in
                    {checkIn.artistCheckedInAt
                      ? ` at ${formatDate(checkIn.artistCheckedInAt, 'p')}`
                      : ''}
                    . {organizerName} starts the event from their side.
                  </p>
                </div>
              )}

              {status === 'EVENT_STARTED' &&
                (checkIn.endConfirmation?.artistConfirmed ? (
                  <div className="p-4 rounded-xl bg-surface border border-white/5">
                    <p className="text-sm text-foreground-muted">
                      You&apos;ve confirmed the event ended. Waiting for {organizerName} — the
                      gig completes once you both have.
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
                    Both parties confirmed. This gig counts as completed.
                  </p>
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
                You&apos;ve reviewed {organizerName}. Thanks!
              </div>
            ) : (
              <>
                <p className="text-foreground-muted text-sm mb-4">
                  How was the organizer to work with? Your review is public.
                </p>
                <Button
                  variant="primary"
                  onClick={() => setShowReviewModal(true)}
                  leftIcon={<Star className="w-4 h-4" />}
                >
                  Review {organizerName}
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

      <ReviewModal
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        gigId={gigId}
        revieweeName={organizerName}
        revieweeId={gig.postedBy?.id}
        direction="artist_to_client"
      />
    </div>
  )
}
