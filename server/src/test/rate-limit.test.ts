import { describe, it, expect } from 'bun:test';
import { Elysia } from 'elysia';
import { securityPlugin } from '../plugins/security.plugin';

// GET so the CSRF hook short-circuits and only the rate limiter is exercised.
// No live Bun server means no socket IP, so every request shares one bucket.
const appWith = (rateLimitMode: 'off' | 'log' | 'enforce') =>
  new Elysia()
    .use(securityPlugin({ rateLimit: { max: 2, windowMs: 60_000 }, rateLimitMode }))
    .get('/x', () => 'ok');

const hit = (app: { handle: (r: Request) => Promise<Response> }) =>
  app.handle(new Request('http://localhost/x'));

describe('rate limiter modes', () => {
  it('log mode counts but never returns 429', async () => {
    const app = appWith('log');
    const statuses = [await hit(app), await hit(app), await hit(app), await hit(app)];
    expect(statuses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    // still computed everything — the headers prove the counter ran
    expect(statuses[3]!.headers.get('X-RateLimit-Limit')).toBe('2');
    expect(statuses[3]!.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('enforce mode returns 429 once the cap is exceeded', async () => {
    const app = appWith('enforce');
    expect((await hit(app)).status).toBe(200);
    expect((await hit(app)).status).toBe(200);
    const blocked = await hit(app);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });

  it('off mode does not count at all', async () => {
    const app = appWith('off');
    for (let i = 0; i < 5; i++) expect((await hit(app)).status).toBe(200);
    const res = await hit(app);
    expect(res.headers.get('X-RateLimit-Limit')).toBeNull();
  });
});
