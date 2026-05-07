import { Elysia } from 'elysia';
import { VenuesService } from './venues.service';
import { venuesRoutes } from './venues.routes';

/**
 * Venues Module
 */

export const venuesModule = () => {
  const venuesService = new VenuesService();

  return new Elysia()
    .decorate('venuesService', venuesService)
    .use(venuesRoutes(venuesService));
};

export * from './venues.schemas';
export * from './venues.service';
