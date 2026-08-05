import { z } from 'zod'

/**
 * Mirrors CreateReviewSchema in server/src/modules/reviews/reviews.schemas.ts.
 * Keep the bounds in sync — the server rejects with 422 otherwise.
 */
const subRating = z.number().int().min(1).max(5).optional()

export const createReviewSchema = z.object({
  gigId: z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid gig'),
  rating: z
    .number()
    .int()
    .min(1, 'Pick an overall rating')
    .max(5),
  ratings: z
    .object({
      professionalism: subRating,
      quality: subRating,
      value: subRating,
      communication: subRating,
    })
    .optional(),
  title: z.string().trim().max(100, 'Title must be 100 characters or fewer').optional(),
  comment: z
    .string()
    .trim()
    .min(20, 'Please write at least 20 characters')
    .max(2000, 'Please keep it under 2000 characters'),
  wouldRecommend: z.boolean(),
})
