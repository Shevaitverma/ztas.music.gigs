import { Elysia, t } from 'elysia';
import { ReviewsService } from './reviews.service';
import {
  CreateReviewSchema,
  UpdateReviewSchema,
  ReviewResponseSchema,
  AdminUpdateReviewSchema,
  SearchReviewsSchema,
  FlagReviewSchema,
} from './reviews.schemas';
import { UserRole, ReviewType } from '../../shared/enums';
import { getAuthUser, type RouteContext } from '../../shared/types/auth.types';
import { transformPlugin } from '../../plugins/transform.plugin';
import { ForbiddenException } from '../../plugins/error.plugin';
import { validateObjectId } from '../../shared/utils/validation.utils';

/**
 * Reviews Routes
 */
export const reviewsRoutes = (reviewsService: ReviewsService) =>
  new Elysia({ prefix: '/reviews' })
    .use(transformPlugin)

    /**
     * Create a review (Protected - after gig completion)
     */
    .post(
      '/',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const body = context.body as Parameters<typeof reviewsService.createReview>[2];
        return await reviewsService.createReview(user.userId, user.role, body);
      },
      {
        body: CreateReviewSchema,
        detail: {
          tags: ['Reviews'],
          summary: 'Create a review for a completed gig',
          description: 'Both clients and artists can review each other after a gig is completed',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Search reviews (Public)
     */
    .get(
      '/',
      async ({ query }) => {
        return await reviewsService.searchReviews({
          userId: query.userId,
          gigId: query.gigId,
          type: query.type as ReviewType | undefined,
          minRating: query.minRating ? parseFloat(query.minRating) : undefined,
          maxRating: query.maxRating ? parseFloat(query.maxRating) : undefined,
          page: query.page ? parseInt(query.page) : 1,
          limit: query.limit ? parseInt(query.limit) : 20,
        });
      },
      {
        query: t.Object({
          userId: t.Optional(t.String()),
          gigId: t.Optional(t.String()),
          type: t.Optional(t.String()),
          minRating: t.Optional(t.String()),
          maxRating: t.Optional(t.String()),
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        detail: {
          tags: ['Reviews'],
          summary: 'Search reviews',
          description: 'Search and filter reviews. All reviews are public.',
        },
      }
    )

    /**
     * Get review by ID (Public)
     */
    .get(
      '/:id',
      async ({ params: { id } }) => {
        validateObjectId(id, 'reviewId');
        return await reviewsService.getReview(id);
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Reviews'],
          summary: 'Get review by ID',
        },
      }
    )

    /**
     * Get reviews for a user (Public)
     */
    .get(
      '/user/:userId',
      async ({ params: { userId }, query }) => {
        validateObjectId(userId, 'userId');
        return await reviewsService.getUserReviews(userId, {
          type: query.type as ReviewType | undefined,
          page: query.page ? parseInt(query.page) : 1,
          limit: query.limit ? parseInt(query.limit) : 20,
        });
      },
      {
        params: t.Object({
          userId: t.String(),
        }),
        query: t.Object({
          type: t.Optional(t.String()),
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        detail: {
          tags: ['Reviews'],
          summary: 'Get reviews for a user',
          description: 'Get all published reviews where the user is the reviewee',
        },
      }
    )

    /**
     * Get user rating statistics (Public)
     */
    .get(
      '/user/:userId/stats',
      async ({ params: { userId } }) => {
        validateObjectId(userId, 'userId');
        return await reviewsService.getUserRatingStats(userId);
      },
      {
        params: t.Object({
          userId: t.String(),
        }),
        detail: {
          tags: ['Reviews'],
          summary: 'Get user rating statistics',
          description: 'Get average rating, total reviews, and rating breakdown for a user',
        },
      }
    )

    /**
     * Get reviews for a gig (Public)
     */
    .get(
      '/gig/:gigId',
      async ({ params: { gigId } }) => {
        validateObjectId(gigId, 'gigId');
        return await reviewsService.getGigReviews(gigId);
      },
      {
        params: t.Object({
          gigId: t.String(),
        }),
        detail: {
          tags: ['Reviews'],
          summary: 'Get reviews for a gig',
        },
      }
    )

    /**
     * Update own review (Protected - within 48 hours)
     */
    .put(
      '/:id',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'reviewId');
        const body = context.body as Parameters<typeof reviewsService.updateReview>[2];
        return await reviewsService.updateReview(id, user.userId, body);
      },
      {
        body: UpdateReviewSchema,
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Reviews'],
          summary: 'Update own review',
          description: 'Reviews can only be edited within 48 hours of creation',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Add response to a review (Protected - reviewee only)
     */
    .post(
      '/:id/response',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'reviewId');
        const body = context.body as { comment: string };
        return await reviewsService.addResponse(id, user.userId, body);
      },
      {
        body: ReviewResponseSchema,
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Reviews'],
          summary: 'Add response to a review',
          description: 'Only the reviewee can respond to a review',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Flag a review (Protected)
     */
    .post(
      '/:id/flag',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'reviewId');
        const body = context.body as { reason: string };
        await reviewsService.flagReview(id, user.userId, body.reason);
        return { message: 'Review flagged for moderation' };
      },
      {
        body: FlagReviewSchema,
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Reviews'],
          summary: 'Flag a review for moderation',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Delete own review (Protected)
     */
    .delete(
      '/:id',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'reviewId');
        await reviewsService.deleteReview(id, user.userId);
        return { message: 'Review deleted successfully' };
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Reviews'],
          summary: 'Delete own review',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Admin: Update review status (Admin only)
     */
    .put(
      '/:id/admin',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Admin access required');
        }
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'reviewId');
        const body = context.body as { status: string; moderationNotes?: string };
        return await reviewsService.adminUpdateReview(id, body.status as any, body.moderationNotes);
      },
      {
        body: AdminUpdateReviewSchema,
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Reviews', 'Admin'],
          summary: 'Admin: Update review status',
          description: 'Change review status (hide, remove, etc.)',
          security: [{ BearerAuth: [] }],
        },
      }
    );
