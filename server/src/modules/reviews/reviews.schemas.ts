import { t } from 'elysia';
import { ReviewType, ReviewStatus } from '../../shared/enums';

/**
 * Ratings Breakdown Schema
 */
const RatingsBreakdownSchema = t.Object({
  professionalism: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
  quality: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
  value: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
  communication: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
});

/**
 * Create Review Schema
 * Used when creating a new review after gig completion
 */
export const CreateReviewSchema = t.Object({
  /** The gig ID being reviewed (must be COMPLETED) */
  gigId: t.String({ minLength: 24, maxLength: 24, pattern: '^[a-fA-F0-9]{24}$' }),
  /** Overall rating (1-5 stars) */
  rating: t.Number({ minimum: 1, maximum: 5 }),
  /** Detailed ratings breakdown */
  ratings: t.Optional(RatingsBreakdownSchema),
  /** Review title (optional) */
  title: t.Optional(t.String({ maxLength: 100 })),
  /** Review comment/feedback */
  comment: t.String({ minLength: 20, maxLength: 2000 }),
  /** Whether reviewer recommends */
  wouldRecommend: t.Optional(t.Boolean({ default: true })),
});

/**
 * Update Review Schema
 * Used for editing own review (within time limit)
 */
export const UpdateReviewSchema = t.Object({
  rating: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
  ratings: t.Optional(RatingsBreakdownSchema),
  title: t.Optional(t.String({ maxLength: 100 })),
  comment: t.Optional(t.String({ minLength: 20, maxLength: 2000 })),
  wouldRecommend: t.Optional(t.Boolean()),
});

/**
 * Response to Review Schema
 * Used by reviewee to respond to a review
 */
export const ReviewResponseSchema = t.Object({
  comment: t.String({ minLength: 10, maxLength: 1000 }),
});

/**
 * Admin Update Review Status Schema
 */
export const AdminUpdateReviewSchema = t.Object({
  status: t.Enum(ReviewStatus),
  moderationNotes: t.Optional(t.String({ maxLength: 500 })),
});

/**
 * Search Reviews Query Schema
 */
export const SearchReviewsSchema = t.Object({
  /** Get reviews for a specific user (as reviewee) */
  userId: t.Optional(t.String()),
  /** Get reviews for a specific gig */
  gigId: t.Optional(t.String()),
  /** Filter by review type */
  type: t.Optional(t.Enum(ReviewType)),
  /** Filter by status */
  status: t.Optional(t.Enum(ReviewStatus)),
  /** Minimum rating filter */
  minRating: t.Optional(t.Numeric({ minimum: 1, maximum: 5 })),
  /** Maximum rating filter */
  maxRating: t.Optional(t.Numeric({ minimum: 1, maximum: 5 })),
  /** Pagination */
  page: t.Optional(t.Numeric({ default: 1 })),
  limit: t.Optional(t.Numeric({ default: 20 })),
});

/**
 * Flag Review Schema
 */
export const FlagReviewSchema = t.Object({
  reason: t.String({ minLength: 10, maxLength: 500 }),
});

// Type exports
export type CreateReviewDto = typeof CreateReviewSchema.static;
export type UpdateReviewDto = typeof UpdateReviewSchema.static;
export type ReviewResponseDto = typeof ReviewResponseSchema.static;
export type AdminUpdateReviewDto = typeof AdminUpdateReviewSchema.static;
export type SearchReviewsDto = typeof SearchReviewsSchema.static;
export type FlagReviewDto = typeof FlagReviewSchema.static;
