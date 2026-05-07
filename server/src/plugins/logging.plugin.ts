import { Elysia } from 'elysia';
import { config } from '../config';

/**
 * Log Entry Interface
 */
interface LogEntry {
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  status?: number;
  duration?: string;
  userAgent?: string;
  ip?: string;
}

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
 * Color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Get status color based on HTTP status code
 */
function getStatusColor(status: number): string {
  if (status >= 500) return colors.red;
  if (status >= 400) return colors.red;
  if (status >= 300) return colors.yellow;
  return colors.green;
}

/**
 * Global Logging Plugin
 * Enhanced with:
 * - Bun.nanoseconds() for microsecond precision timing
 * - Request ID tracking
 * - Structured JSON logging for production
 * - Human-readable colored logs for development
 */
export const loggingPlugin = () =>
  new Elysia({ name: 'logging' })
    .onRequest(({ request }) => {
      const url = new URL(request.url);
      const method = request.method;
      const path = url.pathname + url.search;

      // Skip logging for health checks and static files
      if (path === '/health' || path === '/live' || path === '/ready') {
        return;
      }

      // Generate request metadata
      const requestId = crypto.randomUUID().slice(0, 8);
      const startTime = Bun.nanoseconds();

      // Extract client IP
      const forwarded = request.headers.get('x-forwarded-for');
      const realIp = request.headers.get('x-real-ip');
      const clientIp = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';

      // Attach to request for later retrieval (workaround for Elysia lifecycle)
      (request as Request & { _requestMeta?: { startTime: number; requestId: string; clientIp: string } })._requestMeta = {
        startTime,
        requestId,
        clientIp,
      };

      if (config.app.nodeEnv === 'development') {
        // Human-readable format for development
        console.log(
          `${colors.gray}[${new Date().toISOString()}]${colors.reset} ${colors.cyan}[${requestId}]${colors.reset} ${colors.yellow}→${colors.reset} ${method} ${path}`
        );
      } else {
        // Structured JSON for production (log aggregators)
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          requestId,
          method,
          path,
          ip: clientIp,
          userAgent: request.headers.get('user-agent') || undefined,
        };
        console.log(JSON.stringify(entry));
      }
    })

    .onAfterHandle(({ request, set }) => {
      const url = new URL(request.url);
      const method = request.method;
      const path = url.pathname + url.search;

      // Skip logging for health checks
      if (path === '/health' || path === '/live' || path === '/ready') {
        return;
      }

      // Retrieve request metadata
      const meta = (request as Request & { _requestMeta?: { startTime: number; requestId: string; clientIp: string } })._requestMeta;

      const requestId = meta?.requestId || 'unknown';
      const startTime = meta?.startTime;

      // Calculate duration in milliseconds with microsecond precision
      const duration = startTime
        ? ((Bun.nanoseconds() - startTime) / 1_000_000).toFixed(2)
        : '0.00';

      // Get status code
      const status = typeof set.status === 'number' ? set.status : 200;

      // Add request ID to response headers
      set.headers['X-Request-ID'] = requestId;

      if (config.app.nodeEnv === 'development') {
        // Color-coded status for development
        const statusColor = getStatusColor(status);

        console.log(
          `${colors.gray}[${new Date().toISOString()}]${colors.reset} ${colors.cyan}[${requestId}]${colors.reset} ${colors.green}←${colors.reset} ${method} ${path} ${statusColor}${status}${colors.reset} ${colors.gray}${duration}ms${colors.reset}`
        );
      } else {
        // Structured JSON for production
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          requestId,
          method,
          path,
          status,
          duration: `${duration}ms`,
        }));
      }
    })

    .onError(({ request, error, set }) => {
      const url = new URL(request.url);
      const method = request.method;
      const path = url.pathname + url.search;

      // Retrieve request metadata
      const meta = (request as Request & { _requestMeta?: { startTime: number; requestId: string; clientIp: string } })._requestMeta;

      const requestId = meta?.requestId || 'unknown';
      const startTime = meta?.startTime;

      const duration = startTime
        ? ((Bun.nanoseconds() - startTime) / 1_000_000).toFixed(2)
        : '0.00';

      // Get status code from set or default to 500
      const status = typeof set.status === 'number' ? set.status : 500;

      if (config.app.nodeEnv === 'development') {
        console.error(
          `${colors.gray}[${new Date().toISOString()}]${colors.reset} ${colors.cyan}[${requestId}]${colors.reset} ${colors.red}✗${colors.reset} ${method} ${path} ${colors.red}${status}${colors.reset} ${colors.gray}${duration}ms${colors.reset} - ${colors.red}${getErrorMessage(error)}${colors.reset}`
        );
      } else {
        console.error(JSON.stringify({
          timestamp: new Date().toISOString(),
          requestId,
          method,
          path,
          status,
          duration: `${duration}ms`,
          error: getErrorMessage(error),
          stack: getErrorStack(error),
        }));
      }
    });
