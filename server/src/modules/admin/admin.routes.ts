import { Elysia, t } from 'elysia';
import { AdminService, type AnalyticsPeriod } from './admin.service';
import { UpdateUserStatusSchema, VerifyUserSchema } from './admin.schemas';
import {
  UserRole,
  UserStatus,
  GigStatus,
  GigCategory,
  ActivityAction,
  ActivityCategory,
  TargetType,
  AdminPermission,
} from '../../shared/enums';
import { getAuthUser, type RouteContext } from '../../shared/types/auth.types';
import { transformPlugin } from '../../plugins/transform.plugin';
import { activityLogService } from '../../services/activity-log.service';
import {
  requireAdmin,
  requirePermission,
} from '../../shared/constants/admin-permissions';
import { validateEnum, parsePositiveInt, validateObjectId } from '../../shared/utils/validation.utils';

/**
 * Admin Routes
 */
export const adminRoutes = (adminService: AdminService) =>
  new Elysia({ prefix: '/admin' })
    .use(transformPlugin)
    /**
     * Guard: All routes require ADMIN role
     * Individual routes may have additional permission requirements
     */
    .guard(
      {
        beforeHandle: requireAdmin(),
      },
      (app) =>
        app
          /**
           * Get Platform Stats - MUST MATCH NESTJS: GET /admin/stats/platform
           */
          .get(
            '/stats/platform',
            async () => {
              return await adminService.getDashboardStats();
            },
            {
              detail: {
                tags: ['Admin'],
                summary: 'Get platform statistics',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Get Dashboard Stats (alias)
           */
          .get(
            '/stats',
            async () => {
              return await adminService.getDashboardStats();
            },
            {
              detail: {
                tags: ['Admin'],
                summary: 'Get dashboard statistics',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Get Recent Activities - MUST MATCH NESTJS: GET /admin/activities/recent
           */
          .get(
            '/activities/recent',
            async () => {
              return await adminService.getRecentActivity();
            },
            {
              query: t.Object({
                limit: t.Optional(t.String()),
                type: t.Optional(t.String()),
              }),
              detail: {
                tags: ['Admin'],
                summary: 'Get recent platform activities',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Get Recent Activity (alias)
           */
          .get(
            '/activity',
            async () => {
              return await adminService.getRecentActivity();
            },
            {
              detail: {
                tags: ['Admin'],
                summary: 'Get recent activity',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Get Revenue Reports - MUST MATCH NESTJS: GET /admin/reports/revenue
           */
          .get(
            '/reports/revenue',
            async ({ query }) => {
              // Mock implementation for now - implement proper logic later
              return {
                totalRevenue: 0,
                period: query.period || 'month',
                breakdown: [],
              };
            },
            {
              query: t.Object({
                period: t.Optional(t.String()),
                startDate: t.Optional(t.String()),
                endDate: t.Optional(t.String()),
              }),
              detail: {
                tags: ['Admin'],
                summary: 'Get revenue reports',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Get All Users - MUST MATCH NESTJS: GET /admin/users
           * Permission: VIEW_USERS
           */
          .get(
            '/users',
            async (ctx) => {
              requirePermission(AdminPermission.VIEW_USERS)(ctx);
              const { query } = ctx;
              return await adminService.getUsers({
                page: parsePositiveInt(query.page, 1),
                limit: parsePositiveInt(query.limit, 20, 100),
                role: validateEnum(query.role, UserRole, 'role'),
                status: validateEnum(query.status, UserStatus, 'status'),
                search: query.search,
                isVerified: query.isVerified === 'true' ? true : query.isVerified === 'false' ? false : undefined,
              });
            },
            {
              query: t.Object({
                page: t.Optional(t.String()),
                limit: t.Optional(t.String()),
                role: t.Optional(t.String()),
                status: t.Optional(t.String()),
                search: t.Optional(t.String()),
                isVerified: t.Optional(t.String()),
              }),
              detail: {
                tags: ['Admin'],
                summary: 'Get all users',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Get All Gigs - MUST MATCH NESTJS: GET /admin/gigs
           * Permission: VIEW_USERS (gig management)
           */
          .get(
            '/gigs',
            async (ctx) => {
              requirePermission(AdminPermission.VIEW_USERS)(ctx);
              const { query } = ctx;
              return await adminService.getGigs({
                page: parsePositiveInt(query.page, 1),
                limit: parsePositiveInt(query.limit, 20, 100),
                status: validateEnum(query.status, GigStatus, 'status'),
                category: validateEnum(query.category, GigCategory, 'category'),
                search: query.search,
                city: query.city,
              });
            },
            {
              query: t.Object({
                page: t.Optional(t.String()),
                limit: t.Optional(t.String()),
                status: t.Optional(t.String()),
                category: t.Optional(t.String()),
                search: t.Optional(t.String()),
                city: t.Optional(t.String()),
              }),
              detail: {
                tags: ['Admin'],
                summary: 'Get all gigs for moderation',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Update User Status (Ban/Suspend)
           * Permission: BAN_USERS
           */
          .put(
            '/users/:id/status',
            async (ctx) => {
              requirePermission(AdminPermission.BAN_USERS)(ctx);
              const { params, body } = ctx;
              const { id } = params;
              validateObjectId(id, 'userId');
              const { status, reason } = body as { status: UserStatus; reason?: string };
              const admin = getAuthUser(ctx);
              return await adminService.updateUserStatus(
                id,
                status,
                reason,
                admin.userId,
                admin.adminRole
              );
            },
            {
              body: UpdateUserStatusSchema,
              params: t.Object({
                id: t.String(),
              }),
              detail: {
                tags: ['Admin'],
                summary: 'Update user status',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Verify User
           * Permission: EDIT_USERS
           */
          .put(
            '/users/:id/verify',
            async (ctx) => {
              requirePermission(AdminPermission.EDIT_USERS)(ctx);
              const { params, body } = ctx;
              const { id } = params;
              validateObjectId(id, 'userId');
              const { isVerified } = body as { isVerified: boolean };
              const admin = getAuthUser(ctx);
              return await adminService.verifyUser(
                id,
                isVerified,
                admin.userId,
                admin.adminRole
              );
            },
            {
              body: VerifyUserSchema,
              params: t.Object({
                id: t.String(),
              }),
              detail: {
                tags: ['Admin'],
                summary: 'Verify/Unverify user',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          // ===================================
          // ACTIVITY LOGS ROUTES
          // ===================================

          /**
           * Search Activity Logs (Admin)
           * Permission: VIEW_ACTIVITY_LOGS
           */
          .get(
            '/activity-logs',
            async (ctx) => {
              requirePermission(AdminPermission.VIEW_ACTIVITY_LOGS)(ctx);
              const context = ctx as RouteContext;
              const query = context.query;
              return await activityLogService.searchLogs({
                userId: query.userId,
                action: query.action as ActivityAction | undefined,
                category: query.category as ActivityCategory | undefined,
                targetType: query.targetType as TargetType | undefined,
                targetId: query.targetId,
                startDate: query.startDate ? new Date(query.startDate) : undefined,
                endDate: query.endDate ? new Date(query.endDate) : undefined,
                page: parsePositiveInt(query.page, 1),
                limit: parsePositiveInt(query.limit, 50, 100),
              });
            },
            {
              query: t.Object({
                userId: t.Optional(t.String()),
                action: t.Optional(t.String()),
                category: t.Optional(t.String()),
                targetType: t.Optional(t.String()),
                targetId: t.Optional(t.String()),
                startDate: t.Optional(t.String()),
                endDate: t.Optional(t.String()),
                page: t.Optional(t.String()),
                limit: t.Optional(t.String()),
              }),
              detail: {
                tags: ['Admin', 'Activity Logs'],
                summary: 'Search activity logs',
                description: 'Search and filter activity logs with various criteria',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Get User Activity History (Admin)
           * Permission: VIEW_ACTIVITY_LOGS
           */
          .get(
            '/activity-logs/user/:userId',
            async (ctx) => {
              requirePermission(AdminPermission.VIEW_ACTIVITY_LOGS)(ctx);
              const context = ctx as RouteContext;
              const { userId } = context.params;
              validateObjectId(userId, 'userId');
              const query = context.query;
              const limit = parsePositiveInt(query.limit, 50, 100);
              return await activityLogService.getUserActivity(userId, limit);
            },
            {
              params: t.Object({
                userId: t.String(),
              }),
              query: t.Object({
                limit: t.Optional(t.String()),
              }),
              detail: {
                tags: ['Admin', 'Activity Logs'],
                summary: 'Get user activity history',
                description: 'Get activity history for a specific user',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Get Entity Activity History (Admin)
           * Permission: VIEW_ACTIVITY_LOGS
           */
          .get(
            '/activity-logs/entity/:targetType/:targetId',
            async (ctx) => {
              requirePermission(AdminPermission.VIEW_ACTIVITY_LOGS)(ctx);
              const context = ctx as RouteContext;
              const { targetType, targetId } = context.params;
              validateObjectId(targetId, 'targetId');
              const query = context.query;
              const limit = parsePositiveInt(query.limit, 50, 100);
              return await activityLogService.getEntityActivity(
                targetType as TargetType,
                targetId,
                limit
              );
            },
            {
              params: t.Object({
                targetType: t.String(),
                targetId: t.String(),
              }),
              query: t.Object({
                limit: t.Optional(t.String()),
              }),
              detail: {
                tags: ['Admin', 'Activity Logs'],
                summary: 'Get entity activity history',
                description: 'Get activity history for a specific entity (gig, review, etc.)',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          // ===================================
          // ANALYTICS ROUTES
          // ===================================

          /**
           * Get Analytics Dashboard
           * Permission: VIEW_ANALYTICS
           */
          .get(
            '/analytics/dashboard',
            async (ctx) => {
              requirePermission(AdminPermission.VIEW_ANALYTICS)(ctx);
              const { query } = ctx;
              const validPeriods = ['day', 'week', 'month', 'year'];
              const period = validPeriods.includes(query.period || '')
                ? (query.period as AnalyticsPeriod)
                : 'month';
              return await adminService.getAnalyticsDashboard(period);
            },
            {
              query: t.Object({
                period: t.Optional(t.String()),
              }),
              detail: {
                tags: ['Admin', 'Analytics'],
                summary: 'Get analytics dashboard',
                description: 'Get comprehensive analytics with period filter (day, week, month, year)',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Get User Analytics
           * Permission: VIEW_ANALYTICS
           */
          .get(
            '/analytics/users',
            async (ctx) => {
              requirePermission(AdminPermission.VIEW_ANALYTICS)(ctx);
              return await adminService.getUsersAnalytics();
            },
            {
              detail: {
                tags: ['Admin', 'Analytics'],
                summary: 'Get user analytics',
                description: 'Get user metrics including signups, verification rates, and role breakdown',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Get Gigs Analytics
           * Permission: VIEW_ANALYTICS
           */
          .get(
            '/analytics/gigs',
            async (ctx) => {
              requirePermission(AdminPermission.VIEW_ANALYTICS)(ctx);
              return await adminService.getGigsAnalytics();
            },
            {
              detail: {
                tags: ['Admin', 'Analytics'],
                summary: 'Get gigs analytics',
                description: 'Get gig metrics including status breakdown, category breakdown, and top cities',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Export Data
           * Permission: EXPORT_DATA
           */
          .get(
            '/analytics/export',
            async (ctx) => {
              requirePermission(AdminPermission.EXPORT_DATA)(ctx);
              const { query } = ctx;
              const limit = parsePositiveInt(query.limit, 1000, 10000);
              return await adminService.exportData(
                query.type as 'users' | 'gigs' | 'bids' | 'applications',
                undefined,
                limit
              );
            },
            {
              query: t.Object({
                type: t.String(),
                limit: t.Optional(t.String()),
              }),
              detail: {
                tags: ['Admin', 'Analytics'],
                summary: 'Export data',
                description: 'Export data as JSON (users, gigs, bids, applications). Max 10000 records.',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          // ===================================
          // STORAGE ROUTES
          // ===================================

          /**
           * Get Storage Statistics
           * Permission: VIEW_STORAGE
           */
          .get(
            '/storage/stats',
            async (ctx) => {
              requirePermission(AdminPermission.VIEW_STORAGE)(ctx);
              return await adminService.getStorageStats();
            },
            {
              detail: {
                tags: ['Admin', 'Storage'],
                summary: 'Get storage statistics',
                description: 'Get storage statistics including profile pictures, audio samples, and verification docs',
                security: [{ BearerAuth: [] }],
              },
            }
          )
    );
