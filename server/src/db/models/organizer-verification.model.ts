import { Schema, model, Document, Types } from 'mongoose';
import {
  VerificationStatus,
  IdentityDocType,
  BusinessType,
  VenueProofType,
} from '../../shared/enums';
import { encryptPii, decryptPii } from '../../shared/utils/crypto';

// Per-field AAD bindings prevent ciphertext from being moved between fields.
const aadIdentityNumber = (v: string | undefined | null) =>
  encryptPii(v, 'organizerVerifications.identity.number');
const aadIdentityNumberGet = (v: string | undefined | null) =>
  decryptPii(v, 'organizerVerifications.identity.number');
const aadGstNumber = (v: string | undefined | null) =>
  encryptPii(v, 'organizerVerifications.business.gstNumber');
const aadGstNumberGet = (v: string | undefined | null) =>
  decryptPii(v, 'organizerVerifications.business.gstNumber');
const aadPanNumber = (v: string | undefined | null) =>
  encryptPii(v, 'organizerVerifications.business.panNumber');
const aadPanNumberGet = (v: string | undefined | null) =>
  decryptPii(v, 'organizerVerifications.business.panNumber');

/**
 * Identity Verification Subdocument
 */
export interface IdentityVerification {
  type: IdentityDocType;
  number: string; // Should be encrypted at rest
  documentUrl: string;
  selfieUrl: string;
  status: VerificationStatus;
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
  rejectionReason?: string;
}

/**
 * Business Verification Subdocument
 */
export interface BusinessVerification {
  type: BusinessType;
  name: string;
  gstNumber?: string;
  panNumber: string;
  registrationDocUrl?: string;
  status: VerificationStatus;
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
  rejectionReason?: string;
}

/**
 * Venue Verification Subdocument
 */
export interface VenueVerification {
  name: string;
  address: string;
  city: string;
  proofType: VenueProofType;
  proofDocUrl: string;
  photosUrls: string[];
  coordinates: {
    lat: number;
    lng: number;
  };
  status: VerificationStatus;
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;
  rejectionReason?: string;
}

/**
 * OrganizerVerification Interface
 * Tracks verification status for organizers/clients
 */
export interface OrganizerVerification extends Document {
  user: Types.ObjectId;
  identity?: IdentityVerification;
  business?: BusinessVerification;
  venues: VenueVerification[];
  overallStatus: VerificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Identity Verification Schema.
 *
 * SECURITY (C6): `toObject`/`toJSON` enable getters so encrypted fields are
 * decrypted on read. The verification SERVICE is responsible for masking
 * decrypted values before returning them to clients (see services).
 */
const IdentityVerificationSchema = new Schema<IdentityVerification>(
  {
    type: {
      type: String,
      required: true,
      enum: Object.values(IdentityDocType),
    },
    // SECURITY (C6): identity number (Aadhaar/PAN/Passport) is encrypted at
    // rest with AES-256-GCM. set encrypts on assignment, get decrypts on read.
    number: {
      type: String,
      required: true,
      set: aadIdentityNumber,
      get: aadIdentityNumberGet,
    },
    documentUrl: {
      type: String,
      required: true,
    },
    selfieUrl: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.PENDING,
    },
    verifiedAt: Date,
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectionReason: String,
  },
  { _id: false, toObject: { getters: true }, toJSON: { getters: true } }
);

/**
 * Business Verification Schema
 */
const BusinessVerificationSchema = new Schema<BusinessVerification>(
  {
    type: {
      type: String,
      required: true,
      enum: Object.values(BusinessType),
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // SECURITY (C6): GST/PAN encrypted at rest.
    gstNumber: {
      type: String,
      trim: true,
      set: aadGstNumber,
      get: aadGstNumberGet,
    },
    panNumber: {
      type: String,
      required: true,
      trim: true,
      set: aadPanNumber,
      get: aadPanNumberGet,
    },
    registrationDocUrl: String,
    status: {
      type: String,
      required: true,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.PENDING,
    },
    verifiedAt: Date,
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectionReason: String,
  },
  { _id: false, toObject: { getters: true }, toJSON: { getters: true } }
);

/**
 * Venue Verification Schema
 */
const VenueVerificationSchema = new Schema<VenueVerification>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    proofType: {
      type: String,
      required: true,
      enum: Object.values(VenueProofType),
    },
    proofDocUrl: {
      type: String,
      required: true,
    },
    photosUrls: {
      type: [String],
      default: [],
      validate: [(v: string[]) => v.length <= 10, 'Max 10 photos allowed'],
    },
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.PENDING,
    },
    verifiedAt: Date,
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectionReason: String,
  },
  { _id: true }
);

/**
 * OrganizerVerification Schema
 */
const OrganizerVerificationSchema = new Schema<OrganizerVerification>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    identity: {
      type: IdentityVerificationSchema,
    },
    business: {
      type: BusinessVerificationSchema,
    },
    venues: {
      type: [VenueVerificationSchema],
      default: [],
    },
    overallStatus: {
      type: String,
      required: true,
      enum: Object.values(VerificationStatus),
      default: VerificationStatus.NOT_SUBMITTED,
      index: true,
    },
  },
  { timestamps: true }
);

// Index for admin queries
OrganizerVerificationSchema.index({ overallStatus: 1, updatedAt: -1 });

/**
 * Pre-save hook to calculate overall status
 */
OrganizerVerificationSchema.pre('save', function () {
  // Calculate overall status based on identity and business verification
  const hasIdentity = !!this.identity;
  const hasBusiness = !!this.business;

  if (!hasIdentity && !hasBusiness) {
    this.overallStatus = VerificationStatus.NOT_SUBMITTED;
    return;
  }

  const identityStatus = this.identity?.status || VerificationStatus.NOT_SUBMITTED;
  const businessStatus = this.business?.status || VerificationStatus.NOT_SUBMITTED;

  // If any is rejected, overall is rejected
  if (identityStatus === VerificationStatus.REJECTED || businessStatus === VerificationStatus.REJECTED) {
    this.overallStatus = VerificationStatus.REJECTED;
    return;
  }

  // If any is under review, overall is under review
  if (identityStatus === VerificationStatus.UNDER_REVIEW || businessStatus === VerificationStatus.UNDER_REVIEW) {
    this.overallStatus = VerificationStatus.UNDER_REVIEW;
    return;
  }

  // If any is pending, overall is pending
  if (identityStatus === VerificationStatus.PENDING || businessStatus === VerificationStatus.PENDING) {
    this.overallStatus = VerificationStatus.PENDING;
    return;
  }

  // Both must be verified for overall to be verified
  if (identityStatus === VerificationStatus.VERIFIED && businessStatus === VerificationStatus.VERIFIED) {
    this.overallStatus = VerificationStatus.VERIFIED;
    return;
  }

  // Otherwise, keep as not submitted or pending
  this.overallStatus = VerificationStatus.PENDING;
});

/**
 * OrganizerVerification Model
 */
export const OrganizerVerificationModel = model<OrganizerVerification>(
  'OrganizerVerification',
  OrganizerVerificationSchema
);
