import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';

/**
 * Swagger/OpenAPI Documentation Plugin
 */
export const swaggerPlugin = () =>
  new Elysia({ name: 'swagger' }).use(
    swagger({
      path: '/api/docs',
      scalarConfig: {
        spec: {
          url: '/api/docs/json', // Absolute path to the OpenAPI JSON
        },
      },
      documentation: {
        info: {
          title: 'ZTS Music Platform API',
          version: '1.0.0',
          description: 'API documentation for ZTS Music Platform - connecting Artists with Clients for gig opportunities',
        },
        tags: [
          { name: 'Auth', description: 'Authentication endpoints (Firebase + JWT)' },
          { name: 'Users', description: 'User profile management' },
          { name: 'Gigs', description: 'Gig posting and discovery' },
          { name: 'Bids', description: 'Real-time bidding system' },
          { name: 'Applications', description: 'Application management' },
          { name: 'Venues', description: 'Venue management' },
          { name: 'Admin', description: 'Admin operations' },
        ],
        components: {
          securitySchemes: {
            BearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
              description: 'JWT access token from /auth/google/verify',
            },
          },
        },
      },
    })
  );
