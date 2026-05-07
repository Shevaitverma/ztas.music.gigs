import { Elysia } from 'elysia';
import { ReportsService } from './reports.service';
import { reportsRoutes } from './reports.routes';

/**
 * Reports Module
 */
export const reportsModule = () => {
  const reportsService = new ReportsService();

  return new Elysia()
    .decorate('reportsService', reportsService)
    .use(reportsRoutes(reportsService));
};

export { ReportsService } from './reports.service';
export { reportsRoutes } from './reports.routes';
export * from './reports.schemas';
