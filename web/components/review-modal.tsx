'use client'

import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Star, ThumbsUp, ThumbsDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal, Button, Input } from '@/components/ui'
import { reviewsApi } from '@/lib/api'
import { capture } from '@/lib/analytics'
import { createReviewSchema } from '@/lib/schemas/review'
import { cn } from '@/lib/utils'

type SubRatingKey = 'professionalism' | 'quality' | 'value' | 'communication'

const subRatingLabels: Record<SubRatingKey, string> = {
  professionalism: 'Professionalism',
  quality: 'Quality of performance',
  value: 'Value for money',
  communication: 'Communication',
}

function StarPicker({
  value,
  onChange,
  size = 'md',
  label,
}: {
  value: number
  onChange: (v: number) => void
  size?: 'sm' | 'md'
  label: string
}) {
  const sizeClass = size === 'sm' ? 'w-5 h-5' : 'w-8 h-8'
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
          onClick={() => onChange(star)}
          className="p-0.5 rounded-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          <Star
            className={cn(
              sizeClass,
              star <= value ? 'text-amber-400 fill-amber-400' : 'text-foreground-subtle'
            )}
          />
        </button>
      ))}
    </div>
  )
}

export interface ReviewModalProps {
  isOpen: boolean
  onClose: () => void
  gigId: string
  /** Who is being reviewed — used for copy and cache invalidation. */
  revieweeName: string
  revieweeId?: string
  /**
   * Which way the review runs. The server derives this itself; it is passed
   * here only so analytics can tell the two sides of the funnel apart.
   */
  direction: 'client_to_artist' | 'artist_to_client'
}

/**
 * Review creation for a COMPLETED gig. Works from either side — the server
 * derives the direction (CLIENT_TO_ARTIST / ARTIST_TO_CLIENT) from the caller's
 * role and their relationship to the gig, so there is nothing to pass.
 */
export function ReviewModal({
  isOpen,
  onClose,
  gigId,
  revieweeName,
  revieweeId,
  direction,
}: ReviewModalProps) {
  const queryClient = useQueryClient()
  const commentId = useId()
  const commentHintId = useId()

  const [rating, setRating] = useState(0)
  const [subRatings, setSubRatings] = useState<Partial<Record<SubRatingKey, number>>>({})
  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const [wouldRecommend, setWouldRecommend] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setRating(0)
    setSubRatings({})
    setTitle('')
    setComment('')
    setWouldRecommend(true)
    setError(null)
  }

  const mutation = useMutation({
    mutationFn: () =>
      reviewsApi.create({
        gigId,
        rating,
        // Only send sub-ratings the user actually set.
        ratings: Object.keys(subRatings).length > 0 ? subRatings : undefined,
        title: title.trim() || undefined,
        comment: comment.trim(),
        wouldRecommend,
      }),
    onSuccess: () => {
      // Rating only — the title and comment are free text and never leave here.
      capture('review_submitted', { direction, rating, would_recommend: wouldRecommend })
      queryClient.invalidateQueries({ queryKey: ['reviews', 'gig', gigId] })
      if (revieweeId) {
        queryClient.invalidateQueries({ queryKey: ['reviews', 'user', revieweeId] })
        queryClient.invalidateQueries({ queryKey: ['reviews', 'stats', revieweeId] })
      }
      // The gig card / lists surface "reviewed" state, so refresh them too.
      queryClient.invalidateQueries({ queryKey: ['gig', gigId] })
      queryClient.invalidateQueries({ queryKey: ['gigs', 'my'] })
      queryClient.invalidateQueries({ queryKey: ['bids', 'my'] })
      toast.success('Review submitted. Thank you!')
      reset()
      onClose()
    },
    onError: (err: Error) => {
      setError(err.message || 'Could not submit your review. Please try again.')
    },
  })

  const handleSubmit = () => {
    setError(null)
    const result = createReviewSchema.safeParse({
      gigId,
      rating,
      ratings: Object.keys(subRatings).length > 0 ? subRatings : undefined,
      title: title.trim() || undefined,
      comment: comment.trim(),
      wouldRecommend,
    })
    if (!result.success) {
      setError(result.error.issues[0]?.message || 'Please check the form and try again.')
      return
    }
    mutation.mutate()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={mutation.isPending ? () => {} : onClose}
      title={`Review ${revieweeName}`}
      description="Your review is public and helps the next person decide."
      size="xl"
    >
      <div className="space-y-6">
        {/* Overall rating */}
        <div>
          {/* Not a <label>: it has no single control. StarPicker is a labelled radiogroup. */}
          <p className="block text-sm font-medium text-foreground-muted mb-2">Overall rating</p>
          <div className="flex items-center gap-3">
            <StarPicker value={rating} onChange={setRating} label="Overall rating" />
            <span className="text-sm text-foreground-muted">
              {rating > 0 ? `${rating} / 5` : 'Tap to rate'}
            </span>
          </div>
        </div>

        {/* Sub-ratings */}
        <div>
          <p className="block text-sm font-medium text-foreground-muted mb-3">
            Details <span className="text-foreground-subtle font-normal">(optional)</span>
          </p>
          <div className="space-y-3">
            {(Object.keys(subRatingLabels) as SubRatingKey[]).map((key) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <span className="text-sm text-foreground-muted">{subRatingLabels[key]}</span>
                <StarPicker
                  size="sm"
                  label={subRatingLabels[key]}
                  value={subRatings[key] ?? 0}
                  onChange={(v) => setSubRatings((prev) => ({ ...prev, [key]: v }))}
                />
              </div>
            ))}
          </div>
        </div>

        <Input
          label="Title (optional)"
          placeholder="Sum it up in a few words"
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div>
          <label
            htmlFor={commentId}
            className="block text-sm font-medium text-foreground-muted mb-2"
          >
            Your review
          </label>
          <textarea
            id={commentId}
            aria-describedby={commentHintId}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="What went well? What could have been better?"
            className="w-full rounded-xl border bg-surface-elevated px-4 py-3 text-foreground placeholder:text-foreground-subtle border-white/10 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all outline-none resize-none"
          />
          <p id={commentHintId} className="mt-1 text-xs text-foreground-subtle">
            {comment.trim().length}/20 minimum characters
          </p>
        </div>

        {/* Recommend */}
        <div>
          <p className="block text-sm font-medium text-foreground-muted mb-2">
            Would you work with {revieweeName} again?
          </p>
          <div
            className="flex gap-3"
            role="group"
            aria-label={`Would you work with ${revieweeName} again?`}
          >
            <button
              type="button"
              onClick={() => setWouldRecommend(true)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors',
                wouldRecommend
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-surface border-white/10 text-foreground-muted hover:text-foreground'
              )}
            >
              <ThumbsUp className="w-4 h-4" />
              Yes
            </button>
            <button
              type="button"
              onClick={() => setWouldRecommend(false)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors',
                !wouldRecommend
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  : 'bg-surface border-white/10 text-foreground-muted hover:text-foreground'
              )}
            >
              <ThumbsDown className="w-4 h-4" />
              No
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-rose-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} isLoading={mutation.isPending}>
            Submit Review
          </Button>
        </div>
      </div>
    </Modal>
  )
}
