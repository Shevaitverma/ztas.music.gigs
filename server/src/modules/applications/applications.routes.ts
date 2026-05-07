import { Elysia, t } from 'elysia';
import { ApplicationsService } from './applications.service';
import { CreateApplicationSchema, UpdateApplicationStatusSchema } from './applications.schemas';
import { UserRole, ApplicationStatus } from '../../shared/enums';
import { getAuthUser, type RouteContext } from '../../shared/types/auth.types';
import { transformPlugin } from '../../plugins/transform.plugin';
import { ForbiddenException } from '../../plugins/error.plugin';
import { validateObjectId } from '../../shared/utils/validation.utils';

/**
 * Applications Routes
 */
export const applicationsRoutes = (applicationsService: ApplicationsService) =>
  new Elysia({ prefix: '/applications' })
    .use(transformPlugin)
    /**
     * Create Application (Protected - Artist only)
     */
    .post(
      '/',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ARTIST) {
          throw new ForbiddenException('Only artists can apply');
        }
        const context = ctx as RouteContext;
        return await applicationsService.createApplication(user.userId, context.body);
      },
      {
        body: CreateApplicationSchema,
        detail: {
          tags: ['Applications'],
          summary: 'Apply to a gig',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get Applications for Gig (Protected - Client only)
     */
    .get(
      '/gig/:gigId',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const { gigId } = (ctx as RouteContext).params;
        validateObjectId(gigId, 'gigId');
        return await applicationsService.getGigApplications(gigId, user.userId);
      },
      {
        params: t.Object({
          gigId: t.String(),
        }),
        detail: {
          tags: ['Applications'],
          summary: 'Get applications for a gig',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get My Applications (Protected - Artist only) - MUST MATCH NESTJS role requirement
     */
    .get(
      '/my',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ARTIST) {
          throw new ForbiddenException('Only artists can view their applications');
        }
        const context = ctx as RouteContext;
        const query = context.query as {
          page?: string;
          limit?: string;
          status?: string;
        };
        const page = parseInt(query.page || '1', 10);
        const limit = Math.min(parseInt(query.limit || '20', 10), 100); // Cap at 100

        // Whitelist the status filter — silently drop bogus values rather than
        // throw so existing clients don't break on a mistyped query string.
        const validStatuses = Object.values(ApplicationStatus) as string[];
        const status =
          query.status && validStatuses.includes(query.status)
            ? (query.status as ApplicationStatus)
            : undefined;

        return await applicationsService.getMyApplications(
          user.userId,
          page,
          limit,
          status
        );
      },
      {
        query: t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
          status: t.Optional(t.String({ description: 'Filter by ApplicationStatus' })),
        }),
        detail: {
          tags: ['Applications'],
          summary: 'Get my applications',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Update Status (Protected - Client only)
     */
    .put(
      '/:id/status',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'applicationId');
        const { status } = context.body as { status: ApplicationStatus };
        return await applicationsService.updateStatus(id, user.userId, status);
      },
      {
        body: UpdateApplicationStatusSchema,
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Applications'],
          summary: 'Update application status',
          security: [{ BearerAuth: [] }],
        },
      }
    );
