import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { config } from '../../config';
import { UserModel } from '../../db/models';
import { UserRole, UserStatus } from '../../shared/enums';
import type { JwtPayload } from '../../shared/types/auth.types';
import { logger } from '../../services/logger.service';

const wsLogger = logger.child('BidsWS');

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
    'Bids WS client used deprecated ?token= query auth; clients should send Authorization: Bearer <token>'
  );
}

/**
 * Bids WebSocket Gateway
 * Handles real-time connections for bid updates
 *
 * SECURITY (C3): Connections must present a valid JWT (via `?token=` query
 * param OR `Authorization: Bearer ...` header). Subscriptions are checked
 * against the authenticated user — no joining other users' rooms, no
 * artist-room joins from non-artists.
 *
 * Room types:
 * - gig/{gigId} - All updates for a specific gig (for clients viewing their gig)
 * - gig/{gigId}/artists - Notifications for artists bidding on a gig
 * - user/{userId} - Personal notifications for a user (bid accepted/rejected)
 */
export const bidsGateway = (app: Elysia) =>
  app
    .use(jwt({ name: 'jwt', secret: config.jwt.secret, exp: config.jwt.expiresIn }))
    .ws('/ws/bids', {
      body: t.Object({
        type: t.String(),
        payload: t.Optional(t.Any())
      }),
      detail: {
        tags: ['Bids'],
        summary: 'Bids WebSocket',
        description: 'Real-time bid updates. Join rooms to receive updates.',
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
          if (!user || user.status !== UserStatus.ACTIVE) {
            ws.close(1008, 'Account not active');
            return;
          }

          (ws.data as Record<string, unknown>).userId = subjectUserId;
          (ws.data as Record<string, unknown>).role = user.role;
        } catch (err) {
          wsLogger.warn('Bids WS auth failed', { err: (err as Error)?.message });
          ws.close(1008, 'Authentication failed');
        }
      },
      message(ws, message) {
        const userId = (ws.data as Record<string, unknown>).userId as string | undefined;
        const role = (ws.data as Record<string, unknown>).role as UserRole | undefined;
        if (!userId) {
          ws.close(1008, 'Unauthenticated');
          return;
        }

        const { type, payload } = message;

        switch (type) {
          case 'JOIN_GIG':
            // Client viewing their gig - gets all bid updates
            if (payload?.gigId) {
              const room = `gig/${payload.gigId}`;
              ws.subscribe(room);
              ws.send(JSON.stringify({ type: 'JOINED', room }));
            }
            break;

          case 'JOIN_GIG_AS_ARTIST':
            // Artist viewing a gig - gets outbid notifications
            if (role !== UserRole.ARTIST) {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Artist role required' }));
              break;
            }
            if (payload?.gigId) {
              const room = `gig/${payload.gigId}/artists`;
              ws.subscribe(room);
              ws.send(JSON.stringify({ type: 'JOINED', room }));
            }
            break;

          case 'JOIN_USER':
            // User subscribes to their personal notifications — must match the auth'd user.
            if (payload?.userId) {
              if (payload.userId !== userId) {
                ws.send(JSON.stringify({ type: 'ERROR', message: 'Cannot subscribe to another user\'s channel' }));
                break;
              }
              const room = `user/${payload.userId}`;
              ws.subscribe(room);
              ws.send(JSON.stringify({ type: 'JOINED', room }));
            }
            break;

          case 'LEAVE_GIG':
            if (payload?.gigId) {
              ws.unsubscribe(`gig/${payload.gigId}`);
              ws.unsubscribe(`gig/${payload.gigId}/artists`);
              ws.send(JSON.stringify({ type: 'LEFT', gigId: payload.gigId }));
            }
            break;

          case 'LEAVE_USER':
            if (payload?.userId && payload.userId === userId) {
              ws.unsubscribe(`user/${payload.userId}`);
              ws.send(JSON.stringify({ type: 'LEFT', userId: payload.userId }));
            }
            break;

          case 'PING':
            ws.send(JSON.stringify({ type: 'PONG' }));
            break;
        }
      },
      close() {
        // No-op; previous version used console.log which leaked nothing useful.
      },
    });
