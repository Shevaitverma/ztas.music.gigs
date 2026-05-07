import { Schema, model, Document, Types } from 'mongoose';
import { GigStatus, GigCategory } from '../../shared/enums';

/**
 * GeoJSON Point for geospatial queries
 */
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

/**
 * Venue Location subdocument
 */
export interface VenueLocation {
  name: string;
  address: string;
  city: string;
  state?: string;
  pincode?: string;
  /** Legacy coordinates format (for backward compatibility) */
  coordinates?: {
    lat: number;
    lng: number;
  };
  /** GeoJSON format for geospatial queries */
  geoPoint?: GeoPoint;
}

/**
 * Budget Range subdocument
 */
export interface BudgetRange {
  min: number;
  max: number;
  currency: string;
}

/**
 * Event Timing subdocument
 */
export interface EventTiming {
  date: Date;
  startTime: string; // Format: "HH:mm" (24-hour)
  endTime: string; // Format: "HH:mm" (24-hour)
  durationMinutes: number;
}

/**
 * Gig Interface
 */
export interface Gig extends Document {
  title: string;
  description: string;
  category: GigCategory;
  budget: BudgetRange;
  venue: VenueLocation;
  eventTiming: EventTiming;
  images: string[];
  postedBy: Types.ObjectId;
  status: GigStatus;
  requirements?: string;
  equipmentProvided: string[];
  preferredGenres: string[];
  viewCount: number;
  applicationCount: number;
  bidCount: number;
  /** @deprecated Use acceptedBid/acceptedArtist for bids system */
  acceptedApplicant?: Types.ObjectId;
  /** The accepted bid for this gig (reverse auction winner) */
  acceptedBid?: Types.ObjectId;
  /** The artist whose bid was accepted */
  acceptedArtist?: Types.ObjectId;
  isFlagged?: boolean;
  flagReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * GeoPoint Schema for 2dsphere index
 */
const GeoPointSchema = new Schema(
  {
    type: { type: String, default: 'Point', enum: ['Point'] },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
  },
  { _id: false }
);

/**
 * Venue Location Schema
 */
const VenueLocationSchema = new Schema<VenueLocation>(
  {
    name: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true, index: true },
    state: String,
    pincode: String,
    // Legacy format for backward compatibility
    coordinates: {
      type: {
        lat: Number,
        lng: Number,
      },
    },
    // GeoJSON format for geospatial queries
    geoPoint: { type: GeoPointSchema, index: '2dsphere' },
  },
  { _id: false }
);

/**
 * Budget Range Schema
 */
const BudgetRangeSchema = new Schema<BudgetRange>(
  {
    min: { type: Number, required: true, min: 0 },
    max: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
  },
  { _id: false }
);

/**
 * Event Timing Schema
 */
const EventTimingSchema = new Schema<EventTiming>(
  {
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    durationMinutes: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

/**
 * Gig Schema
 */
const GigSchema = new Schema<Gig>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    category: {
      type: String,
      required: true,
      enum: Object.values(GigCategory),
      index: true,
    },
    budget: { type: BudgetRangeSchema, required: true },
    venue: { type: VenueLocationSchema, required: true },
    eventTiming: { type: EventTimingSchema, required: true },
    images: { type: [String], default: [] },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: Object.values(GigStatus),
      default: GigStatus.DRAFT,
      index: true,
    },
    requirements: { type: String, trim: true, maxlength: 1000 },
    equipmentProvided: { type: [String], default: [] },
    preferredGenres: { type: [String], default: [] },
    viewCount: { type: Number, default: 0, min: 0 },
    applicationCount: { type: Number, default: 0, min: 0 },
    bidCount: { type: Number, default: 0, min: 0 },
    acceptedApplicant: { type: Schema.Types.ObjectId, ref: 'User' },
    acceptedBid: { type: Schema.Types.ObjectId, ref: 'Bid' },
    acceptedArtist: { type: Schema.Types.ObjectId, ref: 'User' },
    isFlagged: { type: Boolean, default: false },
    flagReason: String,
  },
  { timestamps: true }
);

// Compound indexes for efficient queries
GigSchema.index({ 'venue.city': 1, status: 1, 'eventTiming.date': 1 });
GigSchema.index({ status: 1, createdAt: -1 });
GigSchema.index({ postedBy: 1, status: 1 });
GigSchema.index({ category: 1, status: 1 });

// Text index for search
GigSchema.index({ title: 'text', description: 'text' });

// Note: Geospatial index for venue.geoPoint is defined inline in VenueLocationSchema

/**
 * Gig Model
 */
export const GigModel = model<Gig>('Gig', GigSchema);
