import { describe, it, expect } from 'bun:test';

/**
 * Boot smoke test — guards the failure class that typecheck and unit tests miss.
 *
 * Context: `bun update` once pulled bson@7.3.1, which throws at *import* time on
 * Bun 1.3.14 (`NotImplementedError: node:v8 isBuildingSnapshot is not yet
 * implemented in Bun`). bson is mongoose -> mongodb -> bson, so the server could
 * not boot at all. Nothing about that is visible to `tsc`: the types are fine,
 * the runtime is not.
 *
 * This exercises the real import graph and the real plugin composition, without
 * needing MongoDB or Firebase. If a dependency (or a Bun upgrade) breaks module
 * loading or route registration, this fails in CI instead of in production.
 */

describe('boot smoke', () => {
  it('loads the full model graph (mongoose/bson import path)', async () => {
    const models = await import('../db/models');
    // Touch a model so the driver actually initialises rather than being
    // tree-shaken or lazily deferred.
    expect(models.GigModel.modelName).toBe('Gig');
  });

  it('composes the app without throwing', async () => {
    const { createApp } = await import('../app');
    expect(typeof createApp().handle).toBe('function');
  });

  it('serves /live without a database connection', async () => {
    const { createApp } = await import('../app');
    const res = await createApp().handle(new Request('http://localhost/live'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('serves /health and reports the database as down rather than crashing', async () => {
    const { createApp } = await import('../app');
    const res = await createApp().handle(new Request('http://localhost/health'));

    // No DB in CI, so degraded + 503 is the correct answer. The point is that
    // the handler runs and returns a well-formed body instead of throwing.
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; checks: { database: string } };
    expect(body.status).toBe('degraded');
    expect(body.checks.database).toBe('disconnected');
  });

  it('applies security headers to responses', async () => {
    // Elysia scoping check. `securityPlugin` is a NAMED plugin, and hooks in a
    // named plugin default to `local` scope — the trap that once stopped the
    // rate limiter from ever firing for parent-app routes. It now carries
    // `as: 'global'` (security.plugin.ts) and does fire; this asserts the
    // `.onRequest` headers hook does not share that fate either.
    const { createApp } = await import('../app');
    const res = await createApp().handle(new Request('http://localhost/live'));

    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('permissions-policy')).toBeTruthy();
  });

  it('stamps X-Request-ID on responses (logging plugin is globally scoped)', async () => {
    // `loggingPlugin` is NAMED, so its `.onAfterHandle` defaulted to local scope
    // and never ran for parent-app routes: no response log line, no request id.
    // `/live` and `/health` are deliberately skipped by the logger, so use `/`.
    const { createApp } = await import('../app');
    const res = await createApp().handle(new Request('http://localhost/'));

    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
  });

  it('mounts the versioned API surface', async () => {
    const { createApp } = await import('../app');
    // Unauthenticated, but the route must EXIST — a 404 here means the module
    // failed to register, which is the composition bug this test exists to catch.
    const res = await createApp().handle(
      new Request('http://localhost/api/v1/auth/me')
    );
    expect(res.status).not.toBe(404);
  });
});
