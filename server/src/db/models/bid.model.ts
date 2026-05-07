import { Schema, model, Document, Types } from 'mongoose';
import { BidStatus } from '../../shared/enums';

/**
 * Bid Interface
 * Represents an artist's bid on a gig
 */
export interface Bid extends Document {
  gigId: Types.ObjectId;
  artistId: Types.ObjectId;
  amount: number;
  currency: string;
  message?: string;
  status: BidStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Bid Schema
 */
const BidSchema = new Schema<Bid>(
  {
    gigId: { type: Schema.Types.ObjectId, ref: 'Gig', required: true, index: true },
    artistId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    message: { type: String, trim: true, maxlength: 500 },
    status: {
      type: String,
      required: true,
      enum: Object.values(BidStatus),
      default: BidStatus.PENDING,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound indexes for efficient queries
BidSchema.index({ gigId: 1, status: 1 });
BidSchema.index({ artistId: 1, status: 1 });
BidSchema.index({ gigId: 1, artistId: 1 }, { unique: true }); // One bid per artist per gig
BidSchema.index({ createdAt: -1 });

/**
 * Bid Model
 */
export const BidModel = model<Bid>('Bid', BidSchema);
