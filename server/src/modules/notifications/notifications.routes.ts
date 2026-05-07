import { Elysia, t } from 'elysia';
import { NotificationsService } from './notifications.service';
import { getAuthUser, type RouteContext } from '../../shared/types/auth.types';
import { transformPlugin } from '../../plugins/transform.plugin';
import { validateObjectId } from '../../shared/utils/validation.utils';

/**
 * Notifications Routes
 *
 * SECURITY (H7): every endpoint requires authentication. Enforced declaratively
 * via `.guard({ beforeHandle: requireAuth })` so any future route added under
 * this prefix inherits the protection automatically.
 */
const requireAuth = (ctx: unknown) => {
  // Throws UnauthorizedException if not authenticated.
  getAuthUser(ctx);
};

export const notificationsRoutes = (notificationsService: NotificationsService) =>
  new Elysia({ prefix: '/notifications' })
    .use(transformPlugin)
    .guard(
      { beforeHandle: requireAuth },
      (app) =>
        app
          /**
           * Get user's notifications
           */
          .get(
            '/',
            async (ctx) => {
              const user = getAuthUser(ctx);
              const { query } = ctx;
              return await notificationsService.getNotifications(user.userId, {
                page: query.page ? parseInt(query.page) : 1,
                limit: query.limit ? parseInt(query.limit) : 20,
                unreadOnly: query.unreadOnly === 'true',
              });
            },
            {
              query: t.Object({
                page: t.Optional(t.String()),
                limit: t.Optional(t.String()),
                unreadOnly: t.Optional(t.String()),
              }),
              detail: {
                tags: ['Notifications'],
                summary: 'Get notifications',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Get unread count
           */
          .get(
            '/unread-count',
            async (ctx) => {
              const user = getAuthUser(ctx);
              return await notificationsService.getUnreadCount(user.userId);
            },
            {
              detail: {
                tags: ['Notifications'],
                summary: 'Get unread notification count',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Mark a notification as read
           */
          .put(
            '/:id/read',
            async (ctx) => {
              const user = getAuthUser(ctx);
              const context = ctx as RouteContext;
              const { id } = context.params;
              validateObjectId(id, 'notificationId');
              await notificationsService.markAsRead(id, user.userId);
              return { success: true };
            },
            {
              params: t.Object({
                id: t.String(),
              }),
              detail: {
                tags: ['Notifications'],
                summary: 'Mark notification as read',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Mark all notifications as read
           */
          .put(
            '/read-all',
            async (ctx) => {
              const user = getAuthUser(ctx);
              return await notificationsService.markAllAsRead(user.userId);
            },
            {
              detail: {
                tags: ['Notifications'],
                summary: 'Mark all notifications as read',
                security: [{ BearerAuth: [] }],
              },
            }
          )

          /**
           * Delete a notification
           */
          .delete(
            '/:id',
            async (ctx) => {
              const user = getAuthUser(ctx);
              const context = ctx as RouteContext;
              const { id } = context.params;
              validateObjectId(id, 'notificationId');
              await notificationsService.deleteNotification(id, user.userId);
              return { success: true, message: 'Notification deleted' };
            },
            {
              params: t.Object({
                id: t.String(),
              }),
              detail: {
                tags: ['Notifications'],
                summary: 'Delete a notification',
                security: [{ BearerAuth: [] }],
              },
            }
          )
    );
