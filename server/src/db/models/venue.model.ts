import { Schema, model, Document, Types } from 'mongoose';

/**
 * Venue Params Interface
 */
export interface VenueParams {
  capacity?: number;
  hasSoundSystem?: boolean;
  hasStage?: boolean;
  hasLighting?: boolean;
}

/**
 * Venue Interface
 */
export interface Venue extends Document {
  name: string;
  address: string;
  city: string;
  state?: string;
  pincode?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  owner: Types.ObjectId;
  params: VenueParams;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Venue Params Schema
 */
const VenueParamsSchema = new Schema<VenueParams>(
  {
    capacity: { type: Number, default: 0 },
    hasSoundSystem: { type: Boolean, default: false },
    hasStage: { type: Boolean, default: false },
    hasLighting: { type: Boolean, default: false },
  },
  { _id: false }
);

/**
 * Venue Schema
 */
const VenueSchema = new Schema<Venue>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, index: true },
    state: String,
    pincode: String,
    coordinates: {
      type: {
        lat: Number,
        lng: Number,
      },
    },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    params: { type: VenueParamsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

// Prevent duplicate venue names for same owner
VenueSchema.index({ owner: 1, name: 1 }, { unique: true });

// Text search on name and city
VenueSchema.index({ name: 'text', city: 'text' });

/**
 * Venue Model
 */
export const VenueModel = model<Venue>('Venue', VenueSchema);
