import * as Sentry from '@sentry/bun';
import { Elysia } from 'elysia';
import {
  HttpException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '../shared/errors/custom-errors';

/**
 * Helper to safely get error message
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Unknown error';
}

/**
 * Helper to safely get error stack
 */
function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack;
  return undefined;
}

/**
 * Routes whose request bodies carry credentials, OTPs or identity documents.
 * Their bodies are dropped wholesale rather than field-by-field — a denylist
 * of field names goes stale the moment someone adds a parameter.
 */
const SENSITIVE_PATH = /\/(auth|verification)\b/i;

/**
 * Value-based PII patterns. Deliberately NOT a key denylist — the leak vectors
 * that actually ship (a Mongoose ValidationError naming `aadhaarNumber`, a
 * decrypt error echoing ciphertext) are free-text strings where no key exists,
 * and a denylist goes stale the moment someone adds a field.
 */
const PII_PATTERNS: RegExp[] = [
  // Aadhaar: 12 digits, optionally grouped 4-4-4 by space or hyphen.
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
  // PAN: ABCDE1234F
  /\b[A-Z]{5}\d{4}[A-Z]\b/g,
  // JWT
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  // Our own PII ciphertext envelope (crypto.ts ENCRYPTED_PREFIX).
  /enc:v1:[A-Za-z0-9+/=]+/g,
  // Bare long base64 blobs. 60+ chars with no separator: long enough that
  // filesystem paths and stack frames in traces do not trip it.
  /\b[A-Za-z0-9+/]{60,}={0,2}/g,
];

const REDACTED = '[redacted]';
const MAX_SCRUB_DEPTH = 6;

function redactString(s: string): string {
  let out = s;
  for (const re of PII_PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

/**
 * Recursively rewrite every string in `value` through the PII patterns.
 * Depth-capped so a self-referential or pathologically deep payload cannot
 * stall `beforeSend`; a `seen` set keeps cycles from looping forever.
 */
function scrubDeep(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactString(value);
  if (depth >= MAX_SCRUB_DEPTH || value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return value;
  seen.add(value as object);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = scrubDeep(value[i], depth + 1, seen);
    return value;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const v = (value as Record<string, unknown>)[key];
    (value as Record<string, unknown>)[key] = scrubDeep(v, depth + 1, seen);
  }
  return value;
}

/**
 * Sentry `beforeSend`: strip session tokens and PII before anything leaves the
 * process. Exported so it can be unit-tested and wired in `src/index.ts`.
 */
export function scrubSentryEvent<T extends Record<string, any>>(event: T): T {
  // With `sendDefaultPii:false` the request body is usually empty — the PII that
  // actually ships rides in exception messages, extra, contexts and breadcrumbs.
  for (const field of ['exception', 'extra', 'contexts', 'breadcrumbs', 'message', 'tags'] as const) {
    if (event[field] !== undefined) {
      (event as Record<string, unknown>)[field] = scrubDeep(event[field]);
    }
  }

  const req = event.request;
  if (!req) return event;

  if (req.headers && typeof req.headers === 'object') {
    for (const key of Object.keys(req.headers)) {
      const lower = key.toLowerCase();
      if (lower === 'cookie' || lower === 'set-cookie' || lower === 'authorization') {
        req.headers[key] = '[scrubbed]';
      }
    }
  }
  delete req.cookies;

  if (typeof req.url === 'string' && SENSITIVE_PATH.test(req.url)) {
    if (req.data !== undefined) req.data = '[scrubbed]';
    if (req.query_string !== undefined) req.query_string = '[scrubbed]';
  }

  scrubDeep(req);

  return event;
}

/**
 * Global Error Handling Plugin
 * Catches all errors and formats them consistently with NestJS-compatible format
 */
export const errorPlugin = () =>
  // `as: 'global'`: same named-plugin scoping trap as security/logging — without
  // it this handler only covers routes declared on the (empty) plugin instance.
  new Elysia({ name: 'error' }).onError({ as: 'global' }, ({ code, error, set, request }) => {
    const timestamp = new Date().toISOString();
    const path = new URL(request.url).pathname;

    // Log the error for debugging
    if (error instanceof HttpException || code !== 'VALIDATION') {
      console.error(
        `[${timestamp}] Error ${error instanceof HttpException ? error.status : code}:`,
        getErrorMessage(error)
      );
      // SECURITY (L8): default to PRODUCTION-safe behavior; only emit stack
      // traces when NODE_ENV is explicitly 'development'.
      if (process.env.NODE_ENV === 'development') {
        console.error(getErrorStack(error));
      }
    }

    // Handle Mongoose CastError (e.g., invalid ObjectId reaching findById/findOne).
    // Routes SHOULD validate path params via `validateObjectId` first, but if a
    // bad value escapes that net we want a clean 400 instead of a generic 500.
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'CastError'
    ) {
      const e = error as { path?: string; value?: unknown; kind?: string };
      set.status = 400;
      return {
        statusCode: 400,
        message: `Invalid ${e.path ?? 'identifier'} format`,
        error: 'Bad Request',
        timestamp,
        path,
      };
    }

    // Handle custom HTTP exceptions
    if (error instanceof HttpException) {
      set.status = error.status;
      return {
        statusCode: error.status,
        message: error.message,
        error: error.name.replace('Exception', '').replace('Http', ''),
        timestamp,
        path,
      };
    }

    // Handle Elysia built-in errors
    switch (code) {
      case 'VALIDATION': {
        set.status = 400;
        return {
          statusCode: 400,
          message: 'Validation failed',
          error: 'Bad Request',
          details: (error as any).all || [],
          timestamp,
          path,
        };
      }

      case 'NOT_FOUND': {
        set.status = 404;
        return {
          statusCode: 404,
          message: 'Route not found',
          error: 'Not Found',
          timestamp,
          path,
        };
      }

      case 'PARSE': {
        set.status = 400;
        return {
          statusCode: 400,
          message: 'Failed to parse request body',
          error: 'Bad Request',
          timestamp,
          path,
        };
      }

      case 'UNKNOWN': {
        console.error(`[${timestamp}] UNKNOWN ERROR:`, error);
        // No-op unless SENTRY_DSN was set at boot.
        Sentry.captureException(error, { tags: { path, code } });
        set.status = 500;
        return {
          statusCode: 500,
          // SECURITY (L8): production-safe default. The detailed message is
          // only returned when NODE_ENV is explicitly 'development'.
          message:
            process.env.NODE_ENV === 'development'
              ? getErrorMessage(error) || 'Unknown error occurred'
              : 'Internal server error',
          error: 'Internal Server Error',
          timestamp,
          path,
        };
      }

      default: {
        console.error(`[${timestamp}] UNHANDLED ERROR (${code}):`, error);
        Sentry.captureException(error, { tags: { path, code } });
        set.status = 500;
        return {
          statusCode: 500,
          // SECURITY (L8): production-safe default — only expose details in
          // explicit 'development' env.
          message:
            process.env.NODE_ENV === 'development'
              ? getErrorMessage(error) || 'An unexpected error occurred'
              : 'Internal server error',
          error: 'Internal Server Error',
          timestamp,
          path,
        };
      }
    }
  });

// Export all error classes for convenience
export {
  HttpException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
};
