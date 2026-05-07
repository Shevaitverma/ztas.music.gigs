import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { config } from '../../config';
import { UserModel } from '../../db/models';
import { UserRole, UserStatus } from '../../shared/enums';
import type { JwtPayload } from '../../shared/types/auth.types';
import { logger } from '../../services/logger.service';

const wsLogger = logger.child('AdminWS');

/**
 * Rate-limited deprecation warning for clients still passing the JWT via
 * `?token=` query string. Logs at most once per `DEPRECATION_WARN_INTERVAL_MS`
 * to avoid log spam in production where many WS connections may fall through.
 */
const DEPRECATION_WARN_INTERVAL_MS = 60_000; // 1 minute
let lastQueryTokenWarnAt = 0;
function warnQueryTokenDeprecation() {
  const now = Date.now();
  if (now - lastQueryTokenWarnAt < DEPRECATION_WARN_INTERVAL_MS) return;
  lastQueryTokenWarnAt = now;
  wsLogger.warn(
    'Admin WS client used deprecated ?token= query auth; clients should send Authorization: Bearer <token>'
  );
}

/**
 * Admin WebSocket Gateway
 *
 * SECURITY (C2): Connections must present a valid JWT (via `?token=` query
 * param OR `Authorization: Bearer ...` header). The token is verified, the
 * user is loaded from the DB, and ADMIN role + ACTIVE status are required.
 * Otherwise the socket is closed with code 1008 (policy violation).
 */
export const adminGateway = (app: Elysia) =>
  app
    .use(jwt({ name: 'jwt', secret: config.jwt.secret, exp: config.jwt.expiresIn }))
    .ws('/admin/ws', {
      body: t.Object({
        type: t.String(),
        payload: t.Optional(t.Any())
      }),
      detail: {
        tags: ['Admin'],
        summary: 'Admin WebSocket',
        description: 'Subscribe to admin dashboard updates. Requires Admin role.',
      },
      async open(ws) {
        try {
          const data = ws.data as {
            jwt: { verify: (t: string) => Promise<unknown | false> };
            query?: Record<string, string | undefined>;
            headers?: Record<string, string | undefined>;
          };

          const tokenFromQuery = data.query?.token;
          const ticketFromQuery = data.query?.ticket;
          const authHeader = data.headers?.authorization;
          const tokenFromHeader = authHeader?.startsWith('Bearer ')
            ? authHeader.substring(7)
            : undefined;
          // Preferred order: Authorization header > ?ticket= (short-lived
          // ws-ticket JWT) > ?token= (legacy access JWT, deprecated path).
          const token = tokenFromHeader || ticketFromQuery || tokenFromQuery;
          if (!tokenFromHeader && !ticketFromQuery && tokenFromQuery) {
            warnQueryTokenDeprecation();
          }

          if (!token) {
            ws.close(1008, 'Authentication required');
            return;
          }

          const payload = (await data.jwt.verify(token)) as
            | (JwtPayload & { uid?: string })
            | false;
          if (!payload) {
            ws.close(1008, 'Invalid token');
            return;
          }

          // Resolve subject userId from either an access token (`sub`) or a
          // ws-ticket (`uid`). Anything else is rejected.
          let subjectUserId: string | undefined;
          if ((payload as JwtPayload).type === 'access') {
            subjectUserId = (payload as JwtPayload).sub;
          } else if ((payload as { type?: string }).type === 'ws-ticket') {
            subjectUserId = (payload as { uid?: string }).uid;
          }

          if (!subjectUserId) {
            ws.close(1008, 'Invalid token');
            return;
          }

          const user = await UserModel.findById(subjectUserId).select('role status').lean().exec();
          if (!user || user.status !== UserStatus.ACTIVE || user.role !== UserRole.ADMIN) {
            ws.close(1008, 'Admin access required');
            return;
          }

          // Bind authenticated user identity onto the socket so message
          // handlers can rely on it without re-verifying.
          (ws.data as Record<string, unknown>).userId = subjectUserId;
          (ws.data as Record<string, unknown>).role = user.role;
        } catch (err) {
          wsLogger.warn('Admin WS auth failed', { err: (err as Error)?.message });
          ws.close(1008, 'Authentication failed');
        }
      },
      message(ws, message) {
        const userId = (ws.data as Record<string, unknown>).userId;
        if (!userId) {
          ws.close(1008, 'Unauthenticated');
          return;
        }

        const { type } = message;

        if (type === 'SUBSCRIBE_DASHBOARD') {
          const room = 'admin-dashboard';
          ws.subscribe(room);
          ws.send({ type: 'SUBSCRIBED', room });
        }
      },
    });
