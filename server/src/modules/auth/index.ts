import { Elysia } from 'elysia';
import { AuthService } from './auth.service';
import { authRoutes } from './auth.routes';

/**
 * Auth Module
 * Handles authentication and authorization
 */
export const authModule = () => {
  const authService = new AuthService();

  return new Elysia()
    .use(authRoutes(authService));
};

// Export types and schemas
export * from './auth.schemas';
export type { AuthService };
