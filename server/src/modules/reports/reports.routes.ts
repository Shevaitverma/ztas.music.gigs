import { Elysia, t } from 'elysia';
import { ReportsService } from './reports.service';
import {
  CreateReportSchema,
  UpdateReportSchema,
  AdminUpdateReportSchema,
  ResolveReportSchema,
} from './reports.schemas';
import { UserRole, AdminPermission } from '../../shared/enums';
import { getAuthUser, type RouteContext } from '../../shared/types/auth.types';
import { transformPlugin } from '../../plugins/transform.plugin';
import { ForbiddenException } from '../../plugins/error.plugin';
import { validateObjectId } from '../../shared/utils/validation.utils';
import {
  requirePermission,
  requireAnyPermission,
} from '../../shared/constants/admin-permissions';

/** Reused literal union for `entityType` query/path params. */
const EntityTypeUnion = t.Union([
  t.Literal('USER'),
  t.Literal('GIG'),
  t.Literal('REVIEW'),
  t.Literal('BID'),
  t.Literal('APPLICATION'),
]);

/**
 * Reports Routes
 */
export const reportsRoutes = (reportsService: ReportsService) =>
  new Elysia({ prefix: '/reports' })
    .use(transformPlugin)

    /**
     * Create a report (Protected)
     */
    .post(
      '/',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const body = context.body as Parameters<typeof reportsService.createReport>[1];
        return await reportsService.createReport(user.userId, body);
      },
      {
        body: CreateReportSchema,
        detail: {
          tags: ['Reports'],
          summary: 'Create a report',
          description: 'Report a user, gig, review, or other content for violations',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get my reports (Protected)
     */
    .get(
      '/my',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const query = context.query as { status?: string; page?: string; limit?: string };
        return await reportsService.getMyReports(user.userId, {
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
          tags: ['Reports'],
          summary: 'Get my reports',
          description: 'Get reports you have submitted',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get report by ID (Protected - own reports or admin)
     */
    .get(
      '/:id',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'reportId');
        const isAdmin = user.role === UserRole.ADMIN;
        return await reportsService.getReport(id, user.userId, isAdmin);
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Reports'],
          summary: 'Get report by ID',
          description: 'Get details of a specific report',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Update own report (Protected - add more info)
     */
    .put(
      '/:id',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'reportId');
        const body = context.body as Parameters<typeof reportsService.updateReport>[2];
        return await reportsService.updateReport(id, user.userId, body);
      },
      {
        body: UpdateReportSchema,
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Reports'],
          summary: 'Update own report',
          description: 'Add more information or evidence to your report',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Admin: Search all reports.
     * Permission: VIEW_REPORTS
     */
    .get(
      '/admin/search',
      async (ctx) => {
        requireAnyPermission([
          AdminPermission.VIEW_REPORTS,
          AdminPermission.RESOLVE_REPORTS,
        ])(ctx);
        const context = ctx as RouteContext;
        const query = context.query;
        return await reportsService.searchReports(query as any);
      },
      {
        query: t.Object({
          category: t.Optional(t.String()),
          type: t.Optional(t.String()),
          status: t.Optional(t.String()),
          priority: t.Optional(t.String()),
          assignedTo: t.Optional(t.String()),
          reporter: t.Optional(t.String()),
          entityType: t.Optional(EntityTypeUnion),
          entityId: t.Optional(t.String()),
          sortBy: t.Optional(t.String()),
          sortOrder: t.Optional(t.String()),
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        detail: {
          tags: ['Reports', 'Admin'],
          summary: 'Admin: Search reports',
          description: 'Search and filter all reports with advanced options',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Admin: Get report statistics.
     * Permission: VIEW_REPORTS
     */
    .get(
      '/admin/stats',
      async (ctx) => {
        requirePermission(AdminPermission.VIEW_REPORTS)(ctx);
        return await reportsService.getReportStats();
      },
      {
        detail: {
          tags: ['Reports', 'Admin'],
          summary: 'Admin: Get report statistics',
          description: 'Get aggregated statistics about reports',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Admin: Get reports for an entity.
     * Permission: VIEW_REPORTS
     */
    .get(
      '/admin/entity/:entityType/:entityId',
      async (ctx) => {
        requirePermission(AdminPermission.VIEW_REPORTS)(ctx);
        const context = ctx as RouteContext;
        const { entityType, entityId } = context.params;
        validateObjectId(entityId, 'entityId');
        return await reportsService.getEntityReports(
          entityType as 'USER' | 'GIG' | 'REVIEW' | 'BID' | 'APPLICATION',
          entityId
        );
      },
      {
        params: t.Object({
          entityType: EntityTypeUnion,
          entityId: t.String({
            minLength: 24,
            maxLength: 24,
            pattern: '^[a-fA-F0-9]{24}$',
          }),
        }),
        detail: {
          tags: ['Reports', 'Admin'],
          summary: 'Admin: Get reports for an entity',
          description: 'Get all reports against a specific user, gig, or other entity',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Admin: Update report.
     * Permission: RESOLVE_REPORTS
     */
    .put(
      '/admin/:id',
      async (ctx) => {
        requirePermission(AdminPermission.RESOLVE_REPORTS)(ctx);
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'reportId');
        const body = context.body as Parameters<typeof reportsService.adminUpdateReport>[2];
        return await reportsService.adminUpdateReport(id, user.userId, body);
      },
      {
        body: AdminUpdateReportSchema,
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Reports', 'Admin'],
          summary: 'Admin: Update report',
          description: 'Update report status, priority, or assign to admin',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Admin: Resolve report.
     * Permission: RESOLVE_REPORTS
     */
    .post(
      '/admin/:id/resolve',
      async (ctx) => {
        requirePermission(AdminPermission.RESOLVE_REPORTS)(ctx);
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'reportId');
        const body = context.body as Parameters<typeof reportsService.resolveReport>[2];
        return await reportsService.resolveReport(id, user.userId, body);
      },
      {
        body: ResolveReportSchema,
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Reports', 'Admin'],
          summary: 'Admin: Resolve report',
          description: 'Resolve a report with an action (warning, ban, etc.)',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Admin: Delete report.
     * Permission: RESOLVE_REPORTS
     */
    .delete(
      '/admin/:id',
      async (ctx) => {
        requirePermission(AdminPermission.RESOLVE_REPORTS)(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'reportId');
        await reportsService.deleteReport(id);
        return { message: 'Report deleted successfully' };
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Reports', 'Admin'],
          summary: 'Admin: Delete report',
          description: 'Permanently delete a report',
          security: [{ BearerAuth: [] }],
        },
      }
    );
