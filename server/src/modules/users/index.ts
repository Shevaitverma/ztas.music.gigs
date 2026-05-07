import { Elysia } from 'elysia';
import { UsersService } from './users.service';
import { usersRoutes } from './users.routes';

/**
 * Users Module
 */

export const usersModule = () => {
  const usersService = new UsersService();

  return new Elysia()
    .decorate('usersService', usersService)
    .use(usersRoutes(usersService));
};

export * from './users.schemas';
export * from './users.service';
