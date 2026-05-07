import { Schema, model, Document, Types } from 'mongoose';
import { CheckInStatus } from '../../shared/enums';

/**
 * Artist Location - GPS coordinates captured during check-in
 */
export interface ArtistCheckInLocation {
  lat: number;
  lng: number;
  capturedAt: Date;
}

/**
 * Event End Confirmation - Both parties must confirm
 */
export interface EventEndConfirmation {
  organizerConfirmed: boolean;
  artistConfirmed: boolean;
  organizerEndedAt?: Date;
  artistEndedAt?: Date;
}

/**
 * EventCheckIn Interface
 * Tracks the check-in process for booked gigs
 */
export interface EventCheckIn extends Document {
  /** Reference to the gig */
  gig: Types.ObjectId;
  /** Reference to the accepted bid */
  bid: Types.ObjectId;
  /** The artist who was booked */
  artist: Types.ObjectId;
  /** The venue/client who posted the gig */
  organizer: Types.ObjectId;
  /** 6-digit OTP code */
  otp: string;
  /** When the OTP was generated */
  otpGeneratedAt: Date;
  /** When the OTP expires */
  otpExpiresAt: Date;
  /** Number of times OTP has been regenerated (max 3) */
  otpRegenerateCount: number;
  /** Failed OTP verification attempts in the current window */
  otpAttempts: number;
  /** When the record is locked from further OTP attempts (if any) */
  otpLockedUntil?: Date;
  /** Current status of the check-in */
  status: CheckInStatus;
  /** When the artist checked in */
  artistCheckedInAt?: Date;
  /** When the event started */
  eventStartedAt?: Date;
  /** When the event ended */
  eventEndedAt?: Date;
  /** End confirmation from both parties */
  endConfirmation?: EventEndConfirmation;
  /** Artist's GPS location captured during check-in (optional) */
  artistLocation?: ArtistCheckInLocation;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Artist Location Schema
 */
const ArtistLocationSchema = new Schema<ArtistCheckInLocation>(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    capturedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

/**
 * Event End Confirmation Schema
 */
const EventEndConfirmationSchema = new Schema<EventEndConfirmation>(
  {
    organizerConfirmed: { type: Boolean, default: false },
    artistConfirmed: { type: Boolean, default: false },
    organizerEndedAt: Date,
    artistEndedAt: Date,
  },
  { _id: false }
);

/**
 * EventCheckIn Schema
 */
const EventCheckInSchema = new Schema<EventCheckIn>(
  {
    gig: {
      type: Schema.Types.ObjectId,
      ref: 'Gig',
      required: true,
      // Note: unique index defined below at schema level
    },
    bid: {
      type: Schema.Types.ObjectId,
      ref: 'Bid',
      required: true,
    },
    artist: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    organizer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
      length: 6,
    },
    otpGeneratedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    otpExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    otpRegenerateCount: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },
    otpAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    otpLockedUntil: Date,
    status: {
      type: String,
      required: true,
      enum: Object.values(CheckInStatus),
      default: CheckInStatus.PENDING,
      index: true,
    },
    artistCheckedInAt: Date,
    eventStartedAt: Date,
    eventEndedAt: Date,
    endConfirmation: {
      type: EventEndConfirmationSchema,
      default: { organizerConfirmed: false, artistConfirmed: false },
    },
    artistLocation: {
      type: ArtistLocationSchema,
    },
  },
  { timestamps: true }
);

// Unique constraint: one check-in per gig
EventCheckInSchema.index({ gig: 1 }, { unique: true });

// Compound index for finding check-ins by status
EventCheckInSchema.index({ status: 1, otpExpiresAt: 1 });

// Index for artist's check-ins
EventCheckInSchema.index({ artist: 1, status: 1 });

// Index for organizer's check-ins
EventCheckInSchema.index({ organizer: 1, status: 1 });

/**
 * EventCheckIn Model
 */
export const EventCheckInModel = model<EventCheckIn>('EventCheckIn', EventCheckInSchema);
