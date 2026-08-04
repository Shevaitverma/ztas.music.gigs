import { Elysia } from 'elysia';
import { config } from '../config';

/**
 * Security Plugin Options
 */
export interface SecurityPluginOptions {
  rateLimit?: {
    max: number;        // Max requests per window
    windowMs: number;   // Time window in milliseconds
  };
  /**
   * Source IPs allowed to set X-Forwarded-For. If unset, falls back to
   * `config.trustedProxies` (default: 127.0.0.1, ::1).
   */
  trustedProxies?: string[];
  /**
   * Per-route overrides — keyed by `${METHOD} ${pathname}`. Pathnames are
   * matched literally; do not include trailing slashes. Example:
   * `'POST /api/v1/auth/login'`. Routes not in this map use the global
   * `rateLimit` config.
   */
  routeRateLimits?: Record<string, { max: number; windowMs: number }>;
  /**
   * Overrides `config.rateLimit.mode` (see RATE_LIMIT_MODE). Mainly for tests.
   */
  rateLimitMode?: 'off' | 'log' | 'enforce';
}

/**
 * Hard ceiling on the in-process counter map.
 *
 * ponytail: a single-process Map is the wrong shape for rate limiting — it
 * resets on deploy and does not aggregate across instances. Redis is the real
 * fix. Until then, cap the map so a distributed scan cannot OOM the process;
 * dropping counters is strictly better than dying.
 */
const MAX_CACHE_ENTRIES = 100_000;

/**
 * Rate Limit Entry
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Default per-route rate limits for authentication and write-heavy endpoints.
 *
 * SECURITY (M2): tighter caps for routes that are common abuse targets
 * (credential stuffing, OTP brute-force, bulk report/review spam, etc.).
 */
const DEFAULT_ROUTE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  // Auth — credential stuffing / OTP brute-force protection
  'POST /api/v1/auth/login':            { max: 5,  windowMs: 15 * 60 * 1000 },
  'POST /api/v1/auth/google/verify':    { max: 10, windowMs: 5 * 60 * 1000 },
  'POST /api/v1/auth/refresh':          { max: 30, windowMs: 60 * 1000 },
  // User-generated content
  'POST /api/v1/reviews':               { max: 5,  windowMs: 60 * 1000 },
  'POST /api/v1/reviews/':              { max: 5,  windowMs: 60 * 1000 },
  'POST /api/v1/reports':               { max: 5,  windowMs: 60 * 1000 },
  'POST /api/v1/reports/':              { max: 5,  windowMs: 60 * 1000 },
  // File uploads
  'POST /api/v1/users/profile/picture': { max: 5,  windowMs: 60 * 1000 },
  // Check-in OTP
  'POST /api/v1/checkin/verify-otp':    { max: 5,  windowMs: 5 * 60 * 1000 },
};

/**
 * Security Plugin
 * Provides:
 * - Security headers (helmet-like)
 * - Per-IP rate limiting (with per-route overrides), gated by RATE_LIMIT_MODE
 *   (`off` | `log` | `enforce`, default `log`)
 * - Request ID generation
 * - XSS protection
 *
 * SECURITY (M2): X-Forwarded-For is only honoured when the immediate source
 * IP is in `trustedProxies`. Direct connections from anywhere else are rate-
 * limited by their socket IP — preventing trivial bypass via a forged XFF.
 */
