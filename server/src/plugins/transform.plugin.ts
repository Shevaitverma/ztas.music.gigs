import { Elysia } from 'elysia';

/**
 * Sentinel attached to every wrapped response so we can detect "already
 * transformed" without false-positives from user-shaped objects that happen
 * to also have `success` + `timestamp` keys (L2).
 */
const TRANSFORM_MARKER = Symbol.for('zts.transform.v1');

/**
 * Standard API Response Interface
 */
export interface StandardResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  timestamp: string;
}

/**
 * Global Response Transform Plugin
 * Wraps all successful responses in a standard format.
 *
 * Idempotent: calling it on an already-wrapped response is a no-op (uses a
 * Symbol sentinel rather than relying on the shape of the returned object).
 */
// Named Elysia instance — Elysia dedupes plugins with the same `name`, so even
// if many feature modules `.use(transformPlugin)`, the onAfterHandle hook is
// registered exactly once per consumer chain (not N times).
export const transformPlugin = new Elysia({ name: 'transform' }).onAfterHandle(
  (context) => {
    if (!context) return;
    const { response, set, request } = context;

    // Safety check
    if (!set || !request) return;

    // Skip transformation for non-OK status codes
    const statusCode =
      typeof set.status === 'number' ? set.status : parseInt(String(set.status)) || 200;
    if (statusCode < 200 || statusCode >= 300) {
      return;
    }

    // Skip transformation for file downloads, streams, Response objects, or undefined/null
    if (
      !response ||
      response instanceof Blob ||
      response instanceof Response ||
      response instanceof ReadableStream
    ) {
      return;
    }

    // Skip if already transformed (sentinel — robust against shape collisions)
    if (
      typeof response === 'object' &&
      response !== null &&
      (response as Record<symbol, unknown>)[TRANSFORM_MARKER] === true
    ) {
      return;
    }

    // Ensure JSON content type
    set.headers['Content-Type'] = 'application/json';

    // Wrap in standard format
    const standardResponse: StandardResponse = {
      success: true,
      message:
        typeof response === 'object' && 'message' in response
          ? (response as any).message
          : 'Operation completed successfully',
      data: response,
      timestamp: new Date().toISOString(),
    };

    // Mark as transformed (non-enumerable so it doesn't leak into JSON output).
    Object.defineProperty(standardResponse, TRANSFORM_MARKER, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });

    return standardResponse;
  }
);

