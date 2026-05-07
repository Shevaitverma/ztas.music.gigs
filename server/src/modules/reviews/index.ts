import { Elysia } from 'elysia';
import { ReviewsService } from './reviews.service';
import { reviewsRoutes } from './reviews.routes';

/**
 * Reviews Module
 */
export const reviewsModule = () => {
  const reviewsService = new ReviewsService();

  return new Elysia()
    .decorate('reviewsService', reviewsService)
    .use(reviewsRoutes(reviewsService));
};

export { ReviewsService } from './reviews.service';
export { reviewsRoutes } from './reviews.routes';
export * from './reviews.schemas';
