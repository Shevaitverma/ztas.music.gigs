import { Schema, model, Document } from 'mongoose';
import {
  UserRole,
  UserStatus,
  AuthProvider,
  AdminRole,
  PerformanceType,
  MusicGenre,
  Instrument,
  PerformanceLanguage,
} from '../../shared/enums';

/**
 * GeoJSON Point for location storage
 * MongoDB uses [longitude, latitude] format
 */
export interface GeoPoint {
  type: string;
  coordinates: number[]; // [longitude, latitude]
}

/**
 * Location subdocument with geospatial data
 */
export interface UserLocation {
  geoPoint?: GeoPoint;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
}

/**
 * Audio sample subdocument
 */
export interface AudioSample {
  url: string;
  title?: string;
  durationSeconds?: number;
  fileSizeBytes?: number;
}

/**
 * Artist Profile subdocument - Complete profile for artists
 */
export interface ArtistProfile {
  stageName?: string;
  bio?: string;
  performanceTypes?: PerformanceType[];
  genres?: MusicGenre[];
  instruments?: Instrument[];
  languages?: PerformanceLanguage[];
  audioSamples?: AudioSample[];
  videoLinks?: string[];
  portfolioImages?: string[];
  yearsOfExperience?: number;
  notablePerformances?: string;
  preferredCities?: string[];
  baseRate?: number;
  instagramHandle?: string;
  youtubeChannel?: string;
  whatsappNumber?: string;
  location?: UserLocation;
  onboardingComplete?: boolean;
}

/**
 * Client Profile subdocument
 */
export interface ClientProfile {
  company?: string;
  location?: UserLocation;
  industry?: string;
}

/**
 * User Interface
 */
export interface User extends Document {
  firebaseUid: string;
  email?: string;
  phoneNumber?: string;
  name?: string;
  profilePicture?: string;
  role: UserRole;
  /**
   * Granular admin role (only meaningful when `role === ADMIN`).
   * Null/undefined for non-admin users; for legacy admins without a role,
   * `requirePermission` defaults to MODERATOR (least-privilege).
   */
  adminRole?: AdminRole | null;
  authProvider: AuthProvider;
  status: UserStatus;
  statusReason?: string;
  isVerified?: boolean;
  joinedAt: Date;
  lastLogin: Date;
  artistProfile?: ArtistProfile;
  clientProfile?: ClientProfile;
  password?: string;
  refreshToken?: string;
  /**
   * Failed login counter for email/password admin login (M3 anti-enumeration / throttling).
   */
  loginAttempts?: number;
  /** Timestamp of the most recent failed login (used to roll the 15-min window). */
  lastFailedLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * GeoPoint Schema
 */
const GeoPointSchema = new Schema<GeoPoint>(
  {
    type: { type: String, default: 'Point', enum: ['Point'] },
    coordinates: { type: [Number], required: true },
  },
  { _id: false }
);

/**
 * Location Schema
 */
const UserLocationSchema = new Schema<UserLocation>(
  {
    geoPoint: { type: GeoPointSchema, index: '2dsphere' },
    address: String,
    city: { type: String, index: true },
    state: String,
    country: String,
    pincode: String,
  },
  { _id: false }
);

/**
 * Audio Sample Schema
 */
const AudioSampleSchema = new Schema<AudioSample>(
  {
    url: { type: String, required: true },
    title: String,
    durationSeconds: { type: Number, max: 30 },
    fileSizeBytes: { type: Number, max: 5242880 }, // 5MB max
  },
  { _id: false }
);

/**
 * Artist Profile Schema
 */
const ArtistProfileSchema = new Schema<ArtistProfile>(
  {
    stageName: { type: String, trim: true, maxlength: 100 },
    bio: { type: String, trim: true, maxlength: 500 },
    performanceTypes: { type: [String], enum: Object.values(PerformanceType), default: [] },
    genres: { type: [String], enum: Object.values(MusicGenre), default: [] },
    instruments: { type: [String], enum: Object.values(Instrument), default: [] },
    languages: { type: [String], enum: Object.values(PerformanceLanguage), default: [] },
    audioSamples: {
      type: [AudioSampleSchema],
      default: [],
      validate: [(v: AudioSample[]) => v.length <= 3, 'Max 3 audio samples'],
    },
    videoLinks: { type: [String], default: [] },
    portfolioImages: {
      type: [String],
      default: [],
      validate: [(v: string[]) => v.length <= 5, 'Max 5 portfolio images'],
    },
    yearsOfExperience: { type: Number, min: 0, max: 50 },
    notablePerformances: { type: String, trim: true, maxlength: 500 },
    preferredCities: { type: [String], default: [] },
    baseRate: { type: Number, min: 0 },
    instagramHandle: { type: String, trim: true },
    youtubeChannel: { type: String, trim: true },
    whatsappNumber: { type: String, trim: true },
    location: { type: UserLocationSchema },
    onboardingComplete: { type: Boolean, default: false },
  },
  { _id: false }
);

/**
 * Client Profile Schema
 */
const ClientProfileSchema = new Schema<ClientProfile>(
  {
    company: String,
    location: { type: UserLocationSchema },
    industry: String,
  },
  { _id: false }
);

/**
 * User Schema
 */
const UserSchema = new Schema<User>(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    email: { type: String, sparse: true, index: true },
    phoneNumber: { type: String, unique: true, sparse: true, index: true },
    name: String,
    profilePicture: String,
    role: {
      type: String,
      required: true,
      enum: Object.values(UserRole),
      index: true,
    },
    adminRole: {
      type: String,
      enum: [...Object.values(AdminRole), null],
      default: null,
    },
    authProvider: {
      type: String,
      required: true,
      enum: Object.values(AuthProvider),
    },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ACTIVE,
    },
    statusReason: String,
    isVerified: { type: Boolean, default: false },
    joinedAt: { type: Date, required: true, default: Date.now },
    lastLogin: { type: Date, required: true, default: Date.now },
    artistProfile: { type: ArtistProfileSchema },
    clientProfile: { type: ClientProfileSchema },
    password: { type: String, select: false }, // Do not return password by default
    refreshToken: { type: String, select: false }, // Do not return by default
    loginAttempts: { type: Number, default: 0, select: false },
    lastFailedLoginAt: { type: Date, select: false },
  },
  { timestamps: true }
);

// Additional indexes (firebaseUid, email, role already have index: true in schema)
UserSchema.index({ status: 1 });
UserSchema.index({ createdAt: -1 });

// Index for finding artists by city
UserSchema.index({ 'artistProfile.location.city': 1, role: 1 });

// NOTE: 2dsphere index on `artistProfile.location.geoPoint` is declared at the
// schema field level (see UserLocationSchema → geoPoint: { ..., index: '2dsphere' }).
// Do NOT redeclare it here — Mongoose would emit a "Duplicate schema index"
// warning at boot.

/**
 * User Model
 */
export const UserModel = model<User>('User', UserSchema);
