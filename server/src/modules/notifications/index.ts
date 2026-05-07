import { Elysia } from 'elysia';
import { NotificationsService } from './notifications.service';
import { notificationsRoutes } from './notifications.routes';

/**
 * Notifications Module
 */
export const notificationsModule = () => {
  const notificationsService = new NotificationsService();

  return new Elysia()
    .decorate('notificationsService', notificationsService)
    .use(notificationsRoutes(notificationsService));
};

export * from './notifications.service';
