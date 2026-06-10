import { config } from '../../config';

/**
 * Auth cookie helpers.
 *
 * Mirrors the `accessToken` / `refreshToken` JSON pair that auth endpoints
 * already return: cookies are issued additively so that legacy Bearer-token
 * clients keep working while browser clients can rely on httpOnly cookies.
 *
 * Cross-team contract (binding for both server and frontend):
 *  - Cookie names: `accessToken` (1h), `refreshToken` (7d)
 *  - httpOnly: true
 *  - sameSite: 'none' in production, 'lax' in dev
 *  - path: '/'
 *  - secure: true in production, false in dev
 *  - no `domain` attribute (host-only)
 *
 * The frontend (gigs.ztas.in) and API (gigs-api.zoef.org) live on different
 * registrable domains, so the auth cookie is cross-site. A `SameSite=Lax`
 * cookie is never attached to cross-site XHR/fetch, which is why /auth/me
 * returned 401 right after /auth/google/verify succeeded. `SameSite=None`
 * (which the browser only honours alongside `Secure`) is required for the
 * cookie to ride cross-site requests. In dev we stay on 'lax' because plain
 * http://localhost can't set Secure, and None without Secure is rejected.
 */

const ACCESS_TOKEN_MAX_AGE = 60 * 60; // 1h, matches JWT_EXPIRATION
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7d, matches JWT_REFRESH_EXPIRATION

const isProd = () => config.app.nodeEnv === 'production';

// Cross-site cookies require SameSite=None + Secure; dev over http uses Lax.
const sameSitePolicy = (): 'lax' | 'none' => (isProd() ? 'none' : 'lax');

/**
 * Elysia 1.x exposes per-request cookies as a record of `Cookie<T>` slots,
 * each with `.set({ value, ... })`, `.value`, and `.remove()`. We only depend
 * on the minimal surface here so the helper is decoupled from the framework's
 * full Cookie type.
 */
export interface CookieSlot {
  set: (opts: {
    value: string;
    httpOnly?: boolean;
    sameSite?: 'lax' | 'strict' | 'none' | boolean;
    path?: string;
    maxAge?: number;
    secure?: boolean;
    expires?: Date;
    domain?: string;
  }) => void;
  value?: string;
  remove?: () => void;
}

export type CookieJar = Record<string, CookieSlot>;

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Set both auth cookies with the agreed attributes. Additive — the caller
 * still returns the JSON token pair in the response body for legacy clients.
 */
export function setAuthCookies(cookie: CookieJar, tokens: AuthTokenPair): void {
  const secure = isProd();
  const sameSite = sameSitePolicy();

  cookie.accessToken?.set({
    value: tokens.accessToken,
    httpOnly: true,
    sameSite,
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE,
    secure,
  });

  cookie.refreshToken?.set({
    value: tokens.refreshToken,
    httpOnly: true,
    sameSite,
    path: '/',
    maxAge: REFRESH_TOKEN_MAX_AGE,
    secure,
  });
}

/**
 * Clear both auth cookies. Used by /auth/logout. Idempotent.
 */
export function clearAuthCookies(cookie: CookieJar): void {
  const secure = isProd();
  const sameSite = sameSitePolicy();
  const expired = new Date(0);

  cookie.accessToken?.set({
    value: '',
    httpOnly: true,
    sameSite,
    path: '/',
    maxAge: 0,
    expires: expired,
    secure,
  });

  cookie.refreshToken?.set({
    value: '',
    httpOnly: true,
    sameSite,
    path: '/',
    maxAge: 0,
    expires: expired,
    secure,
  });
}

/**
 * Read a cookie value by name from the Elysia cookie jar. Returns undefined
 * if not present.
 */
export function readCookie(cookie: CookieJar | undefined, name: string): string | undefined {
  if (!cookie) return undefined;
  const slot = cookie[name];
  if (!slot) return undefined;
  const v = slot.value;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
