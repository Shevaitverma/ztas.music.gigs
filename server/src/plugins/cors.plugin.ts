import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { config } from '../config';

/**
 * CORS Plugin Configuration.
 *
 * SECURITY (M1): in production, wildcard origin (`*`) with `credentials: true`
 * is rejected at startup — config.ts already enforces this — so by the time
 * we reach this plugin, the origin list is non-wildcard in prod. In dev, we
 * still allow `*` (no credentials problem because dev origins use credentials
 * intentionally only with explicit lists).
 */
export const corsPlugin = (allowedOrigins: string[] = ['*']) => {
  const isWildcard =
    allowedOrigins.length === 0 ||
    (allowedOrigins.length === 1 && allowedOrigins[0] === '*');

  if (config.app.nodeEnv === 'production' && isWildcard) {
    // Belt-and-braces: should already be caught in config.ts, but never let
    // a wildcard CORS + credentials slip into a production build.
    throw new Error(
      'CORS: wildcard origin with credentials is not allowed in production'
    );
  }

  const origin = isWildcard ? true : allowedOrigins;

  return new Elysia({ name: 'cors' }).use(
    cors({
      origin,
      credentials: true,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-ID'],
      exposeHeaders: ['Content-Length', 'Content-Type', 'X-Request-ID'],
      maxAge: 86400, // 24 hours
    })
  );
};
