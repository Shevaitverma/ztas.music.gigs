import { ReviewModel, GigModel, UserModel, Review } from '../../db/models';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '../../plugins/error.plugin';
import { ReviewType, ReviewStatus, GigStatus, UserRole } from '../../shared/enums';
import type {
  CreateReviewDto,
  UpdateReviewDto,
  ReviewResponseDto,
  SearchReviewsDto,
} from './reviews.schemas';

/**
 * Review Response DTO
 */
export interface ReviewResponse {
  id: string;
  gigId: string;
  reviewer: {
    id: string;
    name?: string;
    profilePicture?: string;
  };
  reviewee: {
    id: string;
    name?: string;
    profilePicture?: string;
  };
  type: ReviewType;
  rating: number;
  ratings?: {
    professionalism?: number;
    quality?: number;
    value?: number;
    communication?: number;
  };
  title?: string;
  comment: string;
  wouldRecommend: boolean;
  response?: {
    comment: string;
    createdAt: Date;
  };
  status: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User Rating Stats
 */
export interface UserRatingStats {
  averageRating: number;
  totalReviews: number;
  ratingBreakdown: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  recommendationRate: number;
}

/**
 * Coerce a rating filter param to an integer in [1,5]; returns undefined if
 * missing or invalid.
 */
function toBoundedRating(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (n < 1 || n > 5) return undefined;
  return n;
}

/**
 * Reviews Service
 */
export class ReviewsService {
  /**
   * Create a review for a completed gig
   */
  async createReview(userId: string, userRole: UserRole, dto: CreateReviewDto): Promise<ReviewResponse> {
    // Find the gig
    const gig = await GigModel.findById(dto.gigId)
      .populate('postedBy', 'name profilePicture')
      .populate('acceptedApplicant', 'name profilePicture')
      .exec();

    if (!gig) {
      throw new NotFoundException('Gig not found');
    }

    // Gig must be completed
    if (gig.status !== GigStatus.COMPLETED) {
      throw new BadRequestException('Can only review completed gigs');
    }

    // Determine review type and participants
    let reviewType: ReviewType;
    let revieweeId: string;

    const isClient = gig.postedBy._id.toString() === userId;
    const isArtist = gig.acceptedApplicant?._id?.toString() === userId;

    // SECURITY (H3): explicitly reject self-review when the same user is both
    // the poster and the accepted applicant (edge case — usually shouldn't
    // happen but the data permits it).
    if (isClient && isArtist) {
      throw new BadRequestException('You cannot review yourself');
    }

    if (isClient && userRole === UserRole.CLIENT) {
      // Client reviewing the artist
      reviewType = ReviewType.CLIENT_TO_ARTIST;
      if (!gig.acceptedApplicant) {
        throw new BadRequestException('No artist was accepted for this gig');
      }
      revieweeId = gig.acceptedApplicant._id.toString();
    } else if (isArtist && userRole === UserRole.ARTIST) {
      // Artist reviewing the client
      reviewType = ReviewType.ARTIST_TO_CLIENT;
      revieweeId = gig.postedBy._id.toString();
    } else {
      throw new ForbiddenException('You are not a participant of this gig');
    }

    if (revieweeId === userId) {
      throw new BadRequestException('You cannot review yourself');
    }

    // Check if already reviewed (per direction; unique index also enforces this)
    const existingReview = await ReviewModel.findOne({
      gig: dto.gigId,
      reviewer: userId,
      type: reviewType,
    }).exec();

    if (existingReview) {
      throw new BadRequestException('You have already reviewed this gig');
    }

    // Create the review
    const review = new ReviewModel({
      gig: dto.gigId,
      reviewer: userId,
      reviewee: revieweeId,
      type: reviewType,
      rating: dto.rating,
      ratings: dto.ratings,
      title: dto.title,
      comment: dto.comment,
      wouldRecommend: dto.wouldRecommend ?? true,
      status: ReviewStatus.PUBLISHED, // Auto-publish, can add moderation later
    });

    await review.save();

    // Populate for response
    await review.populate('reviewer', 'name profilePicture');
    await review.populate('reviewee', 'name profilePicture');

    return this.transformReviewResponse(review);
  }

