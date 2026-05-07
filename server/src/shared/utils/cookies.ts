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
 *  - sameSite: 'lax'
 *  - path: '/'
 *  - secure: true in production, false in dev
 *  - no `domain` attribute (host-only)
 */

const ACCESS_TOKEN_MAX_AGE = 60 * 60; // 1h, matches JWT_EXPIRATION
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7d, matches JWT_REFRESH_EXPIRATION

const isProd = () => config.app.nodeEnv === 'production';

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

  cookie.accessToken?.set({
    value: tokens.accessToken,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE,
    secure,
  });

  cookie.refreshToken?.set({
    value: tokens.refreshToken,
    httpOnly: true,
    sameSite: 'lax',
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
  const expired = new Date(0);

  cookie.accessToken?.set({
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: expired,
    secure,
  });

  cookie.refreshToken?.set({
    value: '',
    httpOnly: true,
    sameSite: 'lax',
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
