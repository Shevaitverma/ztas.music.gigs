import { Elysia } from 'elysia';
import { GigsService } from './gigs.service';
import { gigsRoutes } from './gigs.routes';

/**
 * Gigs Module
 */

export const gigsModule = () => {
  const gigsService = new GigsService();

  return new Elysia()
    .decorate('gigsService', gigsService)
    .use(gigsRoutes(gigsService));
};

export * from './gigs.schemas';
export * from './gigs.service';
