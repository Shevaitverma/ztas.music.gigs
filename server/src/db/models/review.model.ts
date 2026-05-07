import { Schema, model, Document, Types } from 'mongoose';
import { ReviewType, ReviewStatus } from '../../shared/enums';

/**
 * Review Interface
 * Represents a review given after a completed gig
 */
export interface Review extends Document {
  /** The completed gig this review is for */
  gig: Types.ObjectId;
  /** Who is giving the review */
  reviewer: Types.ObjectId;
  /** Who is being reviewed */
  reviewee: Types.ObjectId;
  /** Type of review (CLIENT_TO_ARTIST or ARTIST_TO_CLIENT) */
  type: ReviewType;
  /** Overall rating (1-5 stars) */
  rating: number;
  /** Detailed ratings breakdown */
  ratings: {
    /** Professionalism (punctuality, communication) */
    professionalism?: number;
    /** Quality of performance/event */
    quality?: number;
    /** Value for money */
    value?: number;
    /** Communication responsiveness */
    communication?: number;
  };
  /** Review title */
  title?: string;
  /** Review comment/feedback */
  comment: string;
  /** Review status for moderation */
  status: ReviewStatus;
  /** Whether reviewer recommends */
  wouldRecommend: boolean;
  /** Response from the reviewee */
  response?: {
    comment: string;
    createdAt: Date;
  };
  /** Moderation notes (admin only) */
  moderationNotes?: string;
  /** Flag for inappropriate content */
  isFlagged: boolean;
  flagReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Ratings Breakdown Schema
 */
const RatingsBreakdownSchema = new Schema(
  {
    professionalism: { type: Number, min: 1, max: 5 },
    quality: { type: Number, min: 1, max: 5 },
    value: { type: Number, min: 1, max: 5 },
    communication: { type: Number, min: 1, max: 5 },
  },
  { _id: false }
);

/**
 * Response Schema
 */
const ResponseSchema = new Schema(
  {
    comment: { type: String, required: true, trim: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

/**
 * Review Schema
 */
const ReviewSchema = new Schema<Review>(
  {
    gig: {
      type: Schema.Types.ObjectId,
      ref: 'Gig',
      required: true,
      index: true,
    },
    reviewer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    reviewee: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: Object.values(ReviewType),
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    ratings: {
      type: RatingsBreakdownSchema,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(ReviewStatus),
      default: ReviewStatus.PUBLISHED,
      index: true,
    },
    wouldRecommend: {
      type: Boolean,
      default: true,
    },
    response: {
      type: ResponseSchema,
    },
    moderationNotes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    isFlagged: {
      type: Boolean,
      default: false,
      index: true,
    },
    flagReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  { timestamps: true }
);

// Compound indexes
// One review per reviewer per gig per direction (prevent duplicate reviews).
// SECURITY (H3): includes `type` so a reviewer who is BOTH the client and the
// accepted artist (edge case) cannot block the second-direction review by
// virtue of the unique index — but the service-level self-review guard
// rejects this case anyway.
ReviewSchema.index({ gig: 1, reviewer: 1, type: 1 }, { unique: true });

// Find reviews for a user (as reviewee)
ReviewSchema.index({ reviewee: 1, status: 1, createdAt: -1 });

// Find reviews by a user (as reviewer)
ReviewSchema.index({ reviewer: 1, createdAt: -1 });

// Admin moderation queries
ReviewSchema.index({ status: 1, isFlagged: 1, createdAt: -1 });

/**
 * Review Model
 */
export const ReviewModel = model<Review>('Review', ReviewSchema);
