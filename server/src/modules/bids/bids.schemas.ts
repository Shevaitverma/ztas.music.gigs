import { t } from 'elysia';
import { BidStatus } from '../../shared/enums';

/**
 * Place Bid Schema
 *
 * `amount` must be a positive number — a ₹0 bid is rejected (the reverse-auction
 * floor must remain meaningful).
 */
export const PlaceBidSchema = t.Object({
  gigId: t.String(),
  amount: t.Number({ minimum: 1 }),
  currency: t.Optional(t.String({ default: 'INR' })),
  message: t.Optional(t.String({ maxLength: 500 })),
});

/**
 * Update Bid Status Schema (For Clients)
 */
export const UpdateBidStatusSchema = t.Object({
  status: t.Enum(BidStatus),
});

/**
 * Bid Query Schema
 */
export const BidQuerySchema = t.Object({
  gigId: t.Optional(t.String()), // Get bids for a gig
});

// Type exports
export type PlaceBidDto = typeof PlaceBidSchema.static;
export type UpdateBidStatusDto = typeof UpdateBidStatusSchema.static;
export type BidQueryDto = typeof BidQuerySchema.static;
