import { describe, it, expect } from 'bun:test';
import { Elysia } from 'elysia';
import { securityPlugin } from '../plugins/security.plugin';

// CORS_ORIGIN in test/setup.ts is http://localhost:3000
const app = new Elysia().use(securityPlugin()).post('/x', () => 'ok').get('/x', () => 'ok');

const post = (headers: Record<string, string> = {}) =>
  app.handle(new Request('http://localhost/x', { method: 'POST', headers }));

describe('CSRF origin allowlist', () => {
  it('allows allowlisted Origin', async () => {
    expect((await post({ origin: 'http://localhost:3000' })).status).toBe(200);
  });

  it('blocks foreign Origin', async () => {
    expect((await post({ origin: 'https://evil.com' })).status).toBe(403);
  });

  it('falls back to Referer when Origin is absent', async () => {
    expect((await post({ referer: 'https://evil.com/attack.html' })).status).toBe(403);
    expect((await post({ referer: 'http://localhost:3000/page' })).status).toBe(200);
  });

  it('allows non-browser clients (neither header)', async () => {
    expect((await post()).status).toBe(200);
  });

  it('does not block GET from a foreign origin', async () => {
    const res = await app.handle(
      new Request('http://localhost/x', { headers: { origin: 'https://evil.com' } })
    );
    expect(res.status).toBe(200);
  });
});
