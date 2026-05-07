import { Elysia } from 'elysia';
import { ApplicationsService } from './applications.service';
import { applicationsRoutes } from './applications.routes';

/**
 * Applications Module
 */

export const applicationsModule = () => {
  const applicationsService = new ApplicationsService();

  return new Elysia()
    .decorate('applicationsService', applicationsService)
    .use(applicationsRoutes(applicationsService));
};

export * from './applications.schemas';
export * from './applications.service';