  /**
   * Get review by ID
   */
  async getReview(reviewId: string): Promise<ReviewResponse> {
    const review = await ReviewModel.findById(reviewId)
      .populate('reviewer', 'name profilePicture')
      .populate('reviewee', 'name profilePicture')
      .exec();

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return this.transformReviewResponse(review);
  }

  /**
   * Update own review (within 48 hours of creation)
   */
  async updateReview(reviewId: string, userId: string, dto: UpdateReviewDto): Promise<ReviewResponse> {
    const review = await ReviewModel.findById(reviewId).exec();

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.reviewer.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own reviews');
    }

    // Check if within edit window (48 hours)
    const hoursSinceCreation = (Date.now() - review.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 48) {
      throw new BadRequestException('Reviews can only be edited within 48 hours of creation');
    }

    // Apply updates
    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.ratings !== undefined) review.ratings = dto.ratings;
    if (dto.title !== undefined) review.title = dto.title;
    if (dto.comment !== undefined) review.comment = dto.comment;
    if (dto.wouldRecommend !== undefined) review.wouldRecommend = dto.wouldRecommend;

    await review.save();

    // Populate for response
    await review.populate('reviewer', 'name profilePicture');
    await review.populate('reviewee', 'name profilePicture');

    return this.transformReviewResponse(review);
  }

  /**
   * Add response to a review (by reviewee)
   */
  async addResponse(reviewId: string, userId: string, dto: ReviewResponseDto): Promise<ReviewResponse> {
    const review = await ReviewModel.findById(reviewId).exec();

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.reviewee.toString() !== userId) {
      throw new ForbiddenException('Only the reviewee can respond to this review');
    }

    if (review.response) {
      throw new BadRequestException('A response already exists for this review');
    }

    review.response = {
      comment: dto.comment,
      createdAt: new Date(),
    };

    await review.save();

    // Populate for response
    await review.populate('reviewer', 'name profilePicture');
    await review.populate('reviewee', 'name profilePicture');

    return this.transformReviewResponse(review);
  }

  /**
   * Get reviews for a user (as reviewee)
   */
  async getUserReviews(
    userId: string,
    params: { type?: ReviewType; page?: number; limit?: number }
  ): Promise<{ data: ReviewResponse[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      reviewee: userId,
      status: ReviewStatus.PUBLISHED,
    };

    if (params.type) {
      filter.type = params.type;
    }

    const [reviews, total] = await Promise.all([
      ReviewModel.find(filter)
        .populate('reviewer', 'name profilePicture')
        .populate('reviewee', 'name profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      ReviewModel.countDocuments(filter).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: reviews.map((r) => this.transformReviewResponse(r)),
      meta: { total, page, limit, totalPages },
    };
  }

  /**
   * Get reviews for a gig
   */
  async getGigReviews(gigId: string): Promise<ReviewResponse[]> {
    const reviews = await ReviewModel.find({
      gig: gigId,
      status: ReviewStatus.PUBLISHED,
    })
      .populate('reviewer', 'name profilePicture')
      .populate('reviewee', 'name profilePicture')
      .sort({ createdAt: -1 })
      .exec();

    return reviews.map((r) => this.transformReviewResponse(r));
  }

  /**
   * Get user rating statistics
   */
  async getUserRatingStats(userId: string): Promise<UserRatingStats> {
    const reviews = await ReviewModel.find({
      reviewee: userId,
      status: ReviewStatus.PUBLISHED,
    }).exec();

    if (reviews.length === 0) {
      return {
        averageRating: 0,
        totalReviews: 0,
        ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        recommendationRate: 0,
      };
    }

    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const recommendCount = reviews.filter((r) => r.wouldRecommend).length;
    const breakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    reviews.forEach((r) => {
      breakdown[r.rating]++;
    });

    return {
      averageRating: Math.round((totalRating / reviews.length) * 10) / 10,
      totalReviews: reviews.length,
      ratingBreakdown: breakdown as { 1: number; 2: number; 3: number; 4: number; 5: number },
      recommendationRate: Math.round((recommendCount / reviews.length) * 100),
    };
  }

  /**
   * Flag a review (by any user)
   */
  async flagReview(reviewId: string, userId: string, reason: string): Promise<void> {
    const review = await ReviewModel.findById(reviewId).exec();

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Can't flag own review
    if (review.reviewer.toString() === userId) {
      throw new BadRequestException('You cannot flag your own review');
    }

    review.isFlagged = true;
    review.flagReason = reason;
    await review.save();
  }

  /**
   * Search reviews (for admin)
   */
  async searchReviews(
    params: SearchReviewsDto
  ): Promise<{ data: ReviewResponse[]; meta: { total: number; page: number; limit: number; totalPages: number } }> {
    const page = Number(params.page) || 1;
    const limit = Number(params.limit) || 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (params.userId) filter.reviewee = params.userId;
    if (params.gigId) filter.gig = params.gigId;
    if (params.type) filter.type = params.type;
    if (params.status) filter.status = params.status;

    // SECURITY (M6): build the rating range in one block; validate numeric
    // and 1-5; ignore NaN.
    const minRating = toBoundedRating(params.minRating);
    const maxRating = toBoundedRating(params.maxRating);
    if (minRating !== undefined || maxRating !== undefined) {
      const range: Record<string, number> = {};
      if (minRating !== undefined) range.$gte = minRating;
      if (maxRating !== undefined) range.$lte = maxRating;
      filter.rating = range;
    }

    const [reviews, total] = await Promise.all([
      ReviewModel.find(filter)
        .populate('reviewer', 'name profilePicture')
        .populate('reviewee', 'name profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      ReviewModel.countDocuments(filter).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: reviews.map((r) => this.transformReviewResponse(r)),
      meta: { total, page, limit, totalPages },
    };
  }

  /**
   * Admin: Update review status
   */
  async adminUpdateReview(
    reviewId: string,
    status: ReviewStatus,
    moderationNotes?: string
  ): Promise<ReviewResponse> {
    const review = await ReviewModel.findById(reviewId).exec();

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    review.status = status;
    if (moderationNotes) {
      review.moderationNotes = moderationNotes;
    }

    await review.save();

    await review.populate('reviewer', 'name profilePicture');
    await review.populate('reviewee', 'name profilePicture');

    return this.transformReviewResponse(review);
  }

  /**
   * Delete own review.
   *
   * SECURITY (H4): same 48h window as edit. Prevents long-tail "delete after
   * the reviewee complains" abuse.
   */
  async deleteReview(reviewId: string, userId: string): Promise<void> {
    const review = await ReviewModel.findById(reviewId).exec();

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    if (review.reviewer.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    const hoursSinceCreation = (Date.now() - review.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreation > 48) {
      throw new BadRequestException('Reviews can only be deleted within 48 hours of creation');
    }

    await review.deleteOne();
  }

  /**
   * Transform Review document to response DTO
   */
  private transformReviewResponse(review: Review): ReviewResponse {
    const reviewer = review.reviewer as unknown as { _id: { toString(): string }; name?: string; profilePicture?: string };
    const reviewee = review.reviewee as unknown as { _id: { toString(): string }; name?: string; profilePicture?: string };

    return {
      id: review._id.toString(),
      gigId: review.gig.toString(),
      reviewer: {
        id: reviewer._id?.toString() || review.reviewer.toString(),
        name: reviewer.name,
        profilePicture: reviewer.profilePicture,
      },
      reviewee: {
        id: reviewee._id?.toString() || review.reviewee.toString(),
        name: reviewee.name,
        profilePicture: reviewee.profilePicture,
      },
      type: review.type,
      rating: review.rating,
      ratings: review.ratings,
      title: review.title,
      comment: review.comment,
      wouldRecommend: review.wouldRecommend,
      response: review.response,
      status: review.status,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }
}
