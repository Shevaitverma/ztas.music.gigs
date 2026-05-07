import { Elysia } from 'elysia';
import { AdminService } from './admin.service';
import { adminRoutes } from './admin.routes';
import { adminGateway } from './admin.gateway';

/**
 * Admin Module
 */

export const adminModule = () => {
  const adminService = new AdminService();

  const app = new Elysia()
    .decorate('adminService', adminService)
    .use(adminRoutes(adminService));

  // Mount admin WebSocket gateway (auth-gated; see admin.gateway.ts)
  adminGateway(app as unknown as Elysia);

  return app;
};

export * from './admin.schemas';
export * from './admin.service';
