import { Elysia, t } from 'elysia';
import { GigsService } from './gigs.service';
import { CreateGigSchema, UpdateGigSchema } from './gigs.schemas';
import { UserRole } from '../../shared/enums';
import { getAuthUser, type RouteContext } from '../../shared/types/auth.types';
import { transformPlugin } from '../../plugins/transform.plugin';
import { ForbiddenException } from '../../plugins/error.plugin';
import { validateObjectId } from '../../shared/utils/validation.utils';

/**
 * Gigs Routes
 */
export const gigsRoutes = (gigsService: GigsService) =>
  new Elysia({ prefix: '/gigs' })
    .use(transformPlugin)
    /**
     * Search Gigs (Public) - MUST MATCH NESTJS: uses 'search' parameter
     */
    .get(
      '/',
      async (ctx) => {
        const { query } = ctx;
        // Optional auth read: if a token was attached we use it to determine
        // whether the caller is the gig owner (which unlocks DRAFT visibility).
        // The route remains unauthenticated for callers without tokens.
        const maybeUser = (ctx as RouteContext).user;
        return await gigsService.searchGigs({
          query: query.search || query.query, // Support both 'search' (NestJS) and 'query'
          city: query.city,
          category: query.category,
          status: query.status,
          minBudget: query.minBudget ? parseFloat(query.minBudget) : undefined,
          maxBudget: query.maxBudget ? parseFloat(query.maxBudget) : undefined,
          date: query.date,
          lat: query.lat ? parseFloat(query.lat) : undefined,
          lng: query.lng ? parseFloat(query.lng) : undefined,
          distance: query.distance ? parseFloat(query.distance) : undefined,
          page: query.page ? parseInt(query.page) : 1,
          limit: query.limit ? parseInt(query.limit) : 20,
          postedBy: query.postedBy,
          callerId: maybeUser?.userId,
          excludeGigs: query.excludeGigs ? query.excludeGigs.split(',') : undefined,
          sortBy: query.sortBy,
          sortOrder: (query.sortOrder as 'asc' | 'desc') || 'desc',
        });
      },
      {
        query: t.Object({
          search: t.Optional(t.String()), // Primary parameter (matches NestJS)
          query: t.Optional(t.String()),  // Fallback for backward compatibility
          city: t.Optional(t.String()),
          category: t.Optional(t.String()),
          status: t.Optional(t.String()),
          minBudget: t.Optional(t.String()),
          maxBudget: t.Optional(t.String()),
          date: t.Optional(t.String()),
          lat: t.Optional(t.String()),
          lng: t.Optional(t.String()),
          distance: t.Optional(t.String()),
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          postedBy: t.Optional(t.String()),
          excludeGigs: t.Optional(t.String({ description: 'Comma-separated list of gig IDs to exclude' })),
          sortBy: t.Optional(t.String({ description: 'Sort by: date, budget, city, createdAt' })),
          sortOrder: t.Optional(t.String({ description: 'Sort order: asc or desc' })),
        }),
        detail: {
          tags: ['Gigs'],
          summary: 'Search gigs',
          description: 'Search for gigs with filters. Use "search" parameter for text search.',
        },
      }
    )

    /**
     * Get Available Cities (Public) - MUST MATCH NESTJS: GET /gigs/cities
     */
    .get(
      '/cities',
      async () => {
        return await gigsService.getAvailableCities();
      },
      {
        detail: {
          tags: ['Gigs'],
          summary: 'Get available cities with live gigs',
        },
      }
    )

    /**
     * Search Nearby Gigs (For Artists) - Geospatial Search
     * Artists can find events near their location with distance
     */
    .get(
      '/nearby',
      async ({ query }) => {
        if (!query.lat || !query.lng) {
          throw new Error('lat and lng are required for nearby search');
        }
        // Hard cap distance at 500km to prevent unbounded geo scans even if a
        // misbehaving client tries to override the default.
        const parsedDistance = query.distance ? parseFloat(query.distance) : undefined;
        const distance =
          parsedDistance !== undefined ? Math.min(parsedDistance, 500_000) : undefined;
        return await gigsService.searchNearbyGigs({
          lat: parseFloat(query.lat),
          lng: parseFloat(query.lng),
          distance,
          category: query.category,
          minBudget: query.minBudget ? parseFloat(query.minBudget) : undefined,
          maxBudget: query.maxBudget ? parseFloat(query.maxBudget) : undefined,
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          page: query.page ? parseInt(query.page) : 1,
          limit: query.limit ? parseInt(query.limit) : 20,
        });
      },
      {
        query: t.Object({
          lat: t.String({ description: 'Latitude (required)' }),
          lng: t.String({ description: 'Longitude (required)' }),
          distance: t.Optional(
            t.String({
              description:
                'Max distance in meters (default: 50000, capped at 500000)',
            })
          ),
          category: t.Optional(t.String()),
          minBudget: t.Optional(t.String()),
          maxBudget: t.Optional(t.String()),
          dateFrom: t.Optional(t.String({ description: 'ISO date string' })),
          dateTo: t.Optional(t.String({ description: 'ISO date string' })),
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        detail: {
          tags: ['Gigs'],
          summary: 'Search nearby gigs (for artists)',
          description: 'Find gigs near a location with distance calculation. Returns gigs sorted by distance.',
        },
      }
    )

    /**
     * Get Gigs by City (Public) - MUST MATCH NESTJS: GET /gigs/city/:city
     */
    .get(
      '/city/:city',
      async ({ params: { city }, query }) => {
        return await gigsService.searchGigs({
          city,
          status: 'LIVE',
          page: query.page ? parseInt(query.page) : 1,
          limit: query.limit ? parseInt(query.limit) : 20,
        });
      },
      {
        params: t.Object({
          city: t.String(),
        }),
        query: t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        detail: {
          tags: ['Gigs'],
          summary: 'Get gigs by city',
        },
      }
    )

    /**
     * Get My Gigs (Protected) - GET /gigs/my/list (CLIENT or ADMIN only)
     */
    .get(
      '/my/list',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.CLIENT && user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only clients/managers can view their gigs');
        }
        const { query } = ctx;
        return await gigsService.searchGigs({
          postedBy: user.userId,
          callerId: user.userId,
          status: query.status,
          page: query.page ? parseInt(query.page) : 1,
          limit: query.limit ? parseInt(query.limit) : 20,
        });
      },
      {
        query: t.Object({
          status: t.Optional(t.String()),
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        detail: {
          tags: ['Gigs'],
          summary: 'Get my gigs',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get Gig by ID (Public)
     */
    .get(
      '/:id',
      async (ctx) => {
        const { id } = ctx.params;
        validateObjectId(id, 'gigId');
        // Optional auth read: a non-LIVE gig is only visible to its owner/admin
        // (SRV-006). The route stays public for LIVE gigs / anonymous callers.
        const caller = (ctx as RouteContext).user;
        return await gigsService.getGig(
          id,
          false,
          caller ? { userId: caller.userId, role: caller.role } : undefined
        );
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Gigs'],
          summary: 'Get gig details',
        },
      }
    )

    /**
     * Create Gig (Protected - Clients only)
     */
    .post(
      '/',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.CLIENT && user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only clients can post gigs');
        }
        const context = ctx as RouteContext;
        return await gigsService.createGig(user.userId, context.body);
      },
      {
        body: CreateGigSchema,
        detail: {
          tags: ['Gigs'],
          summary: 'Create a new gig',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Update Gig (Protected)
     */
    .put(
      '/:id',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'gigId');
        return await gigsService.updateGig(id, user.userId, context.body);
      },
      {
        body: UpdateGigSchema,
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Gigs'],
          summary: 'Update a gig',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Delete Gig (Protected)
     */
    .delete(
      '/:id',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'gigId');
        await gigsService.deleteGig(id, user.userId);
        return { message: 'Gig deleted successfully' };
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Gigs'],
          summary: 'Delete a gig',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Publish Gig (Protected) - MUST MATCH FRONTEND: POST /gigs/:id/publish
     * Transitions gig from DRAFT to LIVE
     */
    .post(
      '/:id/publish',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'gigId');
        return await gigsService.publishGig(id, user.userId);
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Gigs'],
          summary: 'Publish a draft gig',
          description: 'Publish a gig to make it live. Only DRAFT gigs can be published.',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Close Gig (Protected) - MUST MATCH FRONTEND: POST /gigs/:id/close
     * Transitions gig to CLOSED (stops accepting applications)
     */
    .post(
      '/:id/close',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'gigId');
        return await gigsService.closeGig(id, user.userId);
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Gigs'],
          summary: 'Close a gig',
          description: 'Close a gig to stop accepting applications.',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Cancel Gig (Protected) - MUST MATCH FRONTEND: POST /gigs/:id/cancel
     * Transitions gig to CANCELLED
     */
    .post(
      '/:id/cancel',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'gigId');
        return await gigsService.cancelGig(id, user.userId);
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Gigs'],
          summary: 'Cancel a gig',
          description: 'Cancel a gig. This action cannot be undone.',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Complete Gig (Protected) - POST /gigs/:id/complete
     * Transitions gig from CLOSED to COMPLETED
     */
    .post(
      '/:id/complete',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'gigId');
        return await gigsService.completeGig(id, user.userId);
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Gigs'],
          summary: 'Complete a gig',
          description: 'Mark a closed gig as completed. Only the gig owner can complete it.',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Upload Gig Image (Protected)
     */
    .post(
      '/:id/images',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'gigId');
        const { file } = context.body as { file: File };
        const url = await gigsService.uploadGigImage(id, user.userId, file);
        return { url };
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        body: t.Object({
          file: t.File()
        }),
        detail: {
          tags: ['Gigs'],
          summary: 'Upload gig image',
          security: [{ BearerAuth: [] }],
        },
      }
    );
