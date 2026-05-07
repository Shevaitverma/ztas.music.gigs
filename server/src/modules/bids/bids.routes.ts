import { Elysia, t } from 'elysia';
import { BidsService } from './bids.service';
import { PlaceBidSchema, UpdateBidStatusSchema } from './bids.schemas';
import { UserRole, BidStatus } from '../../shared/enums';
import { getAuthUser, type RouteContext } from '../../shared/types/auth.types';
import { transformPlugin } from '../../plugins/transform.plugin';
import { ForbiddenException } from '../../plugins/error.plugin';
import { validateObjectId } from '../../shared/utils/validation.utils';

/**
 * Bids Routes - Reverse Auction System
 */
export const bidsRoutes = (bidsService: BidsService) =>
  new Elysia({ prefix: '/bids' })
    .use(transformPlugin)

    /**
     * Place a Bid (Artists only)
     * Reverse auction: must bid lower than current lowest
     */
    .post(
      '/',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ARTIST) {
          throw new ForbiddenException('Only artists can place bids');
        }
        const context = ctx as RouteContext;
        const bid = await bidsService.placeBid(user.userId, context.body);

        // Broadcast new bid to gig room
        const server = (ctx as any).server;
        if (server) {
          server.publish(`gig/${bid.gigId}`, JSON.stringify({
            type: 'BID_PLACED',
            data: bid,
          }));
          // Notify all artists who have bid on this gig that they may be outbid
          server.publish(`gig/${bid.gigId}/artists`, JSON.stringify({
            type: 'NEW_LOWER_BID',
            data: { gigId: bid.gigId, lowestAmount: bid.amount },
          }));
        }

        return bid;
      },
      {
        body: PlaceBidSchema,
        detail: {
          tags: ['Bids'],
          summary: 'Place a bid (reverse auction)',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Update Bid Amount (Artists only)
     * Can only update if outbid, must bid lower than current lowest
     */
    .put(
      '/:id/amount',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ARTIST) {
          throw new ForbiddenException('Only artists can update bids');
        }
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'bidId');
        const { amount } = context.body as { amount: number };

        const bid = await bidsService.updateBidAmount(id, user.userId, amount);

        // Broadcast updated bid
        const server = (ctx as any).server;
        if (server) {
          server.publish(`gig/${bid.gigId}`, JSON.stringify({
            type: 'BID_UPDATED',
            data: bid,
          }));
          server.publish(`gig/${bid.gigId}/artists`, JSON.stringify({
            type: 'NEW_LOWER_BID',
            data: { gigId: bid.gigId, lowestAmount: bid.amount },
          }));
        }

        return bid;
      },
      {
        body: t.Object({
          amount: t.Number({ minimum: 1 }),
        }),
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Bids'],
          summary: 'Update bid amount (only if outbid)',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Withdraw Bid (Artists only)
     * Can only withdraw if outbid
     */
    .delete(
      '/:id',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ARTIST) {
          throw new ForbiddenException('Only artists can withdraw bids');
        }
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'bidId');

        await bidsService.withdrawBid(id, user.userId);

        return { success: true, message: 'Bid withdrawn' };
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Bids'],
          summary: 'Withdraw bid (only if outbid)',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get Bids for Gig (Clients only)
     */
    .get(
      '/gig/:gigId',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { gigId } = context.params;
        validateObjectId(gigId, 'gigId');
        return await bidsService.getGigBids(gigId, user.userId);
      },
      {
        params: t.Object({
          gigId: t.String(),
        }),
        detail: {
          tags: ['Bids'],
          summary: 'Get bids for a gig (client only)',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get Artist's Bid Status on a Gig
     * Returns if artist has bid, if outbid, current lowest, etc.
     */
    .get(
      '/gig/:gigId/my-status',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ARTIST) {
          throw new ForbiddenException('Only artists can check bid status');
        }
        const context = ctx as RouteContext;
        const { gigId } = context.params;
        validateObjectId(gigId, 'gigId');
        return await bidsService.getArtistBidStatus(gigId, user.userId);
      },
      {
        params: t.Object({
          gigId: t.String(),
        }),
        detail: {
          tags: ['Bids'],
          summary: 'Get your bid status on a gig',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get IDs of gigs where artist has active bids
     * Used to filter out already-applied gigs from discover
     */
    .get(
      '/my/gig-ids',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ARTIST) {
          throw new ForbiddenException('Only artists can access bid gig IDs');
        }
        return await bidsService.getMyGigIds(user.userId);
      },
      {
        detail: {
          tags: ['Bids'],
          summary: 'Get gig IDs where artist has active bids',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get My Bids (Artists)
     */
    .get(
      '/my',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const { query } = ctx as RouteContext;
        return await bidsService.getMyBids(user.userId, query.status as BidStatus | undefined);
      },
      {
        query: t.Object({
          status: t.Optional(t.String()),
        }),
        detail: {
          tags: ['Bids'],
          summary: 'Get my bids (Artist)',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get Artist Dashboard Stats
     */
    .get(
      '/my/stats',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ARTIST) {
          throw new ForbiddenException('Only artists can access stats');
        }
        return await bidsService.getArtistStats(user.userId);
      },
      {
        detail: {
          tags: ['Bids'],
          summary: 'Get artist dashboard stats',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get Accepted Bids (Upcoming Events)
     */
    .get(
      '/my/accepted',
      async (ctx) => {
        const user = getAuthUser(ctx);
        if (user.role !== UserRole.ARTIST) {
          throw new ForbiddenException('Only artists can access accepted bids');
        }
        return await bidsService.getAcceptedBids(user.userId);
      },
      {
        detail: {
          tags: ['Bids'],
          summary: 'Get accepted bids (upcoming events)',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Get Single Bid by ID
     */
    .get(
      '/:id',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'bidId');
        return await bidsService.getBidById(id, user.userId);
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Bids'],
          summary: 'Get a single bid by ID',
          security: [{ BearerAuth: [] }],
        },
      }
    )

    /**
     * Update Bid Status (Accept/Reject - Clients only)
     */
    .put(
      '/:id/status',
      async (ctx) => {
        const user = getAuthUser(ctx);
        const context = ctx as RouteContext;
        const { id } = context.params;
        validateObjectId(id, 'bidId');
        const body = context.body as { status: BidStatus };
        const bid = await bidsService.updateBidStatus(id, user.userId, body.status);

        // Broadcast status update
        const server = (ctx as any).server;
        if (server) {
          server.publish(`gig/${bid.gigId}`, JSON.stringify({
            type: 'BID_STATUS_UPDATED',
            data: bid,
          }));
          // Notify the specific artist
          server.publish(`user/${bid.artistId}`, JSON.stringify({
            type: body.status === 'ACCEPTED' ? 'BID_ACCEPTED' : 'BID_REJECTED',
            data: bid,
          }));
        }

        return bid;
      },
      {
        body: UpdateBidStatusSchema,
        params: t.Object({
          id: t.String(),
        }),
        detail: {
          tags: ['Bids'],
          summary: 'Update bid status (Accept/Reject)',
          security: [{ BearerAuth: [] }],
        },
      }
    );
