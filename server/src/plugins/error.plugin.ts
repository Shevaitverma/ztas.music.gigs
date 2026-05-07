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
 * Global Error Handling Plugin
 * Catches all errors and formats them consistently with NestJS-compatible format
 */
export const errorPlugin = () =>
  new Elysia({ name: 'error' }).onError(({ code, error, set, request }) => {
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
