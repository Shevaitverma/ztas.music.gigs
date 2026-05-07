import { Elysia } from 'elysia';
import { BidsService } from './bids.service';
import { bidsRoutes } from './bids.routes';
import { bidsGateway } from './bids.gateway';

/**
 * Bids Module
 */

export const bidsModule = () => {
  const bidsService = new BidsService();

  const app = new Elysia()
    .decorate('bidsService', bidsService)
    .use(bidsRoutes(bidsService));

  // Mount bids WebSocket gateway (auth-gated; see bids.gateway.ts)
  bidsGateway(app as unknown as Elysia);

  return app;
};

export * from './bids.schemas';
export * from './bids.service';