export const securityPlugin = (options: SecurityPluginOptions = {}) => {
  const cache = new Map<string, RateLimitEntry>();
  const maxRequests = options.rateLimit?.max ?? 100;
  const windowMs = options.rateLimit?.windowMs ?? 60000; // 1 minute default
  const trustedProxies = new Set(options.trustedProxies ?? config.trustedProxies);
  const routeLimits = { ...DEFAULT_ROUTE_LIMITS, ...(options.routeRateLimits || {}) };
  const mode = options.rateLimitMode ?? config.rateLimit.mode;

  // SECURITY (CSRF): cookies are SameSite=None in production, so a cross-site
  // form POST would otherwise carry the auth cookie. Same allowlist as CORS.
  const allowedOrigins = new Set(config.cors.origins);
  const originCheckDisabled = allowedOrigins.has('*');

  // Cleanup expired entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache.entries()) {
      if (now > entry.resetTime) {
        cache.delete(key);
      }
    }
  }, windowMs);

  // `seed` keeps Elysia's named-plugin dedupe from collapsing two instances
  // configured differently (tests construct several).
  return new Elysia({ name: 'security', seed: options })
    // NOTE: X-Request-ID is owned by logging.plugin (which sets it on every
    // response). The local `derive` that used to duplicate it here was
    // invisible to globally-scoped hooks, so it has been removed.

    // Add security headers on all responses
    .onRequest(({ set }) => {
      // Prevent MIME type sniffing
      set.headers['X-Content-Type-Options'] = 'nosniff';

      // Prevent clickjacking
      set.headers['X-Frame-Options'] = 'DENY';

      // XSS protection (legacy but still useful)
      set.headers['X-XSS-Protection'] = '1; mode=block';

      // Referrer policy
      set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';

      // Permissions policy
      set.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()';

      // HSTS (only in production)
      if (config.app.nodeEnv === 'production') {
        set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
      }
    })

    // CSRF: Origin/Referer allowlist for state-changing requests.
    .onBeforeHandle({ as: 'global' }, ({ request, set }) => {
      if (originCheckDisabled) return;
      if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;

      // Browsers always send Origin on cross-site writes; Referer is the
      // fallback for the rare same-site-only browser. If BOTH are missing the
      // caller is a non-browser client (curl, mobile app) which cannot be
      // CSRF'd — we allow it rather than break those clients.
      const origin = request.headers.get('origin') || originOf(request.headers.get('referer'));
      if (!origin || allowedOrigins.has(origin)) return;

      set.status = 403;
      return { statusCode: 403, error: 'Forbidden', message: 'Cross-site request blocked' };
    })

    // Rate limiting.
    // `as: 'global'` is REQUIRED: hooks on a *named* plugin default to local
    // scope, which is why this hook silently never ran before.
    .onBeforeHandle({ as: 'global' }, ({ request, set, server }) => {
      if (mode === 'off') return;

      // SECURITY (C4): the *socket peer* IP — taken from Bun's server, NOT
      // from any client-controlled header. This is the only IP we use to
      // decide whether XFF can be trusted. Without this, anyone could send
      // `X-Forwarded-For: 127.0.0.1` and bypass the rate limiter entirely.
      const peerIp = getSocketIp(request, server);

      let clientIp = peerIp;
      if (peerIp && trustedProxies.has(peerIp)) {
        // Peer is a trusted proxy — honour the leftmost XFF entry, falling
        // back to X-Real-IP, then the peer itself.
        const xff = request.headers.get('x-forwarded-for');
        const realIp = request.headers.get('x-real-ip');
        clientIp = xff?.split(',')[0]?.trim() || realIp || peerIp;
      }
      // If peer is NOT trusted, XFF is ignored entirely.
      if (!clientIp) clientIp = 'unknown';

      // Per-route override key.
      const url = new URL(request.url);
      const routeKey = `${request.method} ${url.pathname}`;
      const override = routeLimits[routeKey];
      const effectiveMax = override?.max ?? maxRequests;
      const effectiveWindow = override?.windowMs ?? windowMs;

      // Cache key includes route so per-route limits are independent.
      const cacheKey = override ? `${clientIp}|${routeKey}` : clientIp;

      const now = Date.now();
      let entry = cache.get(cacheKey);

      // Initialize or reset expired entry
      if (!entry || now > entry.resetTime) {
        if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
        entry = { count: 0, resetTime: now + effectiveWindow };
        cache.set(cacheKey, entry);
      }

      entry.count++;

      // Add rate limit headers
      set.headers['X-RateLimit-Limit'] = String(effectiveMax);
      set.headers['X-RateLimit-Remaining'] = String(Math.max(0, effectiveMax - entry.count));
      set.headers['X-RateLimit-Reset'] = String(Math.ceil(entry.resetTime / 1000));

      // Check if rate limit exceeded
      if (entry.count > effectiveMax) {
        if (mode === 'log') {
          // Observe-only: emit exactly what enforce would have blocked so the
          // caps can be tuned against real traffic before switching over.
          console.warn(
            `[RateLimit] WOULD BLOCK ${routeKey} from ${clientIp} — ${entry.count}/${effectiveMax} in ${effectiveWindow / 1000}s (mode=log)`
          );
          return;
        }

        set.status = 429;
        set.headers['Retry-After'] = String(Math.ceil((entry.resetTime - now) / 1000));

        return {
          statusCode: 429,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Maximum ${effectiveMax} requests per ${effectiveWindow / 1000} seconds.`,
          retryAfter: Math.ceil((entry.resetTime - now) / 1000),
        };
      }
    });
};

/** Origin (scheme://host[:port]) of a URL, or null if absent/unparseable. */
function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Returns the *true* socket peer IP using Bun's server adapter
 * (`server.requestIP(request)`). This value is NOT derived from any
 * client-controlled header, so it is safe to use as the basis for the
 * trusted-proxy decision in the rate limiter.
 *
 * If the server handle is unavailable (e.g. during tests where the request
 * was constructed by hand without a live Bun server), we return an empty
 * string and the caller treats it as untrusted. We deliberately do NOT fall
 * back to XFF/X-Real-IP here — that was the C4 bypass.
 */
function getSocketIp(request: Request, server?: { requestIP?: (req: Request) => { address: string } | null } | null): string {
  try {
    const peer = server?.requestIP?.(request);
    if (peer && typeof peer.address === 'string') {
      return peer.address.trim();
    }
  } catch {
    // ignore and fall through
  }
  return '';
}
