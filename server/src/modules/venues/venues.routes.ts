import { Elysia, t } from 'elysia';
import { VenuesService } from './venues.service';
import { CreateVenueSchema, UpdateVenueSchema, type CreateVenueDto } from './venues.schemas';
import { UserRole } from '../../shared/enums';
import { getAuthUser, type RouteContext } from '../../shared/types/auth.types';
import { transformPlugin } from '../../plugins/transform.plugin';
import { ForbiddenException } from '../../plugins/error.plugin';
import { validateObjectId } from '../../shared/utils/validation.utils';

/**
 * Venues Routes
 */
export const venuesRoutes = (venuesService: VenuesService) =>
  new Elysia({ prefix: '/venues' })
    .use(transformPlugin)
    /**
     * Create Venue (Protected - Client/Admin only)
     */
    .post(
      '/',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.CLIENT && user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only clients/admins can create venues');
        }
        const context = ctx as RouteContext;
        return await venuesService.createVenue(user.userId, context.body as CreateVenueDto);
      },
      {
        body: CreateVenueSchema,
        detail: {
          tags: ['Venues'],
          summary: 'Create a venue',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get My Venues (Protected) - MUST MATCH NESTJS role requirement: CLIENT or ADMIN only
     */
    .get(
      '/my',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.CLIENT && user.role !== UserRole.ADMIN) {
          throw new ForbiddenException('Only clients/admins can view venues');
        }
        return await venuesService.getMyVenues(user.userId);
      },
      {
        detail: {
          tags: ['Venues'],
          summary: 'Get my venues',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Search Venues (Protected) - MUST MATCH NESTJS which requires auth
     */
    .get(
      '/search',
      async (ctx) => {
        getAuthUser(ctx); // Ensure authenticated
        const context = ctx as RouteContext;
        return await venuesService.searchVenues({
          query: context.query.q,
          city: context.query.city,
        });
      },
      {
        query: t.Object({
          q: t.Optional(t.String()),
          city: t.Optional(t.String()),
        }),
        detail: {
          tags: ['Venues'],
          summary: 'Search venues',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get Venue by ID (Public)
     */
    .get(
      '/:id',
      async ({ params: { id } }) => {
        validateObjectId(id, 'venueId');
        return await venuesService.getVenue(id);
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Venues'],
          summary: 'Get venue details',
        },
      }
    )

    /**
     * Update Venue (Protected)
     */
    .put(
      '/:id',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'venueId');
        return await venuesService.updateVenue(id, user.userId, context.body);
      },
      {
        body: UpdateVenueSchema,
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Venues'],
          summary: 'Update venue',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Delete Venue (Protected)
     */
    .delete(
      '/:id',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'venueId');
        await venuesService.deleteVenue(id, user.userId);
        return { message: 'Venue deleted' };
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Venues'],
          summary: 'Delete venue',
          security: [{ BearerAuth: [] }],
        },
      }
    );
